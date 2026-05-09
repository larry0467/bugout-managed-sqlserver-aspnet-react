using System.Net.Http.Json;
using System.Text.Json;
using BugsManaged.Api.Entities;

namespace BugsManaged.Api.Services;

/// <summary>
/// Replaces the no-op NotificationService with real delivery through
/// Comms Managed. Every key ticket lifecycle event sends an email (or
/// whichever channel the workspace default is) through Comms' unified
/// messaging API and threads the message to the ticket entity so the full
/// conversation is visible in the Comms inbox.
/// </summary>
public class CommsManagedNotificationService : ITicketNotificationService
{
    private readonly HttpClient _http;
    private readonly ILogger<CommsManagedNotificationService> _log;
    private readonly CommsManagedOptions _opts;

    public CommsManagedNotificationService(
        HttpClient http,
        ILogger<CommsManagedNotificationService> log,
        CommsManagedOptions opts)
    {
        _http = http;
        _log  = log;
        _opts = opts;
    }

    // -------------------------------------------------------------------------
    // Public notification methods — called from TicketController
    // -------------------------------------------------------------------------

    public Task NotifyTicketReceivedAsync(Ticket ticket, CancellationToken ct = default)
        => SendAsync(
            to:      ticket.SubmittedBy,
            ticket:  ticket,
            subject: $"[#{ticket.Id}] We received your report",
            body:    $"Hi {FirstName(ticket.SubmittedBy)},\n\n" +
                     $"Thanks for reaching out! We received your report:\n\n" +
                     $"  \"{ticket.Title}\"\n\n" +
                     $"We'll review it shortly and keep you updated here.\n\n" +
                     $"— {_opts.TeamName}",
            ct: ct);

    public Task NotifyTicketAssignedToDevAsync(Ticket ticket, string developerEmail, CancellationToken ct = default)
        => SendAsync(
            to:      developerEmail,
            ticket:  ticket,
            subject: $"[#{ticket.Id}] Ticket assigned to you",
            body:    $"Hi {FirstName(developerEmail)},\n\n" +
                     $"Ticket #{ticket.Id} has been assigned to you:\n\n" +
                     $"  \"{ticket.Title}\"\n\n" +
                     $"Priority: {ticket.Priority ?? "NORMAL"}\n" +
                     $"Reporter: {ticket.SubmittedBy}\n\n" +
                     $"Open the Bug Out dashboard to review and start working on it.\n\n" +
                     $"— {_opts.TeamName}",
            ct: ct);

    public Task NotifyReporterQuestionAsync(Ticket ticket, string questionText, CancellationToken ct = default)
        => SendAsync(
            to:      ticket.SubmittedBy,
            ticket:  ticket,
            subject: $"[#{ticket.Id}] The team has a question",
            body:    $"Hi {FirstName(ticket.SubmittedBy)},\n\n" +
                     $"The team working on your report has a question:\n\n" +
                     $"  \"{questionText}\"\n\n" +
                     $"You can reply directly to this message and we'll see your response.\n\n" +
                     $"— {_opts.TeamName}",
            ct: ct);

    public Task NotifyReporterInProgressAsync(Ticket ticket, CancellationToken ct = default)
        => SendAsync(
            to:      ticket.SubmittedBy,
            ticket:  ticket,
            subject: $"[#{ticket.Id}] Work has started on your report",
            body:    $"Hi {FirstName(ticket.SubmittedBy)},\n\n" +
                     $"Good news — someone is now actively working on:\n\n" +
                     $"  \"{ticket.Title}\"\n\n" +
                     $"We'll let you know when it's resolved.\n\n" +
                     $"— {_opts.TeamName}",
            ct: ct);

    public Task NotifyReporterResolvedAsync(Ticket ticket, CancellationToken ct = default)
        => SendAsync(
            to:      ticket.SubmittedBy,
            ticket:  ticket,
            subject: $"[#{ticket.Id}] Your issue has been resolved ✓",
            body:    $"Hi {FirstName(ticket.SubmittedBy)},\n\n" +
                     $"Great news — your report has been resolved:\n\n" +
                     $"  \"{ticket.Title}\"\n\n" +
                     (string.IsNullOrWhiteSpace(ticket.Resolution)
                         ? ""
                         : $"Resolution:\n  {ticket.Resolution}\n\n") +
                     $"If you have any follow-up questions just reply to this message.\n\n" +
                     $"— {_opts.TeamName}",
            ct: ct);

    public Task NotifyAssigneeChangesRequestedAsync(Ticket ticket, string reason, CancellationToken ct = default)
        => SendAsync(
            to:      ticket.AssignedTo,
            ticket:  ticket,
            subject: $"[#{ticket.Id}] Changes requested",
            body:    $"Hi {FirstName(ticket.AssignedTo)},\n\n" +
                     $"Changes have been requested for ticket #{ticket.Id}:\n\n" +
                     $"  \"{ticket.Title}\"\n\n" +
                     (string.IsNullOrWhiteSpace(reason) ? "" : $"Note:\n  {reason}\n\n") +
                     $"Please review and resubmit for approval.\n\n" +
                     $"— {_opts.TeamName}",
            ct: ct);

    public Task NotifyReporterNoteAddedAsync(Ticket ticket, string noteContent, string authorName, CancellationToken ct = default)
        => SendAsync(
            to:      ticket.SubmittedBy,
            ticket:  ticket,
            subject: $"[#{ticket.Id}] New comment on your {ticket.TicketType.ToLowerInvariant().Replace('_', ' ')} report",
            body:    $"{authorName} left a comment on your {ticket.TicketType.ToLowerInvariant().Replace('_', ' ')} request \"{ticket.Title}\":\n\n" +
                     $"{noteContent}\n\n" +
                     $"Reply to this message to respond, or view the full ticket at " +
                     $"https://bugout.managedplatform.com/tickets/{ticket.Id}",
            ct: ct);

    // -------------------------------------------------------------------------
    // Core send — calls POST /api/v1/messages/send on Comms
    // -------------------------------------------------------------------------

    private async Task SendAsync(string? to, Ticket ticket, string subject, string body, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(to))
        {
            _log.LogWarning("CommsBridge: skipping notification for ticket {Id} — no recipient", ticket.Id);
            return;
        }

        var payload = new
        {
            workspaceId  = _opts.WorkspaceId,
            senderUserId = _opts.SystemSenderUserId,
            channel      = "email",
            to,
            body         = $"Subject: {subject}\n\n{body}",
            entityId     = ticket.Id.ToString(),
            entityRef    = $"ticket:{ticket.Id}",
            entityTitle  = ticket.Title,
            visibility   = "shared",
        };

        try
        {
            var resp = await _http.PostAsJsonAsync("/api/v1/messages/send", payload, ct);
            if (!resp.IsSuccessStatusCode)
            {
                var err = await resp.Content.ReadAsStringAsync(ct);
                _log.LogError(
                    "CommsBridge: send failed for ticket {Id} → {Status}: {Body}",
                    ticket.Id, (int)resp.StatusCode, err);
            }
        }
        catch (Exception ex)
        {
            // Notifications are best-effort — never let them fail a ticket mutation.
            _log.LogError(ex, "CommsBridge: exception sending notification for ticket {Id}", ticket.Id);
        }
    }

    private static string FirstName(string? email)
    {
        if (string.IsNullOrWhiteSpace(email)) return "there";
        var local = email.Split('@')[0];
        return char.ToUpper(local[0]) + local[1..];
    }
}

// ---------------------------------------------------------------------------
// Interface — keeps TicketController decoupled from the concrete HTTP client
// ---------------------------------------------------------------------------
public interface ITicketNotificationService
{
    Task NotifyTicketReceivedAsync(Ticket ticket, CancellationToken ct = default);
    Task NotifyTicketAssignedToDevAsync(Ticket ticket, string developerEmail, CancellationToken ct = default);
    Task NotifyReporterQuestionAsync(Ticket ticket, string questionText, CancellationToken ct = default);
    Task NotifyReporterInProgressAsync(Ticket ticket, CancellationToken ct = default);
    Task NotifyReporterResolvedAsync(Ticket ticket, CancellationToken ct = default);
    Task NotifyAssigneeChangesRequestedAsync(Ticket ticket, string reason, CancellationToken ct = default);
    Task NotifyReporterNoteAddedAsync(Ticket ticket, string noteContent, string authorName, CancellationToken ct = default);
}

// ---------------------------------------------------------------------------
// Options — bound from appsettings "CommsManaged" section
// ---------------------------------------------------------------------------
public class CommsManagedOptions
{
    public string ApiUrl            { get; set; } = string.Empty;
    public string ApiKey            { get; set; } = string.Empty;
    public string WorkspaceId       { get; set; } = string.Empty;
    public string SystemSenderUserId{ get; set; } = string.Empty;
    public string TeamName          { get; set; } = "The Team";
}
