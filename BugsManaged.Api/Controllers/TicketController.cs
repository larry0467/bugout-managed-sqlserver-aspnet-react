using BugsManaged.Api.Data;
using BugsManaged.Api.Entities;
using BugsManaged.Api.Services;
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
    private readonly TicketClassifierService _classifier;
    private readonly IOrgContext _org;

    public TicketController(BugsManagedDbContext db, IWebHostEnvironment env, TicketClassifierService classifier, IOrgContext org)
    {
        _db = db;
        _env = env;
        _classifier = classifier;
        _org = org;
    }

    // Widget path. Middleware has already resolved X-BOM-API-Key into
    // IOrgContext.CurrentProjectId + CurrentOrganizationId, so we just
    // read them instead of doing the lookup again.
    [HttpPost]
    [AllowAnonymous]
    public async Task<IActionResult> Create([FromBody] Ticket ticket)
    {
        if (_org.CurrentProjectId == null || _org.CurrentOrganizationId == null)
            return Unauthorized(new { message = "Missing or invalid X-BOM-API-Key header" });

        ticket.ProjectId = _org.CurrentProjectId.Value;
        ticket.OrganizationId = _org.CurrentOrganizationId.Value;
        ticket.Status = "OPEN";
        ticket.CreatedAt = DateTime.UtcNow;
        ticket.UpdatedAt = DateTime.UtcNow;

        if (string.IsNullOrEmpty(ticket.DeveloperCategory))
        {
            var result = await _classifier.ClassifyAsync(
                ticket.Title,
                ticket.Description,
                ticket.ConsoleErrors,
                ticket.CurrentPageUrl);

            if (result.Category != null)
                ticket.DeveloperCategory = result.Category;
        }

        _db.Tickets.Add(ticket);
        await _db.SaveChangesAsync();

        return CreatedAtAction(nameof(GetById), new { id = ticket.Id }, ticket);
    }

    [HttpPost("{id}/video")]
    [AllowAnonymous]
    public async Task<IActionResult> UploadVideo(long id, IFormFile file)
    {
        if (_org.CurrentProjectId == null)
            return Unauthorized(new { message = "Missing or invalid X-BOM-API-Key header" });

        // Query filters scope by OrganizationId; we additionally require the
        // ticket to belong to the specific project whose API key was used.
        var ticket = await _db.Tickets.FirstOrDefaultAsync(t => t.Id == id && t.ProjectId == _org.CurrentProjectId.Value);
        if (ticket == null) return NotFound(new { message = "Ticket not found" });

        if (file == null || file.Length == 0)
            return BadRequest(new { message = "No file provided" });

        const long MaxVideoBytes = 50L * 1024 * 1024;
        if (file.Length > MaxVideoBytes)
            return BadRequest(new { message = "Video exceeds 50 MB limit" });

        var allowedExtensions = new[] { ".webm", ".mp4", ".mov" };
        var extension = Path.GetExtension(file.FileName).ToLowerInvariant();
        if (!allowedExtensions.Contains(extension))
            return BadRequest(new { message = "Unsupported video format" });

        var uploadsDir = Path.Combine(_env.ContentRootPath, "uploads", "videos");
        Directory.CreateDirectory(uploadsDir);

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
        var query = _db.Tickets.AsQueryable();
        if (projectId.HasValue)
            query = query.Where(t => t.ProjectId == projectId.Value);

        var tickets = await query
            .OrderByDescending(t => t.CreatedAt)
            .ToListAsync();
        return Ok(tickets);
    }

    [HttpGet("{id}")]
    [Authorize]
    public async Task<IActionResult> GetById(long id)
    {
        var ticket = await _db.Tickets.FirstOrDefaultAsync(t => t.Id == id);
        if (ticket == null) return NotFound(new { message = "Ticket not found" });
        return Ok(ticket);
    }

    [HttpGet("{id}/video")]
    [Authorize]
    public async Task<IActionResult> GetVideo(long id)
    {
        var ticket = await _db.Tickets.FirstOrDefaultAsync(t => t.Id == id);
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
        var ticket = await _db.Tickets.FirstOrDefaultAsync(t => t.Id == id);
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
        var ticket = await _db.Tickets.FirstOrDefaultAsync(t => t.Id == id);
        if (ticket == null) return NotFound(new { message = "Ticket not found" });

        ticket.DeveloperCategory = request.DeveloperCategory;
        await _db.SaveChangesAsync();
        return Ok(ticket);
    }

    [HttpPut("{id}/assign")]
    [Authorize]
    public async Task<IActionResult> Assign(long id, [FromBody] AssignRequest request)
    {
        var ticket = await _db.Tickets.FirstOrDefaultAsync(t => t.Id == id);
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
        var ticket = await _db.Tickets.FirstOrDefaultAsync(t => t.Id == id);
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
        var ticket = await _db.Tickets.FirstOrDefaultAsync(t => t.Id == id);
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
        var query = _db.Tickets.AsQueryable();
        if (projectId.HasValue)
            query = query.Where(t => t.ProjectId == projectId.Value);

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

        // Host-app breakdown: "which apps have the most issues" — the
        // central question the Comms Managed per-tenant view was built to
        // answer. Joined against Projects so the response includes names
        // the UI can render without a second round trip.
        var byProject = await (from t in query
                               join p in _db.Projects on t.ProjectId equals p.Id
                               group t by new { p.Id, p.Name } into g
                               select new
                               {
                                   ProjectId = g.Key.Id,
                                   Name = g.Key.Name,
                                   Total = g.Count(),
                                   Open = g.Count(x => x.Status == "OPEN"),
                                   InProgress = g.Count(x => x.Status == "IN_PROGRESS"),
                                   Resolved = g.Count(x => x.Status == "RESOLVED" || x.Status == "CLOSED"),
                                   Critical = g.Count(x => x.Priority == "CRITICAL"),
                               })
                               .OrderByDescending(x => x.Total)
                               .ToListAsync();

        // Turnaround time = ResolvedAt - CreatedAt, in hours. Pulled client
        // side for simplicity (SQL Server's DATEDIFF is tricky when you want
        // both global and per-project rollups from the same dataset, and at
        // current scale the extra round-trip cost is noise).
        var resolvedTickets = await query
            .Where(t => t.ResolvedAt != null)
            .Select(t => new { t.ProjectId, t.CreatedAt, t.ResolvedAt })
            .ToListAsync();

        double? globalAvg = null;
        double? globalMedian = null;
        if (resolvedTickets.Count > 0)
        {
            var hours = resolvedTickets
                .Select(t => (t.ResolvedAt!.Value - t.CreatedAt).TotalHours)
                .OrderBy(h => h)
                .ToList();
            globalAvg = Math.Round(hours.Average(), 1);
            globalMedian = Math.Round(hours[hours.Count / 2], 1);
        }

        var turnaroundByProject = resolvedTickets
            .GroupBy(t => t.ProjectId)
            .Select(g =>
            {
                var hours = g.Select(t => (t.ResolvedAt!.Value - t.CreatedAt).TotalHours).OrderBy(h => h).ToList();
                return new
                {
                    ProjectId = g.Key,
                    ResolvedCount = hours.Count,
                    AvgHours = Math.Round(hours.Average(), 1),
                    MedianHours = Math.Round(hours[hours.Count / 2], 1),
                };
            })
            .ToList();

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
            byCategory,
            byProject,
            turnaround = new
            {
                avgHours = globalAvg,
                medianHours = globalMedian,
                byProject = turnaroundByProject,
            },
        });
    }

    public record UpdateStatusRequest(string Status, string? AssignedTo);
    public record UpdateCategoryRequest(string DeveloperCategory);
    public record AssignRequest(string AssignedTo);
    public record ResolveRequest(string Resolution);
    public record EscalateRequest(string EscalatedBy);
}
