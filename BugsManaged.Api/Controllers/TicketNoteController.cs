using System.Security.Claims;
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

    public TicketNoteController(BugsManagedDbContext db, ITicketNotificationService notify)
    {
        _db     = db;
        _notify = notify;
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

        var note = new TicketNote
        {
            TicketId = ticketId,
            OrganizationId = ticket.OrganizationId,
            AuthorEmail = userEmail,
            AuthorName = request.AuthorName ?? User.FindFirstValue("fullName"),
            Content = request.Content,
            NoteType = request.NoteType ?? "COMMENT",
            Source = "DASHBOARD"
        };

        _db.TicketNotes.Add(note);
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

    public record AddNoteRequest(string Content, string? NoteType, string? AuthorName);
}
