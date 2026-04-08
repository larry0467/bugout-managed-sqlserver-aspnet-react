using System.Security.Claims;
using BugsManaged.Api.Data;
using BugsManaged.Api.Entities;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BugsManaged.Api.Controllers;

[ApiController]
[Route("api/tickets")]
public class TicketController : ControllerBase
{
    private readonly BugsManagedDbContext _db;
    private readonly IWebHostEnvironment _env;

    public TicketController(BugsManagedDbContext db, IWebHostEnvironment env)
    {
        _db = db;
        _env = env;
    }

    [HttpPost]
    [AllowAnonymous]
    public async Task<IActionResult> Create([FromBody] Ticket ticket)
    {
        var apiKey = Request.Headers["X-BOM-API-Key"].FirstOrDefault();
        if (string.IsNullOrEmpty(apiKey))
            return Unauthorized(new { message = "Missing X-BOM-API-Key header" });

        var project = await _db.Projects.FirstOrDefaultAsync(p => p.ApiKey == apiKey);
        if (project == null)
            return Unauthorized(new { message = "Invalid API key" });

        ticket.ProjectId = project.Id;
        ticket.Status = "OPEN";
        ticket.CreatedAt = DateTime.UtcNow;
        ticket.UpdatedAt = DateTime.UtcNow;

        _db.Tickets.Add(ticket);
        await _db.SaveChangesAsync();

        return CreatedAtAction(nameof(GetById), new { id = ticket.Id }, ticket);
    }

    [HttpPost("{id}/video")]
    [AllowAnonymous]
    public async Task<IActionResult> UploadVideo(long id, IFormFile file)
    {
        var ticket = await _db.Tickets.FindAsync(id);
        if (ticket == null) return NotFound(new { message = "Ticket not found" });

        var uploadsDir = Path.Combine(_env.ContentRootPath, "uploads", "videos");
        Directory.CreateDirectory(uploadsDir);

        var extension = Path.GetExtension(file.FileName);
        var fileName = $"ticket_{id}_{Guid.NewGuid()}{extension}";
        var filePath = Path.Combine(uploadsDir, fileName);

        await using var stream = new FileStream(filePath, FileMode.Create);
        await file.CopyToAsync(stream);

        ticket.VideoUrl = filePath;
        ticket.VideoSizeBytes = file.Length;
        await _db.SaveChangesAsync();

        return Ok(new { videoUrl = ticket.VideoUrl, videoSizeBytes = ticket.VideoSizeBytes });
    }

    [HttpGet]
    [Authorize]
    public async Task<IActionResult> GetAll([FromQuery] long? projectId)
    {
        if (projectId.HasValue)
        {
            var tickets = await _db.Tickets
                .Where(t => t.ProjectId == projectId.Value)
                .OrderByDescending(t => t.CreatedAt)
                .ToListAsync();
            return Ok(tickets);
        }

        var orgId = long.Parse(User.FindFirstValue("organizationId")!);
        var projectIds = await _db.Projects
            .Where(p => p.OrganizationId == orgId)
            .Select(p => p.Id)
            .ToListAsync();

        var orgTickets = await _db.Tickets
            .Where(t => projectIds.Contains(t.ProjectId))
            .OrderByDescending(t => t.CreatedAt)
            .ToListAsync();

        return Ok(orgTickets);
    }

    [HttpGet("{id}")]
    [Authorize]
    public async Task<IActionResult> GetById(long id)
    {
        var ticket = await _db.Tickets.FindAsync(id);
        if (ticket == null) return NotFound(new { message = "Ticket not found" });

        return Ok(ticket);
    }

    [HttpGet("{id}/video")]
    [Authorize]
    public async Task<IActionResult> GetVideo(long id)
    {
        var ticket = await _db.Tickets.FindAsync(id);
        if (ticket == null) return NotFound(new { message = "Ticket not found" });

        if (string.IsNullOrEmpty(ticket.VideoUrl) || !System.IO.File.Exists(ticket.VideoUrl))
            return NotFound(new { message = "Video not found" });

        var extension = Path.GetExtension(ticket.VideoUrl).ToLower();
        var contentType = extension switch
        {
            ".webm" => "video/webm",
            ".mp4" => "video/mp4",
            ".avi" => "video/x-msvideo",
            ".mov" => "video/quicktime",
            _ => "application/octet-stream"
        };

        var bytes = await System.IO.File.ReadAllBytesAsync(ticket.VideoUrl);
        return File(bytes, contentType);
    }

    [HttpPut("{id}/status")]
    [Authorize]
    public async Task<IActionResult> UpdateStatus(long id, [FromBody] UpdateStatusRequest request)
    {
        var ticket = await _db.Tickets.FindAsync(id);
        if (ticket == null) return NotFound(new { message = "Ticket not found" });

        ticket.Status = request.Status;
        if (!string.IsNullOrEmpty(request.AssignedTo))
            ticket.AssignedTo = request.AssignedTo;

        if (request.Status == "RESOLVED" || request.Status == "CLOSED")
            ticket.ResolvedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();
        return Ok(ticket);
    }

    [HttpPut("{id}/category")]
    [Authorize]
    public async Task<IActionResult> UpdateCategory(long id, [FromBody] UpdateCategoryRequest request)
    {
        var ticket = await _db.Tickets.FindAsync(id);
        if (ticket == null) return NotFound(new { message = "Ticket not found" });

        ticket.DeveloperCategory = request.DeveloperCategory;
        await _db.SaveChangesAsync();
        return Ok(ticket);
    }

    [HttpPut("{id}/assign")]
    [Authorize]
    public async Task<IActionResult> Assign(long id, [FromBody] AssignRequest request)
    {
        var ticket = await _db.Tickets.FindAsync(id);
        if (ticket == null) return NotFound(new { message = "Ticket not found" });

        ticket.AssignedTo = request.AssignedTo;
        if (ticket.Status == "OPEN")
            ticket.Status = "IN_PROGRESS";

        await _db.SaveChangesAsync();
        return Ok(ticket);
    }

    [HttpPut("{id}/resolve")]
    [Authorize]
    public async Task<IActionResult> Resolve(long id, [FromBody] ResolveRequest request)
    {
        var ticket = await _db.Tickets.FindAsync(id);
        if (ticket == null) return NotFound(new { message = "Ticket not found" });

        ticket.Resolution = request.Resolution;
        ticket.Status = "RESOLVED";
        ticket.ResolvedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        return Ok(ticket);
    }

    [HttpPut("{id}/escalate")]
    [Authorize]
    public async Task<IActionResult> Escalate(long id, [FromBody] EscalateRequest request)
    {
        var ticket = await _db.Tickets.FindAsync(id);
        if (ticket == null) return NotFound(new { message = "Ticket not found" });

        ticket.EscalatedBy = request.EscalatedBy;
        ticket.EscalatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        return Ok(ticket);
    }

    [HttpGet("stats")]
    [Authorize]
    public async Task<IActionResult> GetStats([FromQuery] long? projectId)
    {
        IQueryable<Ticket> query;

        if (projectId.HasValue)
        {
            query = _db.Tickets.Where(t => t.ProjectId == projectId.Value);
        }
        else
        {
            var orgId = long.Parse(User.FindFirstValue("organizationId")!);
            var projectIds = await _db.Projects
                .Where(p => p.OrganizationId == orgId)
                .Select(p => p.Id)
                .ToListAsync();
            query = _db.Tickets.Where(t => projectIds.Contains(t.ProjectId));
        }

        var total = await query.CountAsync();
        var open = await query.CountAsync(t => t.Status == "OPEN");
        var inProgress = await query.CountAsync(t => t.Status == "IN_PROGRESS");
        var resolved = await query.CountAsync(t => t.Status == "RESOLVED" || t.Status == "CLOSED");
        var critical = await query.CountAsync(t => t.Priority == "CRITICAL");
        var escalated = await query.CountAsync(t => t.EscalatedAt != null);

        var byStatus = await query
            .GroupBy(t => t.Status)
            .Select(g => new { Status = g.Key, Count = g.Count() })
            .ToListAsync();

        var byPriority = await query
            .GroupBy(t => t.Priority)
            .Select(g => new { Priority = g.Key, Count = g.Count() })
            .ToListAsync();

        var byCategory = await query
            .Where(t => t.DeveloperCategory != null)
            .GroupBy(t => t.DeveloperCategory)
            .Select(g => new { Category = g.Key, Count = g.Count() })
            .ToListAsync();

        return Ok(new
        {
            total,
            open,
            inProgress,
            resolved,
            critical,
            escalated,
            byStatus,
            byPriority,
            byCategory
        });
    }

    public record UpdateStatusRequest(string Status, string? AssignedTo);
    public record UpdateCategoryRequest(string DeveloperCategory);
    public record AssignRequest(string AssignedTo);
    public record ResolveRequest(string Resolution);
    public record EscalateRequest(string EscalatedBy);
}
