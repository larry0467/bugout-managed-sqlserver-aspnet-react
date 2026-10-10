using System.Text;
using BugsManaged.Api.Data;
using BugsManaged.Api.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace BugsManaged.Api.Services;

// The "what shipped today" prompt. Once a day, after DigestHourLocal in the
// tracker's time zone, every organization with development orders that
// reached production and have not been announced in a digest yet gets one
// email listing them, with the line asking for the what-shipped video.
//
// Kept separate from the BackgroundService so the query, the one-per-day
// rule and the message can be unit-tested with an in-memory DbContext.
public class ProductionDigestService
{
    private readonly BugsManagedDbContext _db;
    private readonly ITicketNotificationService _notify;
    private readonly ITicketActivityLogger _activity;
    private readonly DevelopmentTrackerOptions _opts;
    private readonly ILogger<ProductionDigestService> _log;

    public const string SystemActorEmail = "system@bugout.managedplatform.com";
    public const string SystemActorName = "Bug Out";

    public ProductionDigestService(
        BugsManagedDbContext db,
        ITicketNotificationService notify,
        ITicketActivityLogger activity,
        IOptions<DevelopmentTrackerOptions> opts,
        ILogger<ProductionDigestService> log)
    {
        _db = db;
        _notify = notify;
        _activity = activity;
        _opts = opts.Value;
        _log = log;
    }

    // Returns the number of digests sent (one per organization at most).
    public async Task<int> RunDueDigestsAsync(DateTime utcNow, CancellationToken ct = default)
    {
        if (!_opts.DigestEnabled) return 0;

        var tz = _opts.ResolveTimeZone();
        var localNow = TimeZoneInfo.ConvertTimeFromUtc(utcNow, tz);
        if (localNow.Hour < _opts.DigestHourLocal) return 0;
        var today = localNow.Date;

        // Runs from a hosted service: no org context, so filters must be off.
        // Initiatives are left out: each of their phases is announced on its own.
        var pending = await _db.Tickets.IgnoreQueryFilters()
            .Where(t => t.IsDevelopmentOrder && t.ProductionAt != null && t.DigestSentAt == null)
            .Where(t => !_db.Tickets.Any(c => c.ParentOrderId == t.Id && c.IsDevelopmentOrder))
            .OrderBy(t => t.ProductionAt)
            .ToListAsync(ct);
        if (pending.Count == 0) return 0;

        var sent = 0;
        foreach (var group in pending.GroupBy(t => t.OrganizationId))
        {
            var orgId = group.Key;

            // One digest per organization per local day. Items that reach
            // production after today's digest wait for tomorrow's.
            var lastSentUtc = await _db.Tickets.IgnoreQueryFilters()
                .Where(t => t.OrganizationId == orgId && t.DigestSentAt != null)
                .MaxAsync(t => t.DigestSentAt, ct);
            if (lastSentUtc != null && TimeZoneInfo.ConvertTimeFromUtc(lastSentUtc.Value, tz).Date == today)
                continue;

            var recipients = await ResolveRecipientsAsync(orgId, ct);
            if (recipients.Count == 0)
            {
                _log.LogWarning("ProductionDigest: org {OrgId} has {Count} shipped item(s) but no recipients (set DevelopmentTracker:DigestRecipients or add a PLATFORM_OWNER)", orgId, group.Count());
                continue;
            }

            var items = group.ToList();
            var projectIds = items.Select(i => i.ProjectId).Distinct().ToList();
            var projectNames = await _db.Projects.IgnoreQueryFilters()
                .Where(p => projectIds.Contains(p.Id))
                .ToDictionaryAsync(p => p.Id, p => p.Name, ct);
            var ids = items.Select(i => i.Id).ToList();
            var links = await _db.TicketDevelopmentLinks.IgnoreQueryFilters()
                .Where(l => ids.Contains(l.TicketId))
                .OrderBy(l => l.CreatedAt)
                .ToListAsync(ct);

            var (subject, body) = Compose(items, projectNames, links, today, tz);

            var delivered = 0;
            foreach (var to in recipients)
            {
                if (await _notify.SendDigestAsync(to, subject, body, ct)) delivered++;
            }

            if (delivered == 0)
            {
                _log.LogError("ProductionDigest: could not deliver the digest for org {OrgId} to any of {Recipients}; will retry", orgId, string.Join(", ", recipients));
                continue;
            }

            foreach (var t in items)
            {
                t.DigestSentAt = utcNow;
                _activity.Log(t, "DEV_DIGEST_SENT",
                    $"What-shipped digest sent to {string.Join(", ", recipients)}",
                    SystemActorEmail, SystemActorName,
                    payload: new { recipients, itemCount = items.Count });
            }
            await _db.SaveChangesAsync(ct);

            _log.LogInformation("ProductionDigest: sent {Count} item(s) for org {OrgId} to {Recipients}", items.Count, orgId, string.Join(", ", recipients));
            sent++;
        }

        return sent;
    }

    public async Task<List<string>> ResolveRecipientsAsync(long orgId, CancellationToken ct)
    {
        var configured = (_opts.DigestRecipients ?? string.Empty)
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
        if (configured.Count > 0) return configured;

        return await _db.Users.IgnoreQueryFilters()
            .Where(u => u.OrganizationId == orgId && u.Role == "PLATFORM_OWNER")
            .OrderBy(u => u.Id)
            .Select(u => u.Email)
            .ToListAsync(ct);
    }

    public (string Subject, string Body) Compose(
        List<Ticket> items, IDictionary<long, string> projectNames, List<TicketDevelopmentLink> links,
        DateTime localDay, TimeZoneInfo tz)
    {
        var subject = $"What shipped {localDay:ddd MMM d}: {items.Count} item{(items.Count == 1 ? "" : "s")} reached production";

        var sb = new StringBuilder();
        sb.Append(items.Count).Append(items.Count == 1 ? " development item" : " development items")
          .Append(" reached production").Append(items.Count == 1 ? "." : ".").AppendLine();
        sb.AppendLine();

        var n = 0;
        foreach (var t in items)
        {
            n++;
            var app = projectNames.TryGetValue(t.ProjectId, out var name) ? name : $"Project {t.ProjectId}";
            sb.Append(n).Append(". [").Append(app).Append("] ").AppendLine(t.Title);
            sb.Append("   Board: ").AppendLine($"{_opts.BoardBaseUrl.TrimEnd('/')}/development/{t.Id}");
            if (!string.IsNullOrWhiteSpace(t.VideoUrl))
                sb.Append("   Ordered by video: ").AppendLine(t.VideoUrl);

            var prs = links.Where(l => l.TicketId == t.Id && l.Kind == "PR").ToList();
            if (prs.Count > 0)
                sb.Append("   PRs: ").AppendLine(string.Join("; ", prs.Select(p => $"{(p.Repo != null ? p.Repo + " " : "")}{p.Name}{(p.Url != null ? " " + p.Url : "")}")));

            if (t.ProductionAt != null)
                sb.Append("   Production: ").AppendLine(TimeZoneInfo.ConvertTimeFromUtc(t.ProductionAt.Value, tz).ToString("yyyy-MM-dd h:mm tt"));
            sb.AppendLine();
        }

        sb.AppendLine("Record the what-shipped video and paste its link on these items: open each board link and fill in");
        sb.AppendLine("Announcement video, or PATCH /api/development/orders/{id} with announcementVideoUrl.");
        sb.AppendLine("They stay flagged \"needs announcement video\" on the Development board until then.");

        return (subject, sb.ToString());
    }
}

// Thin timer around ProductionDigestService. Same shape as ClaudeRunWorker:
// a scope per poll, errors logged and swallowed so one bad poll never stops
// the loop.
public class ProductionDigestWorker : BackgroundService
{
    private readonly IServiceScopeFactory _scopes;
    private readonly DevelopmentTrackerOptions _opts;
    private readonly ILogger<ProductionDigestWorker> _log;

    public ProductionDigestWorker(IServiceScopeFactory scopes, IOptions<DevelopmentTrackerOptions> opts, ILogger<ProductionDigestWorker> log)
    {
        _scopes = scopes;
        _opts = opts.Value;
        _log = log;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!_opts.DigestEnabled)
        {
            _log.LogInformation("ProductionDigestWorker disabled (DevelopmentTracker:DigestEnabled=false)");
            return;
        }

        var interval = TimeSpan.FromMinutes(Math.Max(1, _opts.DigestPollMinutes));
        _log.LogInformation("ProductionDigestWorker starting; digest after {Hour}:00 {Tz}, poll every {Minutes} min",
            _opts.DigestHourLocal, _opts.ResolveTimeZone().Id, interval.TotalMinutes);

        // Let startup (migrations, seeding) finish before the first scan.
        try { await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken); }
        catch (OperationCanceledException) { return; }

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = _scopes.CreateScope();
                var svc = scope.ServiceProvider.GetRequiredService<ProductionDigestService>();
                var sent = await svc.RunDueDigestsAsync(DateTime.UtcNow, stoppingToken);
                if (sent > 0) _log.LogInformation("ProductionDigestWorker sent {Count} digest(s)", sent);
            }
            catch (OperationCanceledException) { break; }
            catch (Exception ex)
            {
                _log.LogError(ex, "ProductionDigestWorker poll failed");
            }

            try { await Task.Delay(interval, stoppingToken); }
            catch (OperationCanceledException) { break; }
        }
    }
}
