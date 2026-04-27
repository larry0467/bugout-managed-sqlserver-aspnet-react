using System.Security.Claims;
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

    // Looks up a ticket by id but only inside the caller's current org.
    // Every new escalation/assignment endpoint must go through this so a
    // PLATFORM_OWNER in org A can't drive the workflow on a ticket in org B.
    private Task<Ticket?> GetTicketForCurrentOrgAsync(long id)
    {
        // _db.Tickets is already scoped via the global query filter on
        // OrganizationId, but we want the lookup to fail loud (404) when
        // the org context isn't set, rather than silently match nothing.
        return _db.Tickets.FirstOrDefaultAsync(t => t.Id == id);
    }

    private string CallerEmail() =>
        User.FindFirstValue(ClaimTypes.Email) ?? User.FindFirstValue("email") ?? "unknown";

    // Append a stage-history row in the same SaveChanges call as the ticket
    // mutation, so a failure rolls both back together. Every escalation
    // endpoint goes through this — the dashboard's interval math depends on
    // it being unbroken.
    private void RecordStageTransition(Ticket ticket, string? fromStage, string toStage,
        string? changedBy, DateTime changedAt, string? note = null)
    {
        _db.TicketStageHistory.Add(new TicketStageHistory
        {
            TicketId = ticket.Id,
            OrganizationId = ticket.OrganizationId,
            FromStage = fromStage,
            ToStage = toStage,
            ChangedBy = changedBy,
            ChangedAt = changedAt,
            Note = note,
        });
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

        var now = DateTime.UtcNow;
        ticket.ProjectId = _org.CurrentProjectId.Value;
        ticket.OrganizationId = _org.CurrentOrganizationId.Value;
        ticket.Status = "OPEN";
        ticket.CreatedAt = now;
        ticket.UpdatedAt = now;

        // Fast-path for privileged submitters: when the SubmittedBy email
        // matches a PLATFORM_OWNER or SUPER_ADMIN on this tenant, the ticket
        // skips the queues that would otherwise loop right back to them.
        // PLATFORM_OWNER -> lands directly at PLATFORM_OWNER_REVIEW (so the
        // assign buttons show on first view); SUPER_ADMIN -> also lands at
        // PLATFORM_OWNER_REVIEW (they self-triaged by submitting).
        // v1 trusts the unverified SubmittedBy email — worst case is queue
        // misrouting; the attacker still can't assign or modify. Tighten to
        // signed-identity from host apps when external tenants ship.
        User? submitter = null;
        if (!string.IsNullOrWhiteSpace(ticket.SubmittedBy))
        {
            submitter = await _db.Users.FirstOrDefaultAsync(u =>
                u.Email == ticket.SubmittedBy &&
                u.OrganizationId == ticket.OrganizationId);
        }

        var fastPath = submitter?.Role is "PLATFORM_OWNER" or "SUPER_ADMIN";
        if (fastPath)
        {
            ticket.EscalationStage = "PLATFORM_OWNER_REVIEW";
            ticket.EscalatedToOwnerAt = now;
            ticket.EscalatedToOwnerBy = ticket.SubmittedBy;
        }
        else
        {
            ticket.EscalationStage = "SUPER_ADMIN_REVIEW";
        }

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

        // Audit trail: log the initial transition so the history table is a
        // faithful "ticket arrived at this stage at this time" record. For
        // fast-path tickets we only log the actual landing stage — the ticket
        // truly never sat in SUPER_ADMIN_REVIEW, so we don't synthesize a
        // phantom intermediate row.
        var note = fastPath
            ? $"auto-routed: submitter is {submitter!.Role}"
            : null;
        RecordStageTransition(ticket,
            fromStage: null,
            toStage: ticket.EscalationStage,
            changedBy: ticket.SubmittedBy,
            changedAt: now,
            note: note);
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

    // ===== Tiered escalation chain =====
    // Stage transitions (other than ticket create):
    //   SUPER_ADMIN_REVIEW
    //     -> POST /escalate-to-platform-owner  (SUPER_ADMIN)
    //   PLATFORM_OWNER_REVIEW
    //     -> POST /assign-to-human    (PLATFORM_OWNER) -> ASSIGNED_HUMAN
    //     -> POST /assign-to-claude   (PLATFORM_OWNER) -> ASSIGNED_CLAUDE
    // Every transition is stage-gated. 409 if the current stage doesn't
    // match the expected pre-condition.

    [HttpPost("{id}/escalate-to-platform-owner")]
    [Authorize(Roles = "SUPER_ADMIN")]
    public async Task<IActionResult> EscalateToPlatformOwner(long id)
    {
        var ticket = await GetTicketForCurrentOrgAsync(id);
        if (ticket == null) return NotFound(new { message = "Ticket not found" });

        if (ticket.EscalationStage != "SUPER_ADMIN_REVIEW")
            return Conflict(new
            {
                message = $"Ticket is in stage '{ticket.EscalationStage}'; expected 'SUPER_ADMIN_REVIEW'.",
                currentStage = ticket.EscalationStage,
            });

        var caller = CallerEmail();
        var now = DateTime.UtcNow;
        var fromStage = ticket.EscalationStage;
        ticket.EscalationStage = "PLATFORM_OWNER_REVIEW";
        ticket.EscalatedToOwnerBy = caller;
        ticket.EscalatedToOwnerAt = now;
        // Keep the legacy audit columns populated too.
        ticket.EscalatedBy = caller;
        ticket.EscalatedAt = now;
        RecordStageTransition(ticket, fromStage, ticket.EscalationStage, caller, now);
        await _db.SaveChangesAsync();

        return Ok(ticket);
    }

    [HttpPost("{id}/assign-to-human")]
    [Authorize(Roles = "PLATFORM_OWNER")]
    public async Task<IActionResult> AssignToHuman(long id, [FromBody] AssignToHumanRequest request)
    {
        if (request == null || string.IsNullOrWhiteSpace(request.DeveloperEmail))
            return BadRequest(new { message = "developerEmail is required" });

        var ticket = await GetTicketForCurrentOrgAsync(id);
        if (ticket == null) return NotFound(new { message = "Ticket not found" });

        if (ticket.EscalationStage != "PLATFORM_OWNER_REVIEW")
            return Conflict(new
            {
                message = $"Ticket is in stage '{ticket.EscalationStage}'; expected 'PLATFORM_OWNER_REVIEW'.",
                currentStage = ticket.EscalationStage,
            });

        var caller = CallerEmail();
        var now = DateTime.UtcNow;
        var fromStage = ticket.EscalationStage;
        ticket.AssignedTo = request.DeveloperEmail;
        ticket.AssigneeType = "HUMAN";
        ticket.EscalationStage = "ASSIGNED_HUMAN";
        ticket.AssignedAt = now;
        ticket.AssignedBy = caller;
        if (ticket.Status == "OPEN")
            ticket.Status = "IN_PROGRESS";
        RecordStageTransition(ticket, fromStage, ticket.EscalationStage, caller, now);

        await _db.SaveChangesAsync();
        return Ok(ticket);
    }

    [HttpPost("{id}/assign-to-claude")]
    [Authorize(Roles = "PLATFORM_OWNER")]
    public async Task<IActionResult> AssignToClaude(long id, [FromBody] AssignToClaudeRequest? request)
    {
        var ticket = await GetTicketForCurrentOrgAsync(id);
        if (ticket == null) return NotFound(new { message = "Ticket not found" });

        if (ticket.EscalationStage != "PLATFORM_OWNER_REVIEW")
            return Conflict(new
            {
                message = $"Ticket is in stage '{ticket.EscalationStage}'; expected 'PLATFORM_OWNER_REVIEW'.",
                currentStage = ticket.EscalationStage,
            });

        var project = await _db.Projects.FirstOrDefaultAsync(p => p.Id == ticket.ProjectId);
        if (project == null)
            return NotFound(new { message = "Project not found for ticket" });

        if (string.IsNullOrWhiteSpace(project.RepoPath))
            return BadRequest(new { message = "Project has no RepoPath configured — Claude cannot run." });

        var modelKey = (request?.Model ?? "sonnet").ToLowerInvariant();
        var modelId = modelKey switch
        {
            "opus" => "claude-opus-4-7",
            "sonnet" => "claude-sonnet-4-6",
            _ => "claude-sonnet-4-6",
        };

        var caller = CallerEmail();
        var run = new ClaudeRun
        {
            TicketId = ticket.Id,
            OrganizationId = ticket.OrganizationId,
            Status = "PENDING",
            Model = modelId,
            RequestedBy = caller,
        };
        _db.ClaudeRuns.Add(run);

        var now = DateTime.UtcNow;
        var fromStage = ticket.EscalationStage;
        ticket.AssigneeType = "CLAUDE";
        ticket.EscalationStage = "ASSIGNED_CLAUDE";
        ticket.AssignedAt = now;
        ticket.AssignedBy = caller;
        ticket.AssignedTo = "claude@managedplatform.com";
        if (ticket.Status == "OPEN")
            ticket.Status = "IN_PROGRESS";
        RecordStageTransition(ticket, fromStage, ticket.EscalationStage, caller, now);

        await _db.SaveChangesAsync();

        return Accepted(new { runId = run.Id, ticketId = ticket.Id, status = run.Status });
    }

    // ===== Owner-approval loop =====
    // After a human dev finishes work they call submit-for-approval. The
    // platform owner can then approve (-> COMPLETED) or request-changes
    // (bounces back to ASSIGNED_HUMAN, increments RevisionCount, and resets
    // the dev's SLA clock so earlier cycles don't count against them).
    //
    // Claude's auto-flip is handled by ClaudeRunWorker, not by an explicit
    // submit endpoint — when the sidecar returns a PR URL, the worker flips
    // the stage on the dev's behalf.

    [HttpPost("{id}/submit-for-approval")]
    [Authorize(Roles = "DEVELOPER")]
    public async Task<IActionResult> SubmitForApproval(long id)
    {
        var ticket = await GetTicketForCurrentOrgAsync(id);
        if (ticket == null) return NotFound(new { message = "Ticket not found" });

        if (ticket.EscalationStage != "ASSIGNED_HUMAN")
            return Conflict(new
            {
                message = $"Ticket is in stage '{ticket.EscalationStage}'; expected 'ASSIGNED_HUMAN'.",
                currentStage = ticket.EscalationStage,
            });

        var caller = CallerEmail();
        var now = DateTime.UtcNow;
        var fromStage = ticket.EscalationStage;
        ticket.EscalationStage = "OWNER_APPROVAL_PENDING";
        ticket.SubmittedForApprovalAt = now;
        ticket.SubmittedForApprovalBy = caller;
        ticket.Status = "IN_REVIEW";
        RecordStageTransition(ticket, fromStage, ticket.EscalationStage, caller, now);

        await _db.SaveChangesAsync();
        return Ok(ticket);
    }

    [HttpPost("{id}/approve")]
    [Authorize(Roles = "PLATFORM_OWNER")]
    public async Task<IActionResult> Approve(long id)
    {
        var ticket = await GetTicketForCurrentOrgAsync(id);
        if (ticket == null) return NotFound(new { message = "Ticket not found" });

        if (ticket.EscalationStage != "OWNER_APPROVAL_PENDING")
            return Conflict(new
            {
                message = $"Ticket is in stage '{ticket.EscalationStage}'; expected 'OWNER_APPROVAL_PENDING'.",
                currentStage = ticket.EscalationStage,
            });

        var caller = CallerEmail();
        var now = DateTime.UtcNow;
        var fromStage = ticket.EscalationStage;
        ticket.EscalationStage = "COMPLETED";
        ticket.ApprovedAt = now;
        ticket.ApprovedBy = caller;
        ticket.ResolvedAt = now;
        ticket.Status = "RESOLVED";
        RecordStageTransition(ticket, fromStage, ticket.EscalationStage, caller, now);

        await _db.SaveChangesAsync();
        return Ok(ticket);
    }

    [HttpPost("{id}/request-changes")]
    [Authorize(Roles = "PLATFORM_OWNER")]
    public async Task<IActionResult> RequestChanges(long id, [FromBody] RequestChangesRequest request)
    {
        if (request == null || string.IsNullOrWhiteSpace(request.Reason))
            return BadRequest(new { message = "reason is required" });
        if (request.Reason.Length > 2000)
            return BadRequest(new { message = "reason must be 2000 chars or fewer" });

        var ticket = await GetTicketForCurrentOrgAsync(id);
        if (ticket == null) return NotFound(new { message = "Ticket not found" });

        if (ticket.EscalationStage != "OWNER_APPROVAL_PENDING")
            return Conflict(new
            {
                message = $"Ticket is in stage '{ticket.EscalationStage}'; expected 'OWNER_APPROVAL_PENDING'.",
                currentStage = ticket.EscalationStage,
            });

        var caller = CallerEmail();
        var now = DateTime.UtcNow;
        var fromStage = ticket.EscalationStage;
        // Bounce back. Reset the dev's SLA clock by bumping AssignedAt — the
        // score formula treats only the latest ASSIGNED_HUMAN cycle as their
        // current dev-work interval. Earlier cycles don't count against them
        // because the bounceback was owner-driven.
        ticket.EscalationStage = "ASSIGNED_HUMAN";
        ticket.RevisionCount += 1;
        ticket.SubmittedForApprovalAt = null;
        ticket.SubmittedForApprovalBy = null;
        ticket.AssignedAt = now;
        ticket.Status = "IN_PROGRESS";
        RecordStageTransition(ticket, fromStage, ticket.EscalationStage, caller, now, request.Reason);

        await _db.SaveChangesAsync();
        return Ok(ticket);
    }

    [HttpGet("{id}/claude-runs")]
    [Authorize]
    public async Task<IActionResult> GetClaudeRuns(long id)
    {
        var ticket = await GetTicketForCurrentOrgAsync(id);
        if (ticket == null) return NotFound(new { message = "Ticket not found" });

        var runs = await _db.ClaudeRuns
            .Where(r => r.TicketId == ticket.Id)
            .OrderByDescending(r => r.CreatedAt)
            .ToListAsync();
        return Ok(runs);
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
    public record AssignToHumanRequest(long DeveloperId, string DeveloperEmail);
    public record AssignToClaudeRequest(string? Model);
    public record RequestChangesRequest(string Reason);
}
