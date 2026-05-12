using System.Security.Claims;
using System.Text.RegularExpressions;
using BugsManaged.Api.Data;
using BugsManaged.Api.Entities;
using BugsManaged.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BugsManaged.Api.Controllers;

[ApiController]
[Route("api/tickets/{ticketId}/notes")]
[Authorize]
public class TicketNoteController : ControllerBase
{
    private readonly BugsManagedDbContext _db;
    private readonly ITicketNotificationService _notify;
    private readonly ITicketActivityLogger _activity;
    private readonly NotificationService _rawNotify;

    // @-mention forms accepted:
    //   @alice         -> matches "alice" against the local-part of any user
    //   @alice@org.io  -> matches the full email
    // Word-boundary so "@" inside a code block (e.g. `@type`) doesn't trigger.
    private static readonly Regex MentionRegex = new(
        @"(?<![A-Za-z0-9_])@([A-Za-z0-9._%+-]+(?:@[A-Za-z0-9.-]+\.[A-Za-z]{2,})?)",
        RegexOptions.Compiled);

    public TicketNoteController(BugsManagedDbContext db, ITicketNotificationService notify, ITicketActivityLogger activity, NotificationService rawNotify)
    {
        _db = db;
        _notify = notify;
        _activity = activity;
        _rawNotify = rawNotify;
    }

    [HttpGet]
    public async Task<IActionResult> GetNotes(long ticketId)
    {
        var notes = await _db.TicketNotes
            .Where(n => n.TicketId == ticketId)
            .OrderBy(n => n.CreatedAt)
            .ToListAsync();

        return Ok(notes);
    }

    [HttpPost]
    public async Task<IActionResult> AddNote(long ticketId, [FromBody] AddNoteRequest request)
    {
        // Query filter scopes the ticket lookup by org; cross-tenant
        // ticket IDs 404 without leaking existence.
        var ticket = await _db.Tickets.FirstOrDefaultAsync(t => t.Id == ticketId);
        if (ticket == null) return NotFound(new { message = "Ticket not found" });

        var userEmail = User.FindFirstValue(ClaimTypes.Email) ?? "unknown";
        var userName = User.FindFirstValue("fullName");

        var note = new TicketNote
        {
            TicketId = ticketId,
            OrganizationId = ticket.OrganizationId,
            AuthorEmail = userEmail,
            AuthorName = request.AuthorName ?? userName,
            Content = request.Content,
            NoteType = request.NoteType ?? "COMMENT",
            Source = "DASHBOARD"
        };

        _db.TicketNotes.Add(note);
        _activity.Log(ticket, "NOTE_ADDED",
            $"{userName ?? userEmail} left a {note.NoteType.ToLowerInvariant()}",
            userEmail, userName,
            payload: new { noteType = note.NoteType });

        // @-mentions: parse out unique mentioned identifiers, resolve to org
        // users, drop a MENTIONED activity entry for each, and fire a
        // notification (best-effort).
        await HandleMentionsAsync(ticket, note, userEmail, userName);

        await _db.SaveChangesAsync();

        // Notify the reporter when a developer leaves a comment.
        // Skip for EMAIL-sourced notes to avoid a reply-loop with the Comms webhook.
        if (note.NoteType == "COMMENT" && note.Source != "EMAIL")
        {
            _ = _notify.NotifyReporterNoteAddedAsync(ticket, note.Content, note.AuthorName ?? userEmail);
        }

        return CreatedAtAction(nameof(GetNotes), new { ticketId }, note);
    }

    [HttpDelete("{noteId}")]
    public async Task<IActionResult> DeleteNote(long ticketId, long noteId)
    {
        var note = await _db.TicketNotes.FirstOrDefaultAsync(n => n.Id == noteId && n.TicketId == ticketId);
        if (note == null) return NotFound(new { message = "Note not found" });

        _db.TicketNotes.Remove(note);
        await _db.SaveChangesAsync();

        return NoContent();
    }

    private async Task HandleMentionsAsync(Ticket ticket, TicketNote note, string actorEmail, string? actorName)
    {
        var matches = MentionRegex.Matches(note.Content);
        if (matches.Count == 0) return;

        var raw = matches
            .Select(m => m.Groups[1].Value.ToLowerInvariant())
            .Distinct()
            .ToList();

        // Org users are auto-scoped via the global query filter, so a
        // mention can only resolve to a user inside the current org. Cross-
        // org @-name spoofing is impossible.
        var orgUsers = await _db.Users.ToListAsync();
        var matched = new List<User>();

        foreach (var token in raw)
        {
            User? hit;
            if (token.Contains('@'))
            {
                hit = orgUsers.FirstOrDefault(u => u.Email.Equals(token, StringComparison.OrdinalIgnoreCase));
            }
            else
            {
                hit = orgUsers.FirstOrDefault(u =>
                    u.Email.StartsWith(token + "@", StringComparison.OrdinalIgnoreCase) ||
                    (u.FullName != null && u.FullName.Split(' ', 2)[0].Equals(token, StringComparison.OrdinalIgnoreCase)));
            }
            if (hit != null && hit.Email != actorEmail) matched.Add(hit);
        }

        foreach (var user in matched)
        {
            _activity.Log(ticket, "MENTIONED",
                $"{actorName ?? actorEmail} mentioned {user.FullName ?? user.Email}",
                actorEmail, actorName,
                payload: new { mentionedEmail = user.Email, noteId = note.Id });
        }

        // Notify via project's Slack webhook + email. Best-effort; failures
        // don't block the note save.
        if (matched.Count > 0)
        {
            var project = await _db.Projects.IgnoreQueryFilters().FirstOrDefaultAsync(p => p.Id == ticket.ProjectId);
            foreach (var user in matched)
            {
                try
                {
                    var subject = $"You were mentioned on Bug Out ticket #{ticket.Id}";
                    var body = $"{actorName ?? actorEmail} mentioned you on \"{ticket.Title}\":\n\n{note.Content}";
                    await _rawNotify.SendEmailAsync(user.Email, subject, body);
                    if (!string.IsNullOrWhiteSpace(project?.SlackWebhookUrl))
                    {
                        var slackPayload = $"{{\"text\":\"<@{user.Email}> mentioned by {actorEmail} on ticket #{ticket.Id}: {ticket.Title.Replace("\"", "\\\"")}\"}}";
                        await _rawNotify.SendSlackAsync(project.SlackWebhookUrl, slackPayload);
                    }
                }
                catch
                {
                    // Best-effort — activity log already captured the mention.
                }
            }
        }
    }

    public record AddNoteRequest(string Content, string? NoteType, string? AuthorName);
}
