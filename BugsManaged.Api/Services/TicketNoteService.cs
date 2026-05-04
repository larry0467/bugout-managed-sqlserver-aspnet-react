using System.Text;
using System.Text.Json;
using BugsManaged.Api.Data;
using BugsManaged.Api.Entities;
using Microsoft.EntityFrameworkCore;

namespace BugsManaged.Api.Services;

public class TicketNoteService
{
    private readonly BugsManagedDbContext _db;
    private readonly HttpClient _httpClient;
    private readonly ILogger<TicketNoteService> _logger;

    public TicketNoteService(BugsManagedDbContext db, HttpClient httpClient, ILogger<TicketNoteService> logger)
    {
        _db = db;
        _httpClient = httpClient;
        _logger = logger;
    }

    public async Task<TicketNote> AddNoteAsync(long ticketId, string authorEmail, string? authorName,
        string content, string noteType, string source = "DASHBOARD")
    {
        var ticket = await _db.Tickets.IgnoreQueryFilters().FirstOrDefaultAsync(t => t.Id == ticketId)
            ?? throw new InvalidOperationException($"Ticket {ticketId} not found");

        var note = new TicketNote
        {
            TicketId = ticketId,
            OrganizationId = ticket.OrganizationId,
            AuthorEmail = authorEmail,
            AuthorName = authorName,
            Content = content,
            NoteType = noteType,
            Source = source
        };

        _db.TicketNotes.Add(note);
        await _db.SaveChangesAsync();

        // Post to Slack if the note did not originate from Slack
        if (source != "SLACK")
        {
            await PostToSlackAsync(note);
        }

        return note;
    }

    public async Task<TicketNote> AddSlackNoteAsync(long ticketId, string slackUser, string content, string? threadTs)
    {
        var ticket = await _db.Tickets.IgnoreQueryFilters().FirstOrDefaultAsync(t => t.Id == ticketId)
            ?? throw new InvalidOperationException($"Ticket {ticketId} not found");

        var note = new TicketNote
        {
            TicketId = ticketId,
            OrganizationId = ticket.OrganizationId,
            AuthorEmail = slackUser,
            AuthorName = slackUser,
            Content = content,
            NoteType = "COMMENT",
            Source = "SLACK",
            SlackThreadTs = threadTs
        };

        _db.TicketNotes.Add(note);
        await _db.SaveChangesAsync();
        return note;
    }

    public async Task<List<TicketNote>> GetNotesAsync(long ticketId)
    {
        return await _db.TicketNotes
            .Where(n => n.TicketId == ticketId)
            .OrderBy(n => n.CreatedAt)
            .ToListAsync();
    }

    public async Task<bool> DeleteNoteAsync(long noteId)
    {
        var note = await _db.TicketNotes.FindAsync(noteId);
        if (note == null) return false;

        _db.TicketNotes.Remove(note);
        await _db.SaveChangesAsync();
        return true;
    }

    private async Task PostToSlackAsync(TicketNote note)
    {
        try
        {
            var ticket = await _db.Tickets.FindAsync(note.TicketId);
            if (ticket == null) return;

            var project = await _db.Projects.FindAsync(ticket.ProjectId);
            if (project?.SlackWebhookUrl == null) return;

            var payload = JsonSerializer.Serialize(new
            {
                text = $":memo: *New note on Ticket #{ticket.Id}: {ticket.Title}*\n" +
                       $"*By:* {note.AuthorName ?? note.AuthorEmail}\n" +
                       $"*Type:* {note.NoteType}\n" +
                       $"*Note:* {note.Content}"
            });

            var httpContent = new StringContent(payload, Encoding.UTF8, "application/json");
            var response = await _httpClient.PostAsync(project.SlackWebhookUrl, httpContent);
            _logger.LogInformation("Slack note post response: {StatusCode}", response.StatusCode);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to post note {NoteId} to Slack", note.Id);
        }
    }
}
