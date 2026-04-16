using System.Text.Json;
using BugsManaged.Api.Data;
using BugsManaged.Api.Entities;
using Microsoft.EntityFrameworkCore;

namespace BugsManaged.Api.Services;

public class TicketService
{
    private readonly BugsManagedDbContext _db;
    private readonly ProjectService _projectService;
    private readonly NotificationService _notificationService;
    private readonly string _videoStoragePath;

    public TicketService(
        BugsManagedDbContext db,
        ProjectService projectService,
        NotificationService notificationService,
        IConfiguration configuration)
    {
        _db = db;
        _projectService = projectService;
        _notificationService = notificationService;
        _videoStoragePath = configuration["BugOutManaged:VideoStoragePath"] ?? "/tmp/bugout-managed-videos";
    }

    public async Task<Ticket> SubmitTicketAsync(string apiKey, Ticket ticket)
    {
        var project = await _projectService.GetByApiKeyAsync(apiKey);
        if (project == null)
        {
            throw new InvalidOperationException("Invalid API key.");
        }

        ticket.ProjectId = project.Id;
        ticket.OrganizationId = project.OrganizationId;
        _db.Tickets.Add(ticket);
        await _db.SaveChangesAsync();

        // Send notifications for CRITICAL priority
        if (ticket.Priority == "CRITICAL")
        {
            var subject = $"[CRITICAL] {ticket.Title}";
            var body = $"A critical ticket has been submitted.\n\nTitle: {ticket.Title}\nType: {ticket.TicketType}\nDescription: {ticket.Description}";

            await _notificationService.SendEmailAsync(project.NotificationEmail, subject, body);

            var slackPayload = JsonSerializer.Serialize(new
            {
                text = $":rotating_light: *CRITICAL BUG* - {ticket.Title}\n{ticket.Description}"
            });
            await _notificationService.SendSlackAsync(project.SlackWebhookUrl, slackPayload);

            var webhookPayload = JsonSerializer.Serialize(new
            {
                @event = "ticket.critical",
                ticket = new { ticket.Id, ticket.Title, ticket.Description, ticket.Priority, ticket.TicketType }
            });
            await _notificationService.SendWebhookAsync(project.WebhookUrl, webhookPayload);
        }

        return ticket;
    }

    public async Task UploadVideoAsync(long ticketId, byte[] bytes, string contentType)
    {
        Directory.CreateDirectory(_videoStoragePath);

        var extension = contentType switch
        {
            "video/webm" => ".webm",
            "video/mp4" => ".mp4",
            _ => ".bin"
        };

        var filePath = Path.Combine(_videoStoragePath, $"{ticketId}{extension}");
        await File.WriteAllBytesAsync(filePath, bytes);

        var ticket = await _db.Tickets.FindAsync(ticketId);
        if (ticket != null)
        {
            ticket.VideoUrl = filePath;
            ticket.VideoSizeBytes = bytes.Length;
            await _db.SaveChangesAsync();
        }
    }

    public async Task<byte[]?> GetVideoAsync(long ticketId)
    {
        var ticket = await _db.Tickets.FindAsync(ticketId);
        if (ticket?.VideoUrl == null || !File.Exists(ticket.VideoUrl))
            return null;

        return await File.ReadAllBytesAsync(ticket.VideoUrl);
    }

    public async Task<string?> GetVideoContentTypeAsync(long ticketId)
    {
        var ticket = await _db.Tickets.FindAsync(ticketId);
        if (ticket?.VideoUrl == null) return null;

        return ticket.VideoUrl.EndsWith(".webm") ? "video/webm"
            : ticket.VideoUrl.EndsWith(".mp4") ? "video/mp4"
            : "application/octet-stream";
    }

    public async Task<List<Ticket>> ListTicketsAsync(long projectId, string? status, string? type)
    {
        var query = _db.Tickets.Where(t => t.ProjectId == projectId);

        if (!string.IsNullOrWhiteSpace(status))
            query = query.Where(t => t.Status == status);

        if (!string.IsNullOrWhiteSpace(type))
            query = query.Where(t => t.TicketType == type);

        return await query.OrderByDescending(t => t.CreatedAt).ToListAsync();
    }

    public async Task<List<Ticket>> ListTicketsForProjectsAsync(List<long> projectIds, string? status, string? type)
    {
        var query = _db.Tickets.Where(t => projectIds.Contains(t.ProjectId));

        if (!string.IsNullOrWhiteSpace(status))
            query = query.Where(t => t.Status == status);

        if (!string.IsNullOrWhiteSpace(type))
            query = query.Where(t => t.TicketType == type);

        return await query.OrderByDescending(t => t.CreatedAt).ToListAsync();
    }

    public async Task<Ticket?> GetTicketAsync(long id)
    {
        return await _db.Tickets.FindAsync(id);
    }

    public async Task<Ticket?> UpdateStatusAsync(long id, string status, string? assignedTo)
    {
        var ticket = await _db.Tickets.FindAsync(id);
        if (ticket == null) return null;

        ticket.Status = status;
        if (assignedTo != null)
            ticket.AssignedTo = assignedTo;

        await _db.SaveChangesAsync();
        return ticket;
    }

    public async Task<Ticket?> UpdateDeveloperCategoryAsync(long id, string? category)
    {
        var ticket = await _db.Tickets.FindAsync(id);
        if (ticket == null) return null;

        ticket.DeveloperCategory = category;
        await _db.SaveChangesAsync();
        return ticket;
    }

    public async Task<Ticket?> AssignTicketAsync(long id, string assignedTo)
    {
        var ticket = await _db.Tickets.FindAsync(id);
        if (ticket == null) return null;

        ticket.AssignedTo = assignedTo;
        ticket.Status = "IN_PROGRESS";
        await _db.SaveChangesAsync();

        // Notify the assigned developer
        var project = await _projectService.GetByIdAsync(ticket.ProjectId);
        if (project != null)
        {
            var subject = $"Ticket Assigned: {ticket.Title}";
            var body = $"You have been assigned ticket #{ticket.Id}: {ticket.Title}";
            await _notificationService.SendEmailAsync(assignedTo, subject, body);
        }

        return ticket;
    }

    public async Task<Ticket?> ResolveTicketAsync(long id, string resolution)
    {
        var ticket = await _db.Tickets.FindAsync(id);
        if (ticket == null) return null;

        ticket.Status = "RESOLVED";
        ticket.Resolution = resolution;
        ticket.ResolvedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        return ticket;
    }

    public async Task<Ticket?> EscalateTicketAsync(long id, string escalatedBy)
    {
        var ticket = await _db.Tickets.FindAsync(id);
        if (ticket == null) return null;

        ticket.EscalatedBy = escalatedBy;
        ticket.EscalatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        var project = await _projectService.GetByIdAsync(ticket.ProjectId);
        if (project != null)
        {
            // Notify assigned developer
            if (!string.IsNullOrWhiteSpace(ticket.AssignedTo))
            {
                await _notificationService.SendEmailAsync(
                    ticket.AssignedTo,
                    $"[ESCALATED] Ticket #{ticket.Id}: {ticket.Title}",
                    $"Ticket #{ticket.Id} has been escalated by {escalatedBy}.\n\nTitle: {ticket.Title}\nDescription: {ticket.Description}");
            }

            // Notify all admins in the organization
            var admins = await _db.Users.IgnoreQueryFilters()
                .Where(u => u.OrganizationId == project.OrganizationId
                    && (u.Role == "PROJECT_ADMIN" || u.Role == "PLATFORM_ADMIN"))
                .ToListAsync();

            foreach (var admin in admins)
            {
                await _notificationService.SendEmailAsync(
                    admin.Email,
                    $"[ESCALATED] Ticket #{ticket.Id}: {ticket.Title}",
                    $"Ticket #{ticket.Id} has been escalated by {escalatedBy}.\n\nTitle: {ticket.Title}\nDescription: {ticket.Description}");
            }

            // Slack notification
            var slackPayload = JsonSerializer.Serialize(new
            {
                text = $":warning: *ESCALATED* - Ticket #{ticket.Id}: {ticket.Title}\nEscalated by: {escalatedBy}"
            });
            await _notificationService.SendSlackAsync(project.SlackWebhookUrl, slackPayload);
        }

        return ticket;
    }

    public async Task<Dictionary<string, long>> GetStatsAsync(long projectId)
    {
        var stats = await _db.Tickets
            .Where(t => t.ProjectId == projectId)
            .GroupBy(t => t.Status)
            .Select(g => new { Status = g.Key, Count = (long)g.Count() })
            .ToListAsync();

        var result = stats.ToDictionary(s => s.Status, s => s.Count);
        result["TOTAL"] = stats.Sum(s => s.Count);
        return result;
    }

    public async Task<Dictionary<string, long>> GetStatsForProjectsAsync(List<long> projectIds)
    {
        var stats = await _db.Tickets
            .Where(t => projectIds.Contains(t.ProjectId))
            .GroupBy(t => t.Status)
            .Select(g => new { Status = g.Key, Count = (long)g.Count() })
            .ToListAsync();

        var result = stats.ToDictionary(s => s.Status, s => s.Count);
        result["TOTAL"] = stats.Sum(s => s.Count);
        return result;
    }
}
