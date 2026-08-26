using System.Text.RegularExpressions;
using BugsManaged.Api.Data;
using BugsManaged.Api.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace BugsManaged.Api.Services.GoogleChat;

/// <summary>
/// Task 3 and Task 4 — the ticket-lifecycle side of the Google Chat integration.
/// Runs only from <see cref="GoogleChatDispatcher"/> (outbound) and the webhook
/// controller (inbound), never on a user-facing request path.
///
/// Every query here uses IgnoreQueryFilters with an explicit OrganizationId.
/// The dispatcher runs outside any HTTP request, so IOrgContext has no current
/// organization and the global query filters would match nothing — the org comes
/// from the job instead.
/// </summary>
public class GoogleChatNotifier
{
    private readonly BugsManagedDbContext _db;
    private readonly GoogleChatApiClient _api;
    private readonly NotificationService _raw;
    private readonly IWebHostEnvironment _environment;
    private readonly GoogleChatOptions _options;
    private readonly ILogger<GoogleChatNotifier> _log;
    private readonly string _dashboardBaseUrl;

    public GoogleChatNotifier(
        BugsManagedDbContext db,
        GoogleChatApiClient api,
        NotificationService raw,
        IWebHostEnvironment environment,
        IOptions<GoogleChatOptions> options,
        IConfiguration config,
        ILogger<GoogleChatNotifier> log)
    {
        _db = db;
        _api = api;
        _raw = raw;
        _environment = environment;
        _options = options.Value;
        _log = log;
        _dashboardBaseUrl = (config["BugsManaged:DashboardBaseUrl"] ?? "https://bugout.managedplatform.com")
            .TrimEnd('/');
    }

    // ───────────────────────── outbound ─────────────────────────

    public async Task HandleAsync(GoogleChatJob job, CancellationToken ct = default)
    {
        var ticket = await _db.Tickets.IgnoreQueryFilters()
            .FirstOrDefaultAsync(t => t.Id == job.TicketId
                                   && t.OrganizationId == job.OrganizationId, ct);

        if (ticket == null)
        {
            _log.LogWarning("Google Chat job {Kind} skipped — ticket {TicketId} not found",
                job.Kind, job.TicketId);
            return;
        }

        if (!await _api.IsConfiguredAsync(ticket.OrganizationId))
        {
            _log.LogDebug("Google Chat not configured for organization {Org} — job {Kind} skipped " +
                          "(the email notification still went out)", ticket.OrganizationId, job.Kind);
            return;
        }

        switch (job.Kind)
        {
            case GoogleChatJobKind.TicketCreated:
                await OnTicketCreatedAsync(ticket, ct);
                break;
            case GoogleChatJobKind.TicketResolved:
                await OnTicketResolvedAsync(ticket, ct);
                break;
            case GoogleChatJobKind.NoteAdded:
                await OnNoteAddedAsync(ticket, job, ct);
                break;
        }
    }

    private async Task OnTicketCreatedAsync(Ticket ticket, CancellationToken ct)
    {
        var space = await EnsureSpaceForClientAsync(ticket, ct);
        if (space == null) return;

        var text =
            $"Hi — we've received ticket #{ticket.Id}{TenantLabel(ticket)}: {Sanitize(ticket.Title)}. " +
            $"We'll update you here. {TicketUrl(ticket)}";

        await PostAsync(ticket, space, text, ct);
    }

    private async Task OnTicketResolvedAsync(Ticket ticket, CancellationToken ct)
    {
        var space = await EnsureSpaceForClientAsync(ticket, ct);
        if (space == null) return;

        var resolution = string.IsNullOrWhiteSpace(ticket.Resolution)
            ? string.Empty
            : $" {Sanitize(ticket.Resolution)}";

        var verb = ticket.Status == "CLOSED" ? "closed" : "resolved";
        var text =
            $"✅ Your ticket #{ticket.Id}{TenantLabel(ticket)} — {Sanitize(ticket.Title)} — has been {verb}.{resolution} " +
            $"Reply here if anything is still off. {TicketUrl(ticket)}";

        await PostAsync(ticket, space, text, ct);
    }

    private async Task OnNoteAddedAsync(Ticket ticket, GoogleChatJob job, CancellationToken ct)
    {
        var note = await _db.TicketNotes.IgnoreQueryFilters()
            .FirstOrDefaultAsync(n => n.Id == job.NoteId
                                   && n.OrganizationId == ticket.OrganizationId, ct);

        if (note == null) return;

        // Belt and braces against a loop: a comment that arrived *from* Chat must
        // never be echoed back into the Space it came from.
        if (note.Source == "GOOGLE_CHAT") return;

        var space = await EnsureSpaceForClientAsync(ticket, ct);
        if (space == null) return;

        var author = Sanitize(note.AuthorName ?? note.AuthorEmail);
        var text =
            $"💬 New comment on ticket #{ticket.Id}{TenantLabel(ticket)} — {Sanitize(ticket.Title)}\n" +
            $"From {author} at {Stamp(note.CreatedAt)}:\n{Sanitize(note.Content)}\n{TicketUrl(ticket)}";

        var sent = await PostAsync(ticket, space, text, ct);

        // Records which Chat message mirrors this comment. Doubles as a guard: if
        // Chat ever delivers our own message back as an event, the inbound path
        // finds this note and skips it instead of duplicating the comment.
        if (sent != null && string.IsNullOrWhiteSpace(note.GoogleChatMessageName))
        {
            note.GoogleChatMessageName = sent.MessageName;
            await _db.SaveChangesAsync(ct);
        }
    }

    /// <summary>
    /// Posts into the ticket's thread inside the client's Space and persists the
    /// resolved thread resource name, which is what lets an inbound reply be
    /// matched back to this exact ticket.
    /// </summary>
    private async Task<GoogleChatApiClient.SentMessage?> PostAsync(
        Ticket ticket, GoogleChatSpace space, string text, CancellationToken ct)
    {
        // Only reuse a stored thread name if it belongs to this Space — a thread
        // is scoped to its Space and Chat rejects one from anywhere else.
        var threadName = !string.IsNullOrWhiteSpace(ticket.GoogleChatThreadName)
                         && ticket.GoogleChatThreadName.StartsWith($"{space.SpaceName}/", StringComparison.Ordinal)
            ? ticket.GoogleChatThreadName
            : null;

        var sent = await _api.PostMessageAsync(
            ticket.OrganizationId,
            space.SpaceName,
            text,
            card: null,             // hook for a cardsV2 payload later
            threadKey: $"ticket-{ticket.Id}",
            threadName: threadName,
            ct: ct);

        if (sent == null) return null;

        var dirty = false;

        if (!string.IsNullOrWhiteSpace(sent.ThreadName) && ticket.GoogleChatThreadName != sent.ThreadName)
        {
            ticket.GoogleChatThreadName = sent.ThreadName;
            dirty = true;
        }

        space.LastMessageAt = DateTime.UtcNow;
        dirty = true;

        if (dirty) await _db.SaveChangesAsync(ct);
        return sent;
    }

    /// <summary>
    /// The client's Space, created on their first ticket and reused for every one
    /// after. Returns null — without throwing — when the ticket has no client
    /// email or Google refused the creation.
    /// </summary>
    public async Task<GoogleChatSpace?> EnsureSpaceForClientAsync(Ticket ticket, CancellationToken ct = default)
    {
        var clientEmail = NormalizeEmail(ticket.SubmittedBy);
        if (clientEmail == null)
        {
            _log.LogInformation("Ticket {Id} has no submitter email — no Google Chat space to create",
                ticket.Id);
            return null;
        }

        var existing = await FindSpaceAsync(ticket.OrganizationId, clientEmail, ct);
        if (existing != null)
        {
            // Retry an invite that never landed, so a client blocked by a policy
            // the first time gets picked up without a manual step.
            if (!existing.InviteSent)
            {
                existing.InviteSent = await _api.AddMemberAsync(
                    ticket.OrganizationId, existing.SpaceName, clientEmail, ct);
                if (existing.InviteSent) await _db.SaveChangesAsync(ct);
            }

            return existing;
        }

        var project = await _db.Projects.IgnoreQueryFilters()
            .FirstOrDefaultAsync(p => p.Id == ticket.ProjectId, ct);

        var displayName = $"{project?.Name ?? "Support"} — {clientEmail}";
        if (!_environment.IsProduction())
            displayName = _options.NonProductionSpacePrefix + displayName;
        if (displayName.Length > 128) displayName = displayName[..128];

        var created = await _api.CreateSpaceForClientAsync(
            ticket.OrganizationId, clientEmail, displayName, ct);

        if (created == null) return null;

        var row = new GoogleChatSpace
        {
            OrganizationId = ticket.OrganizationId,
            SpaceName = created.SpaceName,
            MemberEmail = clientEmail,
            DisplayName = created.DisplayName,
            InviteSent = created.InviteSent,
            CreatedForTicketId = ticket.Id,
        };

        _db.GoogleChatSpaces.Add(row);

        try
        {
            await _db.SaveChangesAsync(ct);
            return row;
        }
        catch (DbUpdateException)
        {
            // Two tickets from the same client at once: both got past the lookup
            // and the unique index picked a winner. Adopt it. Anything else has
            // no winner to find and is rethrown to the dispatcher's handler.
            _db.Entry(row).State = EntityState.Detached;

            var winner = await FindSpaceAsync(ticket.OrganizationId, clientEmail, ct);
            if (winner == null) throw;

            _log.LogWarning(
                "Concurrent Google Chat space creation for {Client}; keeping {Winner} and orphaning " +
                "{Orphan} — delete it manually in Chat",
                clientEmail, winner.SpaceName, created.SpaceName);

            return winner;
        }
    }

    private Task<GoogleChatSpace?> FindSpaceAsync(long orgId, string clientEmail, CancellationToken ct) =>
        _db.GoogleChatSpaces.IgnoreQueryFilters()
            .FirstOrDefaultAsync(s => s.OrganizationId == orgId && s.MemberEmail == clientEmail, ct);

    // ───────────────────────── inbound (Task 4) ─────────────────────────

    /// <summary>One inbound Chat message, unwrapped from the event envelope.</summary>
    public record InboundMessage(
        string? MessageName,
        string? SpaceName,
        string? ThreadName,
        string? Text,
        string? SenderEmail,
        string? SenderDisplayName,
        bool SenderIsBot);

    public enum InboundOutcome
    {
        Saved,
        Duplicate,
        Ignored,
        UnknownSpace,

        /// <summary>
        /// The event verified, but it came from one organization's Chat app while
        /// naming another organization's Space. Refused — see the sender check in
        /// <see cref="HandleInboundMessageAsync"/>.
        /// </summary>
        SpaceNotOwnedBySender,
    }

    /// <summary>
    /// Turns a client's Chat reply into a ticket comment, then notifies the
    /// assigned developer.
    ///
    /// Guards, in the order they fire:
    ///  1. App-authored messages are dropped, so nothing we post can come back
    ///     in as a comment.
    ///  2. A message whose resource name is already on a note is a redelivery —
    ///     Chat retries whenever our acknowledgement is slow or lost.
    ///  3. The insert races a concurrent redelivery on a unique index, so even
    ///     two simultaneous deliveries produce one comment.
    ///  4. The sending Cloud project must own the Space it names, so one tenant's
    ///     Chat app cannot write into another tenant's Space.
    ///
    /// An unknown Space is logged and ignored, never an error: it means someone
    /// added the app to a Space we have no mapping for.
    /// </summary>
    /// <param name="senderOrganizationId">
    /// The organization behind the Chat app that sent this event, from token
    /// verification. Null when the sender could not be pinned to one
    /// organization — a shared credential serving every tenant, or no project
    /// number configured — in which case no ownership check is possible.
    /// </param>
    public async Task<InboundOutcome> HandleInboundMessageAsync(
        InboundMessage message, long? senderOrganizationId = null, CancellationToken ct = default)
    {
        if (message.SenderIsBot)
        {
            _log.LogDebug("Ignoring Google Chat message {Name} from an app author", message.MessageName);
            return InboundOutcome.Ignored;
        }

        var text = message.Text?.Trim();
        if (string.IsNullOrEmpty(text) || string.IsNullOrWhiteSpace(message.SpaceName))
            return InboundOutcome.Ignored;

        if (await IsAlreadyProcessedAsync(message.MessageName, ct))
        {
            _log.LogInformation("Google Chat message {Name} already recorded — skipping",
                message.MessageName);
            return InboundOutcome.Duplicate;
        }

        var space = await _db.GoogleChatSpaces.IgnoreQueryFilters()
            .FirstOrDefaultAsync(s => s.SpaceName == message.SpaceName, ct);

        if (space == null)
        {
            _log.LogInformation(
                "Google Chat message from unmapped space {Space} ignored — no client is bound to it",
                message.SpaceName);
            return InboundOutcome.UnknownSpace;
        }

        // The Space lookup above is intentionally global — a Space resource name
        // is unique across Google, so there is nothing to scope it by until we
        // know who sent the event. This is where that gets checked: a verified
        // token proves "a Google-signed event from a project we trust", not "from
        // the project that owns this Space". Without this, one subscriber's Chat
        // app could name another subscriber's Space and have a comment written
        // onto their ticket.
        if (senderOrganizationId != null && space.OrganizationId != senderOrganizationId)
        {
            _log.LogWarning(
                "Refused a Google Chat event for space {Space} (organization {SpaceOrg}) sent by a Chat " +
                "app belonging to organization {SenderOrg} — a Chat app may only write into its own " +
                "organization's spaces",
                message.SpaceName, space.OrganizationId, senderOrganizationId);

            return InboundOutcome.SpaceNotOwnedBySender;
        }

        var ticket = await ResolveTicketAsync(space, message, text, ct);
        if (ticket == null)
        {
            _log.LogInformation(
                "Google Chat message in space {Space} matched no ticket for {Client}",
                message.SpaceName, space.MemberEmail);
            return InboundOutcome.UnknownSpace;
        }

        var note = new TicketNote
        {
            TicketId = ticket.Id,
            OrganizationId = ticket.OrganizationId,
            AuthorEmail = message.SenderEmail ?? space.MemberEmail,
            AuthorName = message.SenderDisplayName ?? message.SenderEmail ?? space.MemberEmail,
            Content = text,
            NoteType = "COMMENT",
            Source = "GOOGLE_CHAT",
            GoogleChatMessageName = message.MessageName,
        };

        _db.TicketNotes.Add(note);

        // First message from the client is the only reliable proof they accepted
        // the invite — Chat sends ADDED_TO_SPACE for the app, not for a human.
        space.MemberFirstSeenAt ??= DateTime.UtcNow;
        space.LastMessageAt = DateTime.UtcNow;

        try
        {
            await _db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException)
        {
            _db.Entry(note).State = EntityState.Detached;

            // Confirm it really was the dedupe index before calling it a
            // duplicate — any other write failure has to surface.
            if (!await IsAlreadyProcessedAsync(message.MessageName, ct)) throw;

            _log.LogInformation("Concurrent delivery of Google Chat message {Name} — one comment kept",
                message.MessageName);
            return InboundOutcome.Duplicate;
        }

        _log.LogInformation("Google Chat reply from {Sender} saved as note {NoteId} on ticket {TicketId}",
            message.SenderEmail, note.Id, ticket.Id);

        await NotifyAssignedDeveloperAsync(ticket, note, ct);
        return InboundOutcome.Saved;
    }

    private async Task<bool> IsAlreadyProcessedAsync(string? messageName, CancellationToken ct) =>
        !string.IsNullOrWhiteSpace(messageName)
        && await _db.TicketNotes.IgnoreQueryFilters()
            .AnyAsync(n => n.GoogleChatMessageName == messageName, ct);

    /// <summary>
    /// Which ticket a reply belongs to, most precise first: the thread it was
    /// posted in, then an explicit "#123", then — because a Space is per client
    /// and holds all their tickets — that client's most recently updated ticket.
    /// </summary>
    private async Task<Ticket?> ResolveTicketAsync(
        GoogleChatSpace space, InboundMessage message, string text, CancellationToken ct)
    {
        if (!string.IsNullOrWhiteSpace(message.ThreadName))
        {
            var byThread = await _db.Tickets.IgnoreQueryFilters()
                .FirstOrDefaultAsync(t => t.GoogleChatThreadName == message.ThreadName
                                       && t.OrganizationId == space.OrganizationId, ct);
            if (byThread != null) return byThread;
        }

        var match = TicketIdPattern.Match(text);
        if (match.Success && long.TryParse(match.Groups[1].Value, out var ticketId))
        {
            // Scoped to this Space's own client, so nobody can append to another
            // client's ticket by typing its number.
            var byId = await _db.Tickets.IgnoreQueryFilters()
                .FirstOrDefaultAsync(t => t.Id == ticketId
                                       && t.OrganizationId == space.OrganizationId
                                       && t.SubmittedBy == space.MemberEmail, ct);
            if (byId != null) return byId;
        }

        return await _db.Tickets.IgnoreQueryFilters()
            .Where(t => t.OrganizationId == space.OrganizationId && t.SubmittedBy == space.MemberEmail)
            .OrderByDescending(t => t.UpdatedAt)
            .FirstOrDefaultAsync(ct);
    }

    /// <summary>
    /// Task 4 item 3 — tell the assigned developer their client replied, through
    /// the channels this codebase already uses.
    ///
    /// Note that NotificationService.SendEmailAsync is still a placeholder that
    /// only writes a log line, so today the effective notifications are the
    /// in-app activity entry and Slack. Wire a real provider there and this
    /// starts emailing with no change here.
    /// </summary>
    private async Task NotifyAssignedDeveloperAsync(Ticket ticket, TicketNote note, CancellationToken ct)
    {
        try
        {
            _db.TicketActivities.Add(new TicketActivity
            {
                TicketId = ticket.Id,
                OrganizationId = ticket.OrganizationId,
                Kind = "NOTE_ADDED",
                Message = $"{note.AuthorName ?? note.AuthorEmail} replied from Google Chat",
                ActorEmail = note.AuthorEmail,
                ActorName = note.AuthorName,
            });
            await _db.SaveChangesAsync(ct);

            if (string.IsNullOrWhiteSpace(ticket.AssignedTo)) return;

            var excerpt = note.Content.Length > 300 ? note.Content[..300] + "…" : note.Content;

            await _raw.SendEmailAsync(
                ticket.AssignedTo,
                $"[#{ticket.Id}] {ticket.Title} — client replied in Google Chat",
                $"{note.AuthorName ?? note.AuthorEmail} replied:\n\n{excerpt}\n\n{TicketUrl(ticket)}");

            var project = await _db.Projects.IgnoreQueryFilters()
                .FirstOrDefaultAsync(p => p.Id == ticket.ProjectId, ct);

            if (!string.IsNullOrWhiteSpace(project?.SlackWebhookUrl))
            {
                var payload = System.Text.Json.JsonSerializer.Serialize(new
                {
                    text = $":speech_balloon: Client replied in Google Chat on ticket #{ticket.Id} " +
                           $"({ticket.Title}) — assigned to {ticket.AssignedTo}:\n{excerpt}"
                });
                await _raw.SendSlackAsync(project.SlackWebhookUrl, payload);
            }
        }
        catch (Exception ex)
        {
            // The comment is saved; failing to tell the developer must not undo it.
            _log.LogError(ex, "Could not notify the assigned developer for ticket {Id}", ticket.Id);
        }
    }

    // ───────────────────────── Task 7 support ─────────────────────────

    public record ChatStatus(
        bool Enabled,
        bool SpaceExists,
        bool InviteSent,
        bool ClientJoined,
        string? SpaceName,
        string? MemberEmail,
        DateTime? LastMessageAt);

    /// <summary>Backs GET /api/tickets/{id}/chat-status.</summary>
    public async Task<ChatStatus> GetChatStatusAsync(Ticket ticket, CancellationToken ct = default)
    {
        var enabled = await _api.IsConfiguredAsync(ticket.OrganizationId);
        var clientEmail = NormalizeEmail(ticket.SubmittedBy);

        var space = clientEmail == null
            ? null
            : await FindSpaceAsync(ticket.OrganizationId, clientEmail, ct);

        return new ChatStatus(
            Enabled: enabled,
            SpaceExists: space != null,
            InviteSent: space?.InviteSent ?? false,
            ClientJoined: space?.MemberFirstSeenAt != null,
            SpaceName: space?.SpaceName,
            MemberEmail: space?.MemberEmail ?? clientEmail,
            LastMessageAt: space?.LastMessageAt);
    }

    // ───────────────────────── helpers ─────────────────────────

    private string TicketUrl(Ticket ticket) => $"{_dashboardBaseUrl}/tickets/{ticket.Id}";

    private static string? NormalizeEmail(string? email) =>
        string.IsNullOrWhiteSpace(email) ? null : email.Trim().ToLowerInvariant();

    /// <summary>
    /// " · Customer Portal" when the ticket carries a host-app tenant, otherwise
    /// empty.
    ///
    /// Spaces are keyed on the reporter's email, so one person who reports bugs
    /// against several subscriber apps has a single Space carrying all of them —
    /// which is ambiguous without naming the app. Ticket.TenantId/TenantName are
    /// already populated by the widget, so this costs nothing.
    /// </summary>
    private static string TenantLabel(Ticket ticket) =>
        string.IsNullOrWhiteSpace(ticket.TenantName)
            ? string.Empty
            : $" · {Sanitize(ticket.TenantName)}";

    private static string Stamp(DateTime utc) =>
        utc.ToUniversalTime().ToString("yyyy-MM-dd HH:mm 'UTC'");

    // Chat parses <users/123>, <users/all> and <http://...|label> out of message
    // text. Any untrusted fragment we interpolate — a ticket title, a comment
    // body — must have its angle brackets neutralised first, or a client who
    // types "<users/all>" into a bug report gets us to @-mention the whole Space
    // on their behalf. Replaced with full-width look-alikes so the text still
    // reads naturally rather than being silently swallowed.
    public static string Sanitize(string? text) =>
        string.IsNullOrEmpty(text) ? string.Empty : text.Replace("<", "＜").Replace(">", "＞");

    private static readonly Regex TicketIdPattern =
        new(@"(?:#|ticket:)(\d+)", RegexOptions.Compiled);
}
