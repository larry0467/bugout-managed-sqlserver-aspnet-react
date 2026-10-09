using System.Security.Claims;
using BugsManaged.Api.Data;
using BugsManaged.Api.Entities;
using BugsManaged.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace BugsManaged.Api.Controllers;

// The drafted-fix queue. A subscriber's bug report (video, transcript,
// console errors) is queued here, the dispatcher on the devbox claims it,
// runs Claude Code against the app's repos, opens PRs against dev and posts
// the result back. Nothing here merges or publishes anything: a human
// approves or rejects, the team merges, beta picks it up.
//
// Keys (role SERVICE) drive the queue: list, claim, release, result. Humans
// request fixes, flip the per-app switch, approve and reject.
[ApiController]
[Route("api/development/fixes")]
[Authorize(AuthenticationSchemes = ServiceKeys.DevelopmentSchemes)]
public class DevelopmentFixController : ControllerBase
{
    private readonly BugsManagedDbContext _db;
    private readonly IOrgContext _org;
    private readonly ITicketActivityLogger _activity;
    private readonly DevelopmentOrderService _orders;
    private readonly TicketNoteService _notes;
    private readonly IVideoBlobService _videos;
    private readonly IScreenshotBlobService _screenshots;
    private readonly IAuditLogger _audit;
    private readonly DevelopmentTrackerOptions _opts;
    private readonly ILogger<DevelopmentFixController> _log;
    private readonly IVideosManagedClient _videosManaged;
    private readonly ITicketNotificationService _notify;

    public DevelopmentFixController(
        BugsManagedDbContext db, IOrgContext org, ITicketActivityLogger activity, DevelopmentOrderService orders,
        TicketNoteService notes, IVideoBlobService videos, IScreenshotBlobService screenshots, IAuditLogger audit,
        IOptions<DevelopmentTrackerOptions> opts, ILogger<DevelopmentFixController> log,
        IVideosManagedClient videosManaged, ITicketNotificationService notify)
    {
        _db = db;
        _org = org;
        _activity = activity;
        _orders = orders;
        _notes = notes;
        _videos = videos;
        _screenshots = screenshots;
        _audit = audit;
        _opts = opts.Value;
        _log = log;
        _videosManaged = videosManaged;
        _notify = notify;
    }

    // ===== identity =====

    private bool IsService() => User.IsInRole(ServiceKeys.Role);
    private bool CanWrite() => DevelopmentOrderService.CanWrite(User);
    // Approving a fix, rejecting it and flipping the per-app switch are human
    // decisions: a key can never do them, whatever its scopes.
    private bool IsHumanAdmin() => !IsService() && (User.IsInRole("PLATFORM_OWNER") || User.IsInRole("SUPER_ADMIN"));

    private string CallerEmail() => User.FindFirstValue(ClaimTypes.Email) ?? User.FindFirstValue("email") ?? "unknown";
    private string CallerName() => User.FindFirstValue("fullName") ?? User.FindFirstValue(ClaimTypes.Name) ?? CallerEmail();

    private IActionResult Forbidden(string why) => StatusCode(403, new { message = why });

    // ===== DTOs =====

    public record FixAttachmentDto(long Id, string FileName, string? ContentType, long SizeBytes, string? Url, bool FromChat);

    public record FixQueueItemDto(
        long TicketId, long ProjectId, string ProjectSlug, string ProjectName,
        string TicketType, string Title, string? Description, string Priority, string Status,
        string? SubmittedBy, DateTime CreatedAt,
        string? CurrentPageUrl, string? CurrentPageName, string? BrowserInfo, int? ScreenWidth, int? ScreenHeight,
        string? ConsoleErrors, string? NetworkErrors, string? Transcript, string? VideoUrl,
        string? TenantId, string? TenantName, string? DatabaseName, string? ApplicationVersion, string? Environment,
        string? FixStatus, string? FixStatusLabel, DateTime? FixRequestedAt, DateTime? FixClaimedAt, string? FixClaimedBy,
        DateTime? FixCompletedAt, string? FixSummary, string? FixFeedback, string? TestingNotes,
        string? TriageDecision, string? TriageDecisionLabel, string? TriagedBy, DateTime? TriagedAt,
        string? GuidanceVideoUrl, string? GuidanceTranscript,
        bool IsDevelopmentOrder, string? DevelopmentStage, string BoardUrl,
        List<DevelopmentController.LinkDto> Links, List<FixAttachmentDto> Attachments);

    public record AppFixSettingDto(long Id, string Name, string Slug, bool AutoDraftFixes, int Requested, int Claimed, int ReadyToTest);
    public record AutoDraftRequest(bool Enabled);
    public record RequestFixRequest(string? Note);
    public record TriageRequest(string Decision, string? Note, string? GuidanceVideoUrl);
    public record ClaimRequest(string? Worker);
    public record FixResultRequest(string Outcome, string? Summary, List<DevelopmentController.LinkRequest>? Links, string? TestingNotes);
    public record RejectRequest(string? Reason, bool Requeue);

    // ===== per-app switch =====

    [HttpGet("apps")]
    public async Task<IActionResult> Apps()
    {
        if (_org.CurrentOrganizationId == null) return Unauthorized(new { message = "No organization context" });

        var projects = await _db.Projects.OrderBy(p => p.Name).ToListAsync();
        var counts = await _db.Tickets
            .Where(t => t.FixStatus != null)
            .GroupBy(t => new { t.ProjectId, t.FixStatus })
            .Select(g => new { g.Key.ProjectId, g.Key.FixStatus, Count = g.Count() })
            .ToListAsync();

        int Count(long pid, string status) => counts.Where(c => c.ProjectId == pid && c.FixStatus == status).Sum(c => c.Count);

        return Ok(projects.Select(p => new AppFixSettingDto(p.Id, p.Name, p.Slug, p.AutoDraftFixes,
            Count(p.Id, FixStatuses.Requested), Count(p.Id, FixStatuses.Claimed), Count(p.Id, FixStatuses.ReadyToTest))).ToList());
    }

    [HttpPut("apps/{projectId}")]
    public async Task<IActionResult> SetAutoDraft(long projectId, [FromBody] AutoDraftRequest body)
    {
        if (!IsHumanAdmin()) return Forbidden("Only a platform owner or super admin can change auto-draft settings");
        var project = await _db.Projects.FirstOrDefaultAsync(p => p.Id == projectId);
        if (project == null) return NotFound(new { message = "Application not found" });

        if (project.AutoDraftFixes != body.Enabled)
        {
            project.AutoDraftFixes = body.Enabled;
            await _db.SaveChangesAsync();
            _audit.Record(action: body.Enabled ? "development.auto-draft-enabled" : "development.auto-draft-disabled",
                outcome: "success", actorEmail: CallerEmail(), organizationId: project.OrganizationId,
                targetType: "Project", targetId: project.Id.ToString());
        }
        return Ok(new AppFixSettingDto(project.Id, project.Name, project.Slug, project.AutoDraftFixes, 0, 0, 0));
    }

    // ===== queue =====

    [HttpGet("queue")]
    public async Task<IActionResult> Queue([FromQuery] string? projectSlug, [FromQuery] string? status, [FromQuery] int take = 20)
    {
        if (_org.CurrentOrganizationId == null) return Unauthorized(new { message = "No organization context" });

        var wanted = FixStatuses.Normalize(status) ?? FixStatuses.Requested;
        var q = _db.Tickets.Where(t => t.FixStatus == wanted);
        if (!string.IsNullOrWhiteSpace(projectSlug))
        {
            var slug = projectSlug.Trim();
            var pid = await _db.Projects.Where(p => p.Slug == slug).Select(p => (long?)p.Id).FirstOrDefaultAsync();
            if (pid == null) return Ok(new List<FixQueueItemDto>());
            q = q.Where(t => t.ProjectId == pid.Value);
        }

        var tickets = await q.OrderBy(t => t.FixRequestedAt).ThenBy(t => t.Id).Take(Math.Clamp(take, 1, 50)).ToListAsync();
        var items = new List<FixQueueItemDto>();
        foreach (var t in tickets) items.Add(await ToItemAsync(t, withBlobUrls: true));
        return Ok(items);
    }

    [HttpGet("{ticketId}")]
    public async Task<IActionResult> Get(long ticketId)
    {
        var ticket = await _db.Tickets.FirstOrDefaultAsync(t => t.Id == ticketId);
        if (ticket == null) return NotFound(new { message = "Ticket not found" });
        return Ok(await ToItemAsync(ticket, withBlobUrls: true));
    }

    // Any ticket can be sent to the queue by hand (a feature request, a bug on
    // an app without auto-draft, a rejected fix with new guidance).
    [HttpPost("{ticketId}/request")]
    public async Task<IActionResult> RequestFix(long ticketId, [FromBody] RequestFixRequest? body)
    {
        if (!CanWrite()) return Forbidden("Your role or key cannot request fixes");
        var ticket = await _db.Tickets.FirstOrDefaultAsync(t => t.Id == ticketId);
        if (ticket == null) return NotFound(new { message = "Ticket not found" });
        if (ticket.FixStatus == FixStatuses.Claimed)
            return Conflict(new { message = "A fix is being drafted right now; release it first", fixStatus = ticket.FixStatus });

        var note = DevelopmentOrderService.Clean(body?.Note);
        QueueForFix(ticket, note, DateTime.UtcNow);
        _activity.Log(ticket, "FIX_REQUESTED",
            $"{CallerName()} requested a drafted fix" + (note != null ? $" — {note}" : ""),
            CallerEmail(), CallerName(), payload: new { auto = false, note });
        await _db.SaveChangesAsync();
        return Ok(await ToItemAsync(ticket, withBlobUrls: false));
    }

    // The human gate: somebody watched the video and decided. Only DEVELOP puts
    // the ticket in front of Claude; the other three decisions end or park it.
    [HttpPost("{ticketId}/triage")]
    public async Task<IActionResult> Triage(long ticketId, [FromBody] TriageRequest body)
    {
        if (!CanWrite()) return Forbidden("Your role or key cannot triage tickets");
        var decision = TriageDecisions.Normalize(body?.Decision);
        if (decision == null)
            return BadRequest(new { message = $"decision must be one of {string.Join(", ", TriageDecisions.All)}" });
        if (body!.Note != null && body.Note.Length > 4000)
            return BadRequest(new { message = "note must be 4000 characters or fewer" });
        var guidanceUrl = DevelopmentOrderService.Clean(body.GuidanceVideoUrl);
        if (guidanceUrl != null && guidanceUrl.Length > 2000)
            return BadRequest(new { message = "guidanceVideoUrl must be 2000 characters or fewer" });

        var ticket = await _db.Tickets.FirstOrDefaultAsync(t => t.Id == ticketId);
        if (ticket == null) return NotFound(new { message = "Ticket not found" });
        if (decision == TriageDecisions.Develop && ticket.FixStatus == FixStatuses.Claimed)
            return Conflict(new { message = "A fix is being drafted right now; release it first", fixStatus = ticket.FixStatus });

        var now = DateTime.UtcNow;
        var actorEmail = CallerEmail();
        var actorName = CallerName();
        var note = DevelopmentOrderService.Clean(body.Note);

        // A re-recorded "how it should work" video: keep the link and its
        // captions so the drafting run reads the intent, not only the bug.
        string? guidanceTitle = null;
        if (guidanceUrl != null && guidanceUrl != ticket.GuidanceVideoUrl)
        {
            ticket.GuidanceVideoUrl = guidanceUrl;
            var rec = await _videosManaged.TryGetRecordingAsync(guidanceUrl);
            ticket.GuidanceTranscript = rec?.TranscriptText;
            guidanceTitle = rec?.Title;
            if (!await _db.TicketDevelopmentLinks.AnyAsync(l => l.TicketId == ticket.Id && l.Kind == "VIDEO" && l.Url == guidanceUrl))
                _db.TicketDevelopmentLinks.Add(DevelopmentOrderService.NewLink(ticket, "VIDEO", null,
                    guidanceTitle != null ? $"How it should work: {Truncate(guidanceTitle, 200)}" : "How it should work (video)", guidanceUrl, null, actorEmail));
            _activity.Log(ticket, "GUIDANCE_VIDEO_ADDED",
                $"{actorName} attached a video of how it should work" + (guidanceTitle != null ? $": {guidanceTitle}" : "") + (rec?.TranscriptText != null ? " (transcript read)" : " (no transcript available)"),
                actorEmail, actorName, payload: new { guidanceUrl, title = guidanceTitle, transcriptChars = rec?.TranscriptText?.Length ?? 0 });
        }

        ticket.TriageDecision = decision;
        ticket.TriagedBy = Truncate(actorName, 255);
        ticket.TriagedAt = now;

        var statusKeys = await _orders.StatusKeysAsync();
        var label = TriageDecisions.Labels[decision];
        switch (decision)
        {
            case TriageDecisions.Develop:
                QueueForFix(ticket, note, now);
                _activity.Log(ticket, "TRIAGE_DEVELOP",
                    $"{actorName} watched the video and sent this to Claude to develop" + (note != null ? $" — {note}" : ""),
                    actorEmail, actorName, payload: new { decision, note, guidanceUrl });
                break;

            case TriageDecisions.Rerecord:
                _activity.Log(ticket, "TRIAGE_RERECORD",
                    $"{actorName} decided this needs a better video before anything is built" + (note != null ? $" — {note}" : ""),
                    actorEmail, actorName, payload: new { decision, note });
                break;

            case TriageDecisions.UserError:
                ticket.Resolution = note ?? "Works as designed — the reporter needs a walkthrough of this screen.";
                ticket.FixStatus = null;
                if (statusKeys.Contains("RESOLVED")) ticket.Status = "RESOLVED";
                ticket.ResolvedAt = now;
                _activity.Log(ticket, "TRIAGE_USER_ERROR",
                    $"{actorName} watched the video: user error, retrain — {ticket.Resolution}",
                    actorEmail, actorName, payload: new { decision, note });
                break;

            case TriageDecisions.Declined:
                ticket.Resolution = note ?? "Not planned.";
                ticket.FixStatus = null;
                ticket.Status = statusKeys.Contains("CLOSED") ? "CLOSED" : (statusKeys.Contains("RESOLVED") ? "RESOLVED" : ticket.Status);
                ticket.ResolvedAt = now;
                _activity.Log(ticket, "TRIAGE_DECLINED",
                    $"{actorName} watched the video and declined it — {ticket.Resolution}",
                    actorEmail, actorName, payload: new { decision, note });
                break;
        }

        await _db.SaveChangesAsync();

        // The reporter hears the outcome the same way they hear a resolution
        // today (Comms email with the resolution text); best effort.
        if (decision == TriageDecisions.UserError || decision == TriageDecisions.Declined)
            _ = _notify.NotifyReporterResolvedAsync(ticket);

        _audit.Record(action: "development.triage", outcome: "success", actorEmail: actorEmail, organizationId: ticket.OrganizationId,
            targetTicketId: ticket.Id, extra: new Dictionary<string, object?> { ["decision"] = decision, ["label"] = label, ["guidanceVideo"] = guidanceUrl != null });

        return Ok(await ToItemAsync(ticket, withBlobUrls: false));
    }

    private static void QueueForFix(Ticket ticket, string? note, DateTime now)
    {
        ticket.FixStatus = FixStatuses.Requested;
        ticket.FixRequestedAt = now;
        ticket.FixClaimedAt = null;
        ticket.FixClaimedBy = null;
        ticket.FixCompletedAt = null;
        if (note != null) ticket.FixFeedback = note;
    }

    [HttpPost("{ticketId}/claim")]
    public async Task<IActionResult> Claim(long ticketId, [FromBody] ClaimRequest? body)
    {
        if (!CanWrite()) return Forbidden("Your role or key cannot claim fixes");
        var ticket = await _db.Tickets.FirstOrDefaultAsync(t => t.Id == ticketId);
        if (ticket == null) return NotFound(new { message = "Ticket not found" });
        if (ticket.FixStatus != FixStatuses.Requested)
            return Conflict(new { message = $"Ticket is '{ticket.FixStatus ?? "not queued"}', expected {FixStatuses.Requested}", fixStatus = ticket.FixStatus });

        var now = DateTime.UtcNow;
        var worker = DevelopmentOrderService.Clean(body?.Worker) ?? CallerName();
        ticket.FixStatus = FixStatuses.Claimed;
        ticket.FixClaimedAt = now;
        ticket.FixClaimedBy = worker.Length > 255 ? worker[..255] : worker;
        _activity.Log(ticket, "FIX_CLAIMED", $"{worker} started drafting a fix", CallerEmail(), CallerName(), payload: new { worker });
        await _db.SaveChangesAsync();
        return Ok(await ToItemAsync(ticket, withBlobUrls: true));
    }

    [HttpPost("{ticketId}/release")]
    public async Task<IActionResult> Release(long ticketId)
    {
        if (!CanWrite()) return Forbidden("Your role or key cannot release fixes");
        var ticket = await _db.Tickets.FirstOrDefaultAsync(t => t.Id == ticketId);
        if (ticket == null) return NotFound(new { message = "Ticket not found" });
        if (ticket.FixStatus != FixStatuses.Claimed)
            return Conflict(new { message = $"Ticket is '{ticket.FixStatus ?? "not queued"}', expected {FixStatuses.Claimed}", fixStatus = ticket.FixStatus });

        var worker = ticket.FixClaimedBy;
        ticket.FixStatus = FixStatuses.Requested;
        ticket.FixClaimedAt = null;
        ticket.FixClaimedBy = null;
        _activity.Log(ticket, "FIX_RELEASED", $"{CallerName()} released the fix claimed by {worker ?? "a worker"}; it is queued again", CallerEmail(), CallerName());
        await _db.SaveChangesAsync();
        return Ok(await ToItemAsync(ticket, withBlobUrls: false));
    }

    // The dispatcher's report. READY_TO_TEST turns the ticket into a
    // development order at PR_OPEN (so it sits on the board next to everything
    // else and the Azure DevOps webhook moves it on merge / deploy) and posts
    // the analysis as an internal note. FAILED keeps the ticket as it was.
    [HttpPost("{ticketId}/result")]
    public async Task<IActionResult> Result(long ticketId, [FromBody] FixResultRequest body)
    {
        if (!CanWrite()) return Forbidden("Your role or key cannot report fix results");
        if (body == null || string.IsNullOrWhiteSpace(body.Outcome)) return BadRequest(new { message = "outcome is required" });
        var outcome = FixStatuses.Normalize(body.Outcome);
        if (outcome != FixStatuses.ReadyToTest && outcome != FixStatuses.Failed)
            return BadRequest(new { message = $"outcome must be {FixStatuses.ReadyToTest} or {FixStatuses.Failed}" });

        var ticket = await _db.Tickets.FirstOrDefaultAsync(t => t.Id == ticketId);
        if (ticket == null) return NotFound(new { message = "Ticket not found" });
        if (ticket.FixStatus != FixStatuses.Claimed && ticket.FixStatus != FixStatuses.Requested)
            return Conflict(new { message = $"Ticket is '{ticket.FixStatus ?? "not queued"}', expected {FixStatuses.Claimed}", fixStatus = ticket.FixStatus });

        var now = DateTime.UtcNow;
        var actorEmail = CallerEmail();
        var actorName = CallerName();
        var summary = DevelopmentOrderService.Clean(body.Summary);

        ticket.FixStatus = outcome;
        ticket.FixCompletedAt = now;
        ticket.FixSummary = summary;
        if (!string.IsNullOrWhiteSpace(body.TestingNotes)) ticket.TestingNotes = body.TestingNotes.Trim();

        if (outcome == FixStatuses.Failed)
        {
            _activity.Log(ticket, "FIX_FAILED", $"{actorName} could not draft a fix" + (summary != null ? $": {Truncate(summary, 300)}" : ""), actorEmail, actorName, payload: new { summary });
            await _db.SaveChangesAsync();
            return Ok(await ToItemAsync(ticket, withBlobUrls: false));
        }

        // READY_TO_TEST
        var links = body.Links ?? new List<DevelopmentController.LinkRequest>();
        foreach (var l in links)
        {
            if (l == null || string.IsNullOrWhiteSpace(l.Kind) || string.IsNullOrWhiteSpace(l.Name))
                return BadRequest(new { message = "each link needs kind and name" });
            if (!DevelopmentOrderService.LinkKinds.Contains(l.Kind.Trim().ToUpperInvariant()))
                return BadRequest(new { message = $"link kind must be one of {string.Join(", ", DevelopmentOrderService.LinkKinds)}" });
        }

        var statusKeys = await _orders.StatusKeysAsync();
        if (!ticket.IsDevelopmentOrder)
        {
            ticket.IsDevelopmentOrder = true;
            ticket.DevelopmentStage = DevelopmentStages.PrOpen;
            DevelopmentOrderService.ApplyStageSideEffects(ticket, null, DevelopmentStages.PrOpen, now, statusKeys);
            _orders.RecordStage(ticket, null, DevelopmentStages.PrOpen, actorEmail, now, "drafted fix ready to test");
            _activity.Log(ticket, "DEV_ORDER_CREATED", $"{actorName} put the drafted fix on the Development board (PR open)", actorEmail, actorName,
                payload: new { stage = DevelopmentStages.PrOpen, fromFix = true });
        }
        else if (DevelopmentStages.OrderOf(ticket.DevelopmentStage) < DevelopmentStages.OrderOf(DevelopmentStages.PrOpen))
        {
            _orders.MoveStage(ticket, DevelopmentStages.PrOpen, actorEmail, actorName, now, statusKeys, "drafted fix ready to test");
        }

        var existing = await _db.TicketDevelopmentLinks.Where(l => l.TicketId == ticket.Id).ToListAsync();
        foreach (var l in links)
        {
            var kind = l.Kind.Trim().ToUpperInvariant();
            if (existing.Any(e => e.Kind == kind && string.Equals(e.Name, l.Name.Trim(), StringComparison.OrdinalIgnoreCase)
                                  && string.Equals(e.Repo ?? "", (l.Repo ?? "").Trim(), StringComparison.OrdinalIgnoreCase)))
                continue;
            _db.TicketDevelopmentLinks.Add(DevelopmentOrderService.NewLink(ticket, kind, l.Repo, l.Name, l.Url, l.Note, actorEmail));
        }

        _activity.Log(ticket, "FIX_READY", $"{actorName} drafted a fix: ready to test" + (links.Count > 0 ? $" ({string.Join(", ", links.Select(l => l.Name))})" : ""),
            actorEmail, actorName, payload: new { links = links.Select(l => new { l.Kind, l.Repo, l.Name, l.Url }) });
        await _db.SaveChangesAsync();

        // Internal note so the chat / Google Chat / email readers see the analysis too.
        try
        {
            var noteBody = (summary ?? "A fix was drafted.")
                + (links.Count > 0 ? "\n\n" + string.Join("\n", links.Select(l => $"- {l.Kind} {(l.Repo != null ? l.Repo + " " : "")}{l.Name}{(l.Url != null ? ": " + l.Url : "")}")) : "")
                + $"\n\nReview on the Development board: {BoardUrl(ticket.Id)}";
            await _notes.AddNoteAsync(ticket.Id, actorEmail, actorName, noteBody, "INTERNAL", "DASHBOARD");
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "Fix result note could not be added for ticket {Id}", ticket.Id);
        }

        _audit.Record(action: "development.fix-ready", outcome: "success", actorEmail: actorEmail, organizationId: ticket.OrganizationId,
            targetTicketId: ticket.Id, extra: new Dictionary<string, object?> { ["links"] = links.Count, ["service"] = IsService() });

        return Ok(await ToItemAsync(ticket, withBlobUrls: false));
    }

    [HttpPost("{ticketId}/approve")]
    public async Task<IActionResult> Approve(long ticketId)
    {
        if (!IsHumanAdmin()) return Forbidden("Only a platform owner or super admin can approve a drafted fix");
        var ticket = await _db.Tickets.FirstOrDefaultAsync(t => t.Id == ticketId);
        if (ticket == null) return NotFound(new { message = "Ticket not found" });
        if (ticket.FixStatus != FixStatuses.ReadyToTest)
            return Conflict(new { message = $"Ticket is '{ticket.FixStatus ?? "not queued"}', expected {FixStatuses.ReadyToTest}", fixStatus = ticket.FixStatus });

        ticket.FixStatus = FixStatuses.Approved;
        _activity.Log(ticket, "FIX_APPROVED", $"{CallerName()} approved the drafted fix — the team can merge the PR", CallerEmail(), CallerName());
        await _db.SaveChangesAsync();
        _audit.Record(action: "development.fix-approved", outcome: "success", actorEmail: CallerEmail(), organizationId: ticket.OrganizationId, targetTicketId: ticket.Id);
        return Ok(await ToItemAsync(ticket, withBlobUrls: false));
    }

    [HttpPost("{ticketId}/reject")]
    public async Task<IActionResult> Reject(long ticketId, [FromBody] RejectRequest? body)
    {
        if (!IsHumanAdmin()) return Forbidden("Only a platform owner or super admin can reject a drafted fix");
        var ticket = await _db.Tickets.FirstOrDefaultAsync(t => t.Id == ticketId);
        if (ticket == null) return NotFound(new { message = "Ticket not found" });
        if (ticket.FixStatus != FixStatuses.ReadyToTest && ticket.FixStatus != FixStatuses.Approved)
            return Conflict(new { message = $"Ticket is '{ticket.FixStatus ?? "not queued"}', expected {FixStatuses.ReadyToTest}", fixStatus = ticket.FixStatus });

        var reason = DevelopmentOrderService.Clean(body?.Reason);
        var requeue = body?.Requeue ?? false;
        ticket.FixFeedback = reason;
        ticket.FixStatus = requeue ? FixStatuses.Requested : FixStatuses.Rejected;
        if (requeue)
        {
            ticket.FixRequestedAt = DateTime.UtcNow;
            ticket.FixClaimedAt = null;
            ticket.FixClaimedBy = null;
            ticket.FixCompletedAt = null;
        }
        _activity.Log(ticket, "FIX_REJECTED",
            $"{CallerName()} rejected the drafted fix" + (reason != null ? $" — {reason}" : "") + (requeue ? " (queued again with this feedback)" : ""),
            CallerEmail(), CallerName(), payload: new { reason, requeue });
        await _db.SaveChangesAsync();
        _audit.Record(action: "development.fix-rejected", outcome: "success", actorEmail: CallerEmail(), organizationId: ticket.OrganizationId,
            targetTicketId: ticket.Id, extra: new Dictionary<string, object?> { ["reason"] = reason, ["requeue"] = requeue });
        return Ok(await ToItemAsync(ticket, withBlobUrls: false));
    }

    // ===== internals =====

    private string BoardUrl(long id) => $"{_opts.BoardBaseUrl.TrimEnd('/')}/development/{id}";

    private async Task<FixQueueItemDto> ToItemAsync(Ticket t, bool withBlobUrls)
    {
        var project = await _db.Projects.FirstOrDefaultAsync(p => p.Id == t.ProjectId);
        var links = await _db.TicketDevelopmentLinks.Where(l => l.TicketId == t.Id).OrderBy(l => l.Id)
            .Select(l => new DevelopmentController.LinkDto(l.Id, l.Kind, l.Repo, l.Name, l.Url, l.Note, l.CreatedBy, l.CreatedAt))
            .ToListAsync();
        var attachments = await _db.TicketAttachments.Where(a => a.TicketId == t.Id).OrderBy(a => a.Id).ToListAsync();

        var videoUrl = t.VideoUrl;
        var attachmentDtos = new List<FixAttachmentDto>();
        if (withBlobUrls)
        {
            // Widget recordings and files live in private blob storage; the
            // worker gets short-lived SAS links. Videos Managed links pass through.
            if (!string.IsNullOrWhiteSpace(videoUrl) && videoUrl.Contains(".blob.core.windows.net", StringComparison.OrdinalIgnoreCase))
            {
                try { videoUrl = (await _videos.GenerateSasUriAsync(videoUrl, TimeSpan.FromHours(4))).ToString(); }
                catch (Exception ex) { _log.LogWarning(ex, "No SAS for video of ticket {Id}", t.Id); }
            }
            foreach (var a in attachments)
            {
                string? url = null;
                try { url = (await _screenshots.GenerateSasUriAsync(a.BlobUrl, TimeSpan.FromHours(4))).ToString(); }
                catch (Exception ex) { _log.LogWarning(ex, "No SAS for attachment {AttachmentId}", a.Id); }
                attachmentDtos.Add(new FixAttachmentDto(a.Id, a.FileName, a.ContentType, a.SizeBytes, url, a.NoteId != null));
            }
        }
        else
        {
            attachmentDtos.AddRange(attachments.Select(a => new FixAttachmentDto(a.Id, a.FileName, a.ContentType, a.SizeBytes, null, a.NoteId != null)));
        }

        return new FixQueueItemDto(
            t.Id, t.ProjectId, project?.Slug ?? string.Empty, project?.Name ?? $"Project {t.ProjectId}",
            t.TicketType, t.Title, t.Description, t.Priority, t.Status,
            t.SubmittedBy, t.CreatedAt,
            t.CurrentPageUrl, t.CurrentPageName, t.BrowserInfo, t.ScreenWidth, t.ScreenHeight,
            t.ConsoleErrors, t.NetworkErrors, t.Transcript, videoUrl,
            t.TenantId, t.TenantName, t.DatabaseName, t.ApplicationVersion, t.Environment,
            t.FixStatus, t.FixStatus != null && FixStatuses.Labels.TryGetValue(t.FixStatus, out var label) ? label : null,
            t.FixRequestedAt, t.FixClaimedAt, t.FixClaimedBy, t.FixCompletedAt, t.FixSummary, t.FixFeedback, t.TestingNotes,
            t.TriageDecision, t.TriageDecision != null && TriageDecisions.Labels.TryGetValue(t.TriageDecision, out var tl) ? tl : null,
            t.TriagedBy, t.TriagedAt, t.GuidanceVideoUrl, t.GuidanceTranscript,
            t.IsDevelopmentOrder, t.DevelopmentStage, BoardUrl(t.Id),
            links, attachmentDtos);
    }

    private static string Truncate(string s, int max) => s.Length <= max ? s : s[..max] + "…";
}
