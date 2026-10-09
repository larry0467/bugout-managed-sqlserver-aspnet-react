using System.Globalization;
using System.Security.Claims;
using System.Text.RegularExpressions;
using BugsManaged.Api.Data;
using BugsManaged.Api.Entities;
using BugsManaged.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace BugsManaged.Api.Controllers;

// The development tracker: every piece of ordered development across the
// Managed Platform apps, from the Videos Managed recording that asked for it
// to the what-shipped announcement. An order is a FEATURE_REQUEST ticket
// with IsDevelopmentOrder set (see Ticket.cs), so it shares the activity
// feed, notes and attachments with the bug board.
//
// Two kinds of caller: admin users with a JWT, and Claude Code sessions with
// an X-BOM-Service-Key (role SERVICE). Both are org-scoped by
// OrgResolutionMiddleware through the organizationId claim.
[ApiController]
[Route("api/development")]
[Authorize(AuthenticationSchemes = ServiceKeys.DevelopmentSchemes)]
public class DevelopmentController : ControllerBase
{
    private readonly BugsManagedDbContext _db;
    private readonly IOrgContext _org;
    private readonly ITicketActivityLogger _activity;
    private readonly BillingService _billing;
    private readonly IAuditLogger _audit;
    private readonly DevelopmentTrackerOptions _opts;
    private readonly DevelopmentOrderService _orders;

    public DevelopmentController(
        BugsManagedDbContext db,
        IOrgContext org,
        ITicketActivityLogger activity,
        BillingService billing,
        IAuditLogger audit,
        IOptions<DevelopmentTrackerOptions> opts,
        DevelopmentOrderService orders)
    {
        _db = db;
        _org = org;
        _activity = activity;
        _billing = billing;
        _audit = audit;
        _opts = opts.Value;
        _orders = orders;
    }

    // ===== Caller identity =====

    private bool IsService() => User.IsInRole(ServiceKeys.Role);

    private bool CanWrite() => DevelopmentOrderService.CanWrite(User);

    private IActionResult Forbidden() =>
        StatusCode(403, new { message = IsService()
            ? $"This service key lacks the {ServiceKeys.ScopeDevelopmentWrite} scope"
            : "Your role cannot change development orders" });

    private string CallerEmail() =>
        User.FindFirstValue(ClaimTypes.Email) ?? User.FindFirstValue("email") ?? "unknown";

    private string CallerName() =>
        User.FindFirstValue("fullName") ?? User.FindFirstValue(ClaimTypes.Name) ?? CallerEmail();

    // ===== DTOs =====

    public record ProjectDto(long Id, string Name, string Slug);
    public record LinkDto(long Id, string Kind, string? Repo, string Name, string? Url, string? Note, string? CreatedBy, DateTime CreatedAt);
    public record StageChangeDto(string? FromStage, string ToStage, string? Note, string? ChangedBy, DateTime ChangedAt);

    public record OrderSummaryDto(
        long Id, long ProjectId, string ProjectName, string ProjectSlug,
        string Title, string? Summary, string? TestingNotes, string TicketType, string? FixStatus, string Priority, string Status,
        string Stage, string StageLabel, int StageOrder,
        string? OrderedBy, DateTime OrderedAt,
        string? VideoUrl, bool HasTranscript,
        string? SessionLogUrl, string? SessionId,
        DateTime? ProductionAt, string? AnnouncementVideoUrl, DateTime? AnnouncedAt, DateTime? DigestSentAt,
        bool NeedsAnnouncement, string BoardUrl, DateTime UpdatedAt,
        List<LinkDto> Links);

    public record OrderDetailDto(
        OrderSummaryDto Order, string? Transcript,
        List<StageChangeDto> StageHistory, List<TicketActivity> Activity);

    public record LinkRequest(string Kind, string? Repo, string Name, string? Url, string? Note);

    public record CreateOrderRequest(
        long? ProjectId, string? ProjectSlug, string Title, string? Summary,
        string? VideoUrl, string? Transcript, string? SessionLogUrl, string? SessionId,
        string? OrderedBy, string? Stage, string? Priority, List<LinkRequest>? Links,
        string? TestingNotes = null);

    public record PromoteRequest(string? Stage, string? SessionLogUrl, string? SessionId);

    // null = leave the field alone; "" = clear it.
    public record UpdateOrderRequest(
        string? Title, string? Summary, string? VideoUrl, string? Transcript,
        string? SessionLogUrl, string? SessionId, string? AnnouncementVideoUrl,
        string? Priority, string? OrderedBy, string? TestingNotes = null);

    public record SetStageRequest(string Stage, string? Note);

    public record EnsureProjectRequest(string Name, string? Slug);

    private static readonly string[] Priorities = { "CRITICAL", "HIGH", "MEDIUM", "LOW" };
    private static string[] LinkKinds => DevelopmentOrderService.LinkKinds;

    // ===== Reference data =====

    [HttpGet("stages")]
    public IActionResult Stages() =>
        Ok(DevelopmentStages.All.Select((s, i) => new { key = s, label = DevelopmentStages.Labels[s], order = i }));

    [HttpGet("projects")]
    public async Task<IActionResult> Projects()
    {
        if (_org.CurrentOrganizationId == null) return Unauthorized(new { message = "No organization context" });

        var rows = await _db.Projects
            .OrderBy(p => p.Name)
            .Select(p => new ProjectDto(p.Id, p.Name, p.Slug))
            .ToListAsync();
        return Ok(rows);
    }

    // Idempotent "make sure this app exists": returns the existing project
    // when the slug or name matches, creates it otherwise. Sessions call it
    // before logging the first order for a new app.
    [HttpPost("projects")]
    public async Task<IActionResult> EnsureProject([FromBody] EnsureProjectRequest body)
    {
        if (_org.CurrentOrganizationId == null) return Unauthorized(new { message = "No organization context" });
        if (!CanWrite()) return Forbidden();
        if (body == null || string.IsNullOrWhiteSpace(body.Name))
            return BadRequest(new { message = "name is required" });

        var name = body.Name.Trim();
        var slug = Slugify(string.IsNullOrWhiteSpace(body.Slug) ? name : body.Slug);
        if (slug.Length == 0) return BadRequest(new { message = "slug must contain letters or digits" });

        var existing = await _db.Projects.FirstOrDefaultAsync(p => p.Slug == slug || p.Name == name);
        if (existing != null) return Ok(new ProjectDto(existing.Id, existing.Name, existing.Slug));

        // Projects.Slug is unique across the whole table, not per org.
        if (await _db.Projects.IgnoreQueryFilters().AnyAsync(p => p.Slug == slug))
            return Conflict(new { message = $"Slug '{slug}' is already used by another organization's application" });

        var orgId = _org.CurrentOrganizationId.Value;
        var (allowed, reason) = await _billing.CheckProjectLimitAsync(orgId);
        if (!allowed) return StatusCode(402, new { message = reason });

        var project = new Project { OrganizationId = orgId, Name = name, Slug = slug };
        _db.Projects.Add(project);
        await _db.SaveChangesAsync();

        return StatusCode(201, new ProjectDto(project.Id, project.Name, project.Slug));
    }

    // ===== Board =====

    [HttpGet("orders")]
    public async Task<IActionResult> ListOrders(
        [FromQuery] long? projectId,
        [FromQuery] string? projectSlug,
        [FromQuery] string? stage,
        [FromQuery] bool? needsAnnouncement,
        [FromQuery] string? search,
        [FromQuery] bool includeAnnounced = true)
    {
        if (_org.CurrentOrganizationId == null) return Unauthorized(new { message = "No organization context" });

        var q = _db.Tickets.Where(t => t.IsDevelopmentOrder);

        if (projectId.HasValue)
            q = q.Where(t => t.ProjectId == projectId.Value);

        if (!string.IsNullOrWhiteSpace(projectSlug))
        {
            var slug = projectSlug.Trim();
            var pid = await _db.Projects.Where(p => p.Slug == slug).Select(p => (long?)p.Id).FirstOrDefaultAsync();
            if (pid == null) return Ok(new List<OrderSummaryDto>());
            q = q.Where(t => t.ProjectId == pid.Value);
        }

        if (!string.IsNullOrWhiteSpace(stage))
        {
            var keys = stage.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .Select(DevelopmentStages.Normalize)
                .Where(k => k != null)
                .Select(k => k!)
                .ToList();
            if (keys.Count > 0) q = q.Where(t => t.DevelopmentStage != null && keys.Contains(t.DevelopmentStage));
        }

        if (needsAnnouncement == true)
            q = q.Where(t => t.DevelopmentStage == DevelopmentStages.Production && t.AnnouncementVideoUrl == null);

        if (!includeAnnounced)
            q = q.Where(t => t.DevelopmentStage != DevelopmentStages.Announced);

        if (!string.IsNullOrWhiteSpace(search))
        {
            // Lower both sides: SQL Server's default collation is already
            // case-insensitive, the in-memory provider (tests) is not.
            var s = search.Trim().ToLowerInvariant();
            q = q.Where(t => t.Title.ToLower().Contains(s) || (t.Description != null && t.Description.ToLower().Contains(s)));
        }

        var tickets = await q.OrderByDescending(t => t.CreatedAt).ToListAsync();
        return Ok(await ToSummariesAsync(tickets));
    }

    [HttpGet("orders/{id}")]
    public async Task<IActionResult> GetOrder(long id)
    {
        var ticket = await FindOrderAsync(id);
        if (ticket == null) return NotFound(new { message = "Development order not found" });
        return Ok(await ToDetailAsync(ticket));
    }

    // Everything that reached production on one local day - the digest's
    // query, exposed so the board and a session can ask the same question.
    [HttpGet("shipped")]
    public async Task<IActionResult> Shipped([FromQuery] string? date)
    {
        if (_org.CurrentOrganizationId == null) return Unauthorized(new { message = "No organization context" });

        var tz = _opts.ResolveTimeZone();
        DateTime day;
        if (string.IsNullOrWhiteSpace(date))
            day = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, tz).Date;
        else if (!DateTime.TryParseExact(date, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out day))
            return BadRequest(new { message = "date must be yyyy-MM-dd" });

        var startUtc = TimeZoneInfo.ConvertTimeToUtc(DateTime.SpecifyKind(day, DateTimeKind.Unspecified), tz);
        var endUtc = TimeZoneInfo.ConvertTimeToUtc(DateTime.SpecifyKind(day.AddDays(1), DateTimeKind.Unspecified), tz);

        var tickets = await _db.Tickets
            .Where(t => t.IsDevelopmentOrder && t.ProductionAt != null && t.ProductionAt >= startUtc && t.ProductionAt < endUtc)
            .OrderBy(t => t.ProductionAt)
            .ToListAsync();

        return Ok(new { date = day.ToString("yyyy-MM-dd"), timeZone = tz.Id, items = await ToSummariesAsync(tickets) });
    }

    // ===== Create / promote =====

    [HttpPost("orders")]
    public async Task<IActionResult> CreateOrder([FromBody] CreateOrderRequest body)
    {
        if (_org.CurrentOrganizationId == null) return Unauthorized(new { message = "No organization context" });
        if (!CanWrite()) return Forbidden();
        if (body == null) return BadRequest(new { message = "body is required" });

        var title = (body.Title ?? string.Empty).Trim();
        if (title.Length == 0) return BadRequest(new { message = "title is required" });
        if (title.Length > 500) return BadRequest(new { message = "title must be 500 characters or fewer" });

        var stage = DevelopmentStages.Normalize(body.Stage) ?? (string.IsNullOrWhiteSpace(body.Stage) ? DevelopmentStages.Ordered : null);
        if (stage == null) return BadRequest(new { message = $"Unknown stage '{body.Stage}'. Valid: {string.Join(", ", DevelopmentStages.All)}" });

        var priority = NormalizePriority(body.Priority);
        if (priority == null) return BadRequest(new { message = $"Unknown priority '{body.Priority}'. Valid: {string.Join(", ", Priorities)}" });

        if (body.VideoUrl != null && body.VideoUrl.Length > 500)
            return BadRequest(new { message = "videoUrl must be 500 characters or fewer" });

        var linkError = ValidateLinks(body.Links);
        if (linkError != null) return BadRequest(new { message = linkError });

        var project = await ResolveProjectAsync(body.ProjectId, body.ProjectSlug);
        if (project == null)
        {
            var known = await _db.Projects.OrderBy(p => p.Name).Select(p => p.Slug).ToListAsync();
            return BadRequest(new { message = "projectId or projectSlug must name an application in your organization", knownSlugs = known });
        }

        var orgId = _org.CurrentOrganizationId.Value;
        var (allowed, reason) = await _billing.CheckTicketLimitAsync(orgId);
        if (!allowed) return StatusCode(402, new { message = reason });

        var now = DateTime.UtcNow;
        var actorEmail = CallerEmail();
        var actorName = CallerName();
        var statusKeys = await StatusKeysAsync();

        var ticket = new Ticket
        {
            OrganizationId = orgId,
            ProjectId = project.Id,
            TicketType = "FEATURE_REQUEST",
            Title = title,
            Description = Clean(body.Summary),
            Priority = priority,
            Status = OpenStatus(statusKeys),
            Visibility = "PLATFORM",
            // Orders are not bug reports; keep them out of the triage chain.
            EscalationStage = "NONE",
            SubmittedBy = Clean(body.OrderedBy) ?? actorName,
            VideoUrl = Clean(body.VideoUrl),
            Transcript = Clean(body.Transcript),
            IsDevelopmentOrder = true,
            DevelopmentStage = stage,
            SessionLogUrl = Clean(body.SessionLogUrl),
            SessionId = Clean(body.SessionId),
            TestingNotes = Clean(body.TestingNotes),
            CreatedAt = now,
            UpdatedAt = now,
        };
        ApplyStageSideEffects(ticket, null, stage, now, statusKeys);

        _db.Tickets.Add(ticket);
        await _db.SaveChangesAsync();

        RecordStage(ticket, null, stage, actorEmail, now, "ordered");
        _activity.Log(ticket, "DEV_ORDER_CREATED",
            $"{actorName} ordered development: {title} ({DevelopmentStages.Labels[stage]})",
            actorEmail, actorName,
            payload: new { stage, videoUrl = ticket.VideoUrl, sessionLogUrl = ticket.SessionLogUrl });

        foreach (var l in body.Links ?? new List<LinkRequest>())
            _db.TicketDevelopmentLinks.Add(NewLink(ticket, l, actorEmail));

        await _db.SaveChangesAsync();

        _audit.Record(
            action: "development.order-created",
            outcome: "success",
            actorEmail: actorEmail,
            organizationId: orgId,
            targetTicketId: ticket.Id,
            extra: new Dictionary<string, object?> { ["stage"] = stage, ["project"] = project.Slug, ["service"] = IsService() });

        return CreatedAtAction(nameof(GetOrder), new { id = ticket.Id }, await ToDetailAsync(ticket));
    }

    // Turn an ordinary ticket (usually a FEATURE_REQUEST from the widget)
    // into a development order. Keeps its history; sets the bit and a stage.
    [HttpPost("orders/from-ticket/{ticketId}")]
    public async Task<IActionResult> PromoteTicket(long ticketId, [FromBody] PromoteRequest? body)
    {
        if (_org.CurrentOrganizationId == null) return Unauthorized(new { message = "No organization context" });
        if (!CanWrite()) return Forbidden();

        var ticket = await _db.Tickets.FirstOrDefaultAsync(t => t.Id == ticketId);
        if (ticket == null) return NotFound(new { message = "Ticket not found" });
        if (ticket.IsDevelopmentOrder)
            return Conflict(new { message = "Ticket is already a development order", id = ticket.Id });

        var stage = DevelopmentStages.Normalize(body?.Stage) ?? (string.IsNullOrWhiteSpace(body?.Stage) ? DevelopmentStages.Ordered : null);
        if (stage == null) return BadRequest(new { message = $"Unknown stage '{body?.Stage}'. Valid: {string.Join(", ", DevelopmentStages.All)}" });

        var now = DateTime.UtcNow;
        var actorEmail = CallerEmail();
        var actorName = CallerName();
        var statusKeys = await StatusKeysAsync();

        ticket.IsDevelopmentOrder = true;
        ticket.DevelopmentStage = stage;
        if (!string.IsNullOrWhiteSpace(body?.SessionLogUrl)) ticket.SessionLogUrl = body.SessionLogUrl.Trim();
        if (!string.IsNullOrWhiteSpace(body?.SessionId)) ticket.SessionId = body.SessionId.Trim();
        ApplyStageSideEffects(ticket, null, stage, now, statusKeys);

        RecordStage(ticket, null, stage, actorEmail, now, "promoted to development order");
        _activity.Log(ticket, "DEV_ORDER_CREATED",
            $"{actorName} promoted this ticket to a development order ({DevelopmentStages.Labels[stage]})",
            actorEmail, actorName, payload: new { stage, promoted = true });

        await _db.SaveChangesAsync();

        _audit.Record(
            action: "development.ticket-promoted",
            outcome: "success",
            actorEmail: actorEmail,
            organizationId: ticket.OrganizationId,
            targetTicketId: ticket.Id,
            extra: new Dictionary<string, object?> { ["stage"] = stage });

        return Ok(await ToDetailAsync(ticket));
    }

    // ===== Update =====

    [HttpPatch("orders/{id}")]
    public async Task<IActionResult> UpdateOrder(long id, [FromBody] UpdateOrderRequest body)
    {
        if (!CanWrite()) return Forbidden();
        if (body == null) return BadRequest(new { message = "body is required" });

        var ticket = await FindOrderAsync(id);
        if (ticket == null) return NotFound(new { message = "Development order not found" });

        var changed = new List<string>();
        var now = DateTime.UtcNow;
        var actorEmail = CallerEmail();
        var actorName = CallerName();

        if (body.Title != null)
        {
            var title = body.Title.Trim();
            if (title.Length == 0) return BadRequest(new { message = "title cannot be empty" });
            if (title.Length > 500) return BadRequest(new { message = "title must be 500 characters or fewer" });
            if (title != ticket.Title) { ticket.Title = title; changed.Add("title"); }
        }
        if (body.Priority != null)
        {
            var priority = NormalizePriority(body.Priority);
            if (priority == null) return BadRequest(new { message = $"Unknown priority '{body.Priority}'. Valid: {string.Join(", ", Priorities)}" });
            if (priority != ticket.Priority) { ticket.Priority = priority; changed.Add("priority"); }
        }
        if (body.VideoUrl != null && body.VideoUrl.Length > 500)
            return BadRequest(new { message = "videoUrl must be 500 characters or fewer" });

        Set(body.Summary, () => ticket.Description, v => ticket.Description = v, "summary", changed);
        Set(body.VideoUrl, () => ticket.VideoUrl, v => ticket.VideoUrl = v, "videoUrl", changed);
        Set(body.Transcript, () => ticket.Transcript, v => ticket.Transcript = v, "transcript", changed);
        Set(body.SessionLogUrl, () => ticket.SessionLogUrl, v => ticket.SessionLogUrl = v, "sessionLogUrl", changed);
        Set(body.SessionId, () => ticket.SessionId, v => ticket.SessionId = v, "sessionId", changed);
        Set(body.OrderedBy, () => ticket.SubmittedBy, v => ticket.SubmittedBy = v, "orderedBy", changed);
        Set(body.TestingNotes, () => ticket.TestingNotes, v => ticket.TestingNotes = v, "testingNotes", changed);

        string? stageNote = null;
        if (body.AnnouncementVideoUrl != null)
        {
            var before = ticket.AnnouncementVideoUrl;
            var after = Clean(body.AnnouncementVideoUrl);
            if (before != after)
            {
                ticket.AnnouncementVideoUrl = after;
                changed.Add("announcementVideoUrl");

                var statusKeys = await StatusKeysAsync();
                if (after != null && ticket.DevelopmentStage == DevelopmentStages.Production)
                {
                    MoveStage(ticket, DevelopmentStages.Announced, actorEmail, actorName, now, statusKeys,
                        "announcement video attached");
                    stageNote = "stage -> " + DevelopmentStages.Labels[DevelopmentStages.Announced];
                }
                else if (after == null && ticket.DevelopmentStage == DevelopmentStages.Announced)
                {
                    MoveStage(ticket, DevelopmentStages.Production, actorEmail, actorName, now, statusKeys,
                        "announcement video removed");
                    stageNote = "stage -> " + DevelopmentStages.Labels[DevelopmentStages.Production];
                }
            }
        }

        if (changed.Count == 0) return Ok(await ToDetailAsync(ticket));

        ticket.UpdatedAt = now;
        _activity.Log(ticket, "DEV_ORDER_UPDATED",
            $"{actorName} updated {string.Join(", ", changed)}" + (stageNote != null ? $" ({stageNote})" : ""),
            actorEmail, actorName, payload: new { fields = changed });

        await _db.SaveChangesAsync();
        return Ok(await ToDetailAsync(ticket));
    }

    [HttpPut("orders/{id}/stage")]
    public async Task<IActionResult> SetStage(long id, [FromBody] SetStageRequest body)
    {
        if (!CanWrite()) return Forbidden();
        if (body == null || string.IsNullOrWhiteSpace(body.Stage))
            return BadRequest(new { message = "stage is required" });

        var stage = DevelopmentStages.Normalize(body.Stage);
        if (stage == null)
            return BadRequest(new { message = $"Unknown stage '{body.Stage}'. Valid: {string.Join(", ", DevelopmentStages.All)}" });
        if (body.Note != null && body.Note.Length > 2000)
            return BadRequest(new { message = "note must be 2000 characters or fewer" });

        var ticket = await FindOrderAsync(id);
        if (ticket == null) return NotFound(new { message = "Development order not found" });

        if (ticket.DevelopmentStage == stage)
            return Ok(await ToDetailAsync(ticket));

        var now = DateTime.UtcNow;
        var actorEmail = CallerEmail();
        var actorName = CallerName();
        var statusKeys = await StatusKeysAsync();
        var from = ticket.DevelopmentStage;

        MoveStage(ticket, stage, actorEmail, actorName, now, statusKeys, Clean(body.Note));
        await _db.SaveChangesAsync();

        _audit.Record(
            action: "development.stage-changed",
            outcome: "success",
            actorEmail: actorEmail,
            organizationId: ticket.OrganizationId,
            targetTicketId: ticket.Id,
            extra: new Dictionary<string, object?> { ["fromStage"] = from, ["toStage"] = stage, ["service"] = IsService() });

        return Ok(await ToDetailAsync(ticket));
    }

    // ===== Links =====

    [HttpPost("orders/{id}/links")]
    public async Task<IActionResult> AddLink(long id, [FromBody] LinkRequest body)
    {
        if (!CanWrite()) return Forbidden();
        var error = ValidateLinks(body == null ? null : new List<LinkRequest> { body });
        if (body == null || error != null) return BadRequest(new { message = error ?? "body is required" });

        var ticket = await FindOrderAsync(id);
        if (ticket == null) return NotFound(new { message = "Development order not found" });

        var actorEmail = CallerEmail();
        var actorName = CallerName();
        var link = NewLink(ticket, body, actorEmail);
        _db.TicketDevelopmentLinks.Add(link);

        _activity.Log(ticket, "DEV_LINK_ADDED",
            $"{actorName} linked {link.Kind.ToLowerInvariant()} {(link.Repo != null ? link.Repo + " " : "")}{link.Name}",
            actorEmail, actorName, payload: new { link.Kind, link.Repo, link.Name, link.Url });

        await _db.SaveChangesAsync();
        return StatusCode(201, ToLinkDto(link));
    }

    [HttpDelete("orders/{id}/links/{linkId}")]
    public async Task<IActionResult> RemoveLink(long id, long linkId)
    {
        if (!CanWrite()) return Forbidden();

        var ticket = await FindOrderAsync(id);
        if (ticket == null) return NotFound(new { message = "Development order not found" });

        var link = await _db.TicketDevelopmentLinks.FirstOrDefaultAsync(l => l.Id == linkId && l.TicketId == ticket.Id);
        if (link == null) return NoContent();

        var actorEmail = CallerEmail();
        var actorName = CallerName();
        _db.TicketDevelopmentLinks.Remove(link);
        _activity.Log(ticket, "DEV_LINK_REMOVED",
            $"{actorName} removed {link.Kind.ToLowerInvariant()} {(link.Repo != null ? link.Repo + " " : "")}{link.Name}",
            actorEmail, actorName, payload: new { link.Kind, link.Repo, link.Name, link.Url });

        await _db.SaveChangesAsync();
        return NoContent();
    }

    // ===== Internals =====
    // The stage / link / status rules are in DevelopmentOrderService so the
    // Azure DevOps webhook applies exactly the same ones.

    private Task<Ticket?> FindOrderAsync(long id) => _orders.FindOrderAsync(id);

    private Task<HashSet<string>> StatusKeysAsync() => _orders.StatusKeysAsync();

    private static string OpenStatus(HashSet<string> statusKeys) => DevelopmentOrderService.OpenStatus(statusKeys);

    private void MoveStage(Ticket ticket, string toStage, string actorEmail, string actorName, DateTime now,
        HashSet<string> statusKeys, string? note) =>
        _orders.MoveStage(ticket, toStage, actorEmail, actorName, now, statusKeys, note);

    private static void ApplyStageSideEffects(Ticket ticket, string? from, string to, DateTime now, HashSet<string> statusKeys) =>
        DevelopmentOrderService.ApplyStageSideEffects(ticket, from, to, now, statusKeys);

    private void RecordStage(Ticket ticket, string? from, string to, string changedBy, DateTime at, string? note) =>
        _orders.RecordStage(ticket, from, to, changedBy, at, note);

    private static TicketDevelopmentLink NewLink(Ticket ticket, LinkRequest l, string createdBy) =>
        DevelopmentOrderService.NewLink(ticket, l.Kind, l.Repo, l.Name, l.Url, l.Note, createdBy);

    private static string? Clean(string? value) => DevelopmentOrderService.Clean(value);

    private async Task<Project?> ResolveProjectAsync(long? projectId, string? projectSlug)
    {
        if (projectId.HasValue)
            return await _db.Projects.FirstOrDefaultAsync(p => p.Id == projectId.Value);
        if (!string.IsNullOrWhiteSpace(projectSlug))
        {
            var slug = projectSlug.Trim();
            return await _db.Projects.FirstOrDefaultAsync(p => p.Slug == slug)
                ?? await _db.Projects.FirstOrDefaultAsync(p => p.Name == slug);
        }
        return null;
    }

    private static string? ValidateLinks(List<LinkRequest>? links)
    {
        if (links == null) return null;
        foreach (var l in links)
        {
            if (l == null) return "link entries cannot be null";
            if (string.IsNullOrWhiteSpace(l.Kind) || !LinkKinds.Contains(l.Kind.Trim().ToUpperInvariant()))
                return $"link kind must be one of {string.Join(", ", LinkKinds)}";
            if (string.IsNullOrWhiteSpace(l.Name)) return "link name is required";
            if (l.Name.Length > 255) return "link name must be 255 characters or fewer";
            if (l.Url != null && l.Url.Length > 2000) return "link url must be 2000 characters or fewer";
            if (l.Repo != null && l.Repo.Length > 100) return "link repo must be 100 characters or fewer";
            if (l.Note != null && l.Note.Length > 1000) return "link note must be 1000 characters or fewer";
        }
        return null;
    }

    private static string? NormalizePriority(string? priority)
    {
        if (string.IsNullOrWhiteSpace(priority)) return "MEDIUM";
        var p = priority.Trim().ToUpperInvariant();
        return Priorities.Contains(p) ? p : null;
    }

    // PATCH semantics: null leaves the field, "" clears it.
    private static void Set(string? incoming, Func<string?> current, Action<string?> apply, string field, List<string> changed)
    {
        if (incoming == null) return;
        var next = Clean(incoming);
        if (next == current()) return;
        apply(next);
        changed.Add(field);
    }

    private static string Slugify(string value)
    {
        var s = value.Trim().ToLowerInvariant();
        s = Regex.Replace(s, "[^a-z0-9]+", "-").Trim('-');
        return s.Length > 255 ? s[..255] : s;
    }

    private string BoardUrl(long id) =>
        $"{_opts.BoardBaseUrl.TrimEnd('/')}/development/{id}";

    private static LinkDto ToLinkDto(TicketDevelopmentLink l) =>
        new(l.Id, l.Kind, l.Repo, l.Name, l.Url, l.Note, l.CreatedBy, l.CreatedAt);

    private OrderSummaryDto ToSummary(Ticket t, Project? p, List<LinkDto> links)
    {
        var stage = t.DevelopmentStage ?? DevelopmentStages.Ordered;
        return new OrderSummaryDto(
            t.Id, t.ProjectId, p?.Name ?? $"Project {t.ProjectId}", p?.Slug ?? string.Empty,
            t.Title, t.Description, t.TestingNotes, t.TicketType, t.FixStatus, t.Priority, t.Status,
            stage, DevelopmentStages.Labels.TryGetValue(stage, out var label) ? label : stage, DevelopmentStages.OrderOf(stage),
            t.SubmittedBy, t.CreatedAt,
            t.VideoUrl, !string.IsNullOrWhiteSpace(t.Transcript),
            t.SessionLogUrl, t.SessionId,
            t.ProductionAt, t.AnnouncementVideoUrl, t.AnnouncedAt, t.DigestSentAt,
            stage == DevelopmentStages.Production && string.IsNullOrWhiteSpace(t.AnnouncementVideoUrl),
            BoardUrl(t.Id), t.UpdatedAt,
            links);
    }

    private async Task<List<OrderSummaryDto>> ToSummariesAsync(List<Ticket> tickets)
    {
        if (tickets.Count == 0) return new List<OrderSummaryDto>();

        var projectIds = tickets.Select(t => t.ProjectId).Distinct().ToList();
        var projects = await _db.Projects.Where(p => projectIds.Contains(p.Id)).ToDictionaryAsync(p => p.Id);

        var ids = tickets.Select(t => t.Id).ToList();
        var links = await _db.TicketDevelopmentLinks
            .Where(l => ids.Contains(l.TicketId))
            .OrderBy(l => l.CreatedAt).ThenBy(l => l.Id)
            .ToListAsync();
        var linksByTicket = links.GroupBy(l => l.TicketId)
            .ToDictionary(g => g.Key, g => g.Select(ToLinkDto).ToList());

        return tickets
            .Select(t => ToSummary(t, projects.GetValueOrDefault(t.ProjectId), linksByTicket.GetValueOrDefault(t.Id) ?? new List<LinkDto>()))
            .ToList();
    }

    private async Task<OrderDetailDto> ToDetailAsync(Ticket ticket)
    {
        var summary = (await ToSummariesAsync(new List<Ticket> { ticket }))[0];

        var history = await _db.TicketStageHistory
            .Where(h => h.TicketId == ticket.Id && DevelopmentStages.All.Contains(h.ToStage))
            .OrderBy(h => h.ChangedAt).ThenBy(h => h.Id)
            .Select(h => new StageChangeDto(h.FromStage, h.ToStage, h.Note, h.ChangedBy, h.ChangedAt))
            .ToListAsync();

        var activity = await _db.TicketActivities
            .Where(a => a.TicketId == ticket.Id)
            .OrderByDescending(a => a.CreatedAt).ThenByDescending(a => a.Id)
            .Take(200)
            .ToListAsync();

        return new OrderDetailDto(summary, ticket.Transcript, history, activity);
    }
}
