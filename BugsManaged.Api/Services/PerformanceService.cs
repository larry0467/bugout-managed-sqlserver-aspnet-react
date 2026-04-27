using BugsManaged.Api.Data;
using BugsManaged.Api.Entities;
using Microsoft.EntityFrameworkCore;

namespace BugsManaged.Api.Services;

// Aggregates ticket lifecycle data into a single performance dashboard
// payload. Tenant-scoped via the EF global query filters on the supplied
// DbContext — callers must already have IOrgContext set.
//
// Score formula (constant, NOT tenant-configurable for v1):
//   score = round(100 * within_sla_count / total_count)
//
// Critical bookkeeping detail: a ticket may bounce between ASSIGNED_HUMAN
// and OWNER_APPROVAL_PENDING multiple times. To compute fair scores:
//   - Dev work time for SLA = duration of the LATEST ASSIGNED_HUMAN cycle
//     (the request-changes endpoint already resets AssignedAt, so the
//     value on the Ticket row IS the latest cycle start).
//   - Owner approval time for SLA = SUM of ALL OWNER_APPROVAL_PENDING
//     intervals from TicketStageHistory.
public class PerformanceService
{
    private readonly BugsManagedDbContext _db;

    public PerformanceService(BugsManagedDbContext db)
    {
        _db = db;
    }

    // SLAs in minutes. Hard-coded — see class comment.
    private const double DevSlaCritical = 240;    // 4h
    private const double DevSlaHigh = 1440;       // 24h
    private const double DevSlaMedium = 4320;     // 72h
    private const double DevSlaLow = 10080;       // 7d

    private const double OwnerSlaCritical = 60;   // 1h
    private const double OwnerSlaHigh = 240;      // 4h
    private const double OwnerSlaMedium = 720;    // 12h
    private const double OwnerSlaLow = 1440;      // 24h

    private static double DevSlaFor(string priority) => priority?.ToUpperInvariant() switch
    {
        "CRITICAL" => DevSlaCritical,
        "HIGH" => DevSlaHigh,
        "MEDIUM" => DevSlaMedium,
        "LOW" => DevSlaLow,
        _ => DevSlaMedium,
    };

    private static double OwnerSlaFor(string priority) => priority?.ToUpperInvariant() switch
    {
        "CRITICAL" => OwnerSlaCritical,
        "HIGH" => OwnerSlaHigh,
        "MEDIUM" => OwnerSlaMedium,
        "LOW" => OwnerSlaLow,
        _ => OwnerSlaMedium,
    };

    public async Task<object> BuildAsync(
        long? projectId,
        DateTime? from,
        DateTime? to,
        string? priority,
        CancellationToken ct = default)
    {
        var rangeTo = to ?? DateTime.UtcNow;
        var rangeFrom = from ?? rangeTo.AddDays(-30);

        // Tickets considered = created within the window. (We score against
        // the full lifecycle of each ticket regardless of which stages fall
        // outside the window — small simplification, fine at current scale.)
        var ticketsQuery = _db.Tickets.AsQueryable()
            .Where(t => t.CreatedAt >= rangeFrom && t.CreatedAt <= rangeTo);
        if (projectId.HasValue)
            ticketsQuery = ticketsQuery.Where(t => t.ProjectId == projectId.Value);
        if (!string.IsNullOrEmpty(priority))
            ticketsQuery = ticketsQuery.Where(t => t.Priority == priority);

        var tickets = await ticketsQuery.ToListAsync(ct);
        var ticketIds = tickets.Select(t => t.Id).ToList();

        var history = await _db.TicketStageHistory
            .Where(h => ticketIds.Contains(h.TicketId))
            .OrderBy(h => h.TicketId).ThenBy(h => h.ChangedAt)
            .ToListAsync(ct);

        var historyByTicket = history.GroupBy(h => h.TicketId).ToDictionary(g => g.Key, g => g.ToList());

        // Per-ticket interval extraction.
        // triageQueueMinutes  = first SUPER_ADMIN_REVIEW interval (CreatedAt → first transition out)
        // ownerEscalationMinutes = first PLATFORM_OWNER_REVIEW interval
        // devWorkMinutes (for dashboard average) = sum of all ASSIGNED_HUMAN/ASSIGNED_CLAUDE intervals
        // ownerApprovalMinutes = sum of all OWNER_APPROVAL_PENDING intervals
        // totalMinutes = CreatedAt → ResolvedAt (only for COMPLETED/RESOLVED tickets)

        var triage = new List<double>();
        var ownerEsc = new List<double>();
        var devWorkAll = new List<double>();
        var ownerApprovalAll = new List<double>();
        var totalAll = new List<double>();

        // Per-developer accumulators
        var devStats = new Dictionary<string, DevAccumulator>(StringComparer.OrdinalIgnoreCase);

        // Owner accumulators
        long ownerTotalApprovalCount = 0;
        long ownerWithinApprovalSla = 0;
        var ownerApprovalIntervals = new List<double>();

        long ownerEscalationCount = 0;
        long ownerWithinEscalationSla = 0;
        var ownerEscalationIntervals = new List<double>();

        // Per-category accumulators
        var categoryStats = new Dictionary<string, CategoryAccumulator>(StringComparer.OrdinalIgnoreCase);

        string? platformOwnerEmail = null;

        foreach (var ticket in tickets)
        {
            historyByTicket.TryGetValue(ticket.Id, out var rows);
            rows ??= new List<TicketStageHistory>();

            // Build (stage, enteredAt, exitedAt) intervals from history.
            // Intervals derived from contiguous rows: row N enters ToStage at
            // ChangedAt; row N+1 exits it at its ChangedAt. The most-recent
            // row's stage is "open" (no exit) unless the ticket reached a
            // terminal stage.
            var intervals = new List<(string Stage, DateTime Entered, DateTime? Exited)>();
            for (int i = 0; i < rows.Count; i++)
            {
                var entered = rows[i].ChangedAt;
                DateTime? exited = (i + 1 < rows.Count) ? rows[i + 1].ChangedAt : (DateTime?)null;
                intervals.Add((rows[i].ToStage, entered, exited));
            }

            // Triage: from CreatedAt to the time we left SUPER_ADMIN_REVIEW.
            // If the first transition row's FromStage == SUPER_ADMIN_REVIEW
            // we can use its ChangedAt; otherwise the ticket is still in
            // triage and we use rangeTo.
            var leftSuperAdmin = rows.FirstOrDefault(r => r.FromStage == "SUPER_ADMIN_REVIEW");
            if (leftSuperAdmin != null)
                triage.Add((leftSuperAdmin.ChangedAt - ticket.CreatedAt).TotalMinutes);

            // Per-stage intervals
            foreach (var iv in intervals)
            {
                var endedAt = iv.Exited ?? rangeTo;
                var minutes = (endedAt - iv.Entered).TotalMinutes;
                if (minutes < 0) minutes = 0;

                switch (iv.Stage)
                {
                    case "PLATFORM_OWNER_REVIEW":
                        // Score the owner's escalation-decision speed only
                        // when the interval is actually closed (i.e., the
                        // owner DID make a decision). Open intervals are
                        // included in the median display but not the SLA
                        // pass/fail count.
                        if (iv.Exited.HasValue)
                        {
                            ownerEscalationIntervals.Add(minutes);
                            ownerEsc.Add(minutes);
                            ownerEscalationCount++;
                            if (minutes <= OwnerSlaFor(ticket.Priority)) ownerWithinEscalationSla++;
                        }
                        else
                        {
                            ownerEsc.Add(minutes);
                        }
                        break;

                    case "OWNER_APPROVAL_PENDING":
                        if (iv.Exited.HasValue)
                        {
                            ownerApprovalIntervals.Add(minutes);
                            ownerApprovalAll.Add(minutes);
                            ownerTotalApprovalCount++;
                            if (minutes <= OwnerSlaFor(ticket.Priority)) ownerWithinApprovalSla++;
                        }
                        else
                        {
                            ownerApprovalAll.Add(minutes);
                        }
                        break;

                    case "ASSIGNED_HUMAN":
                    case "ASSIGNED_CLAUDE":
                        devWorkAll.Add(minutes);
                        break;
                }
            }

            // Total turnaround
            if (ticket.ResolvedAt.HasValue)
                totalAll.Add((ticket.ResolvedAt.Value - ticket.CreatedAt).TotalMinutes);

            // Identify the "platform owner" actor by sampling escalation
            // decisions. If multiple owners exist (rare for v1), use the most
            // common email.
            if (platformOwnerEmail == null)
            {
                var ownerRow = rows.FirstOrDefault(r =>
                    r.FromStage == "PLATFORM_OWNER_REVIEW" && !string.IsNullOrEmpty(r.ChangedBy))
                    ?? rows.FirstOrDefault(r =>
                        (r.ToStage == "COMPLETED" || r.FromStage == "OWNER_APPROVAL_PENDING")
                        && !string.IsNullOrEmpty(r.ChangedBy));
                if (ownerRow != null) platformOwnerEmail = ownerRow.ChangedBy;
            }

            // Per-developer rollup. Only score humans (Claude has its own
            // dedicated section). A ticket counts as "resolved by dev D" if
            // D is the AssignedTo on a ticket that reached COMPLETED.
            if (ticket.AssigneeType == "HUMAN" && !string.IsNullOrEmpty(ticket.AssignedTo))
            {
                if (!devStats.TryGetValue(ticket.AssignedTo, out var acc))
                {
                    acc = new DevAccumulator { Email = ticket.AssignedTo };
                    devStats[ticket.AssignedTo] = acc;
                }
                acc.Total++;
                if (ticket.RevisionCount > 0) acc.WithRevision++;

                if (ticket.EscalationStage == "COMPLETED" && ticket.AssignedAt.HasValue
                    && ticket.SubmittedForApprovalAt.HasValue)
                {
                    var devMinutes = (ticket.SubmittedForApprovalAt.Value - ticket.AssignedAt.Value).TotalMinutes;
                    if (devMinutes < 0) devMinutes = 0;
                    acc.DevWorkMinutes.Add(devMinutes);
                    acc.Resolved++;
                    if (devMinutes <= DevSlaFor(ticket.Priority)) acc.WithinSla++;
                }
            }

            // Per-category rollup (uses DeveloperCategory regardless of
            // assignee — covers tickets handled by humans).
            if (!string.IsNullOrEmpty(ticket.DeveloperCategory)
                && ticket.EscalationStage == "COMPLETED"
                && ticket.AssigneeType == "HUMAN"
                && ticket.AssignedAt.HasValue
                && ticket.SubmittedForApprovalAt.HasValue)
            {
                if (!categoryStats.TryGetValue(ticket.DeveloperCategory, out var cacc))
                {
                    cacc = new CategoryAccumulator { Category = ticket.DeveloperCategory };
                    categoryStats[ticket.DeveloperCategory] = cacc;
                }
                var devMinutes = (ticket.SubmittedForApprovalAt.Value - ticket.AssignedAt.Value).TotalMinutes;
                if (devMinutes < 0) devMinutes = 0;
                cacc.DevWorkMinutes.Add(devMinutes);
                cacc.Resolved++;
                if (devMinutes <= DevSlaFor(ticket.Priority)) cacc.WithinSla++;
            }
        }

        // Bottleneck = stage with the largest median-minute value among the
        // four scored stages.
        var stageMedians = new Dictionary<string, double>
        {
            ["triageQueue"] = Median(triage),
            ["ownerEscalation"] = Median(ownerEsc),
            ["devWork"] = Median(devWorkAll),
            ["ownerApproval"] = Median(ownerApprovalAll),
        };
        var bottleneck = stageMedians.OrderByDescending(kv => kv.Value).First().Key;

        // Owner score
        var escalationScore = ownerEscalationCount == 0 ? 100
            : (int)Math.Round(100.0 * ownerWithinEscalationSla / ownerEscalationCount);
        var approvalScore = ownerTotalApprovalCount == 0 ? 100
            : (int)Math.Round(100.0 * ownerWithinApprovalSla / ownerTotalApprovalCount);
        // Composite = simple average of the two sub-scores. If we ever add a
        // third pillar (e.g. triage assist), this becomes weighted.
        var compositeScore = (int)Math.Round((escalationScore + approvalScore) / 2.0);

        // Look up display names + specialties for developers from Users.
        var devEmails = devStats.Keys.ToList();
        var users = await _db.Users
            .Where(u => devEmails.Contains(u.Email))
            .ToListAsync(ct);
        var userByEmail = users.ToDictionary(u => u.Email, u => u, StringComparer.OrdinalIgnoreCase);

        var developers = devStats.Values
            .Select(d => new
            {
                email = d.Email,
                displayName = userByEmail.TryGetValue(d.Email, out var u) ? u.FullName : (string?)null,
                specialty = userByEmail.TryGetValue(d.Email, out var u2) ? u2.Specialty : null,
                ticketsResolved = d.Resolved,
                medianDevWorkMinutes = (int)Math.Round(Median(d.DevWorkMinutes)),
                p90DevWorkMinutes = (int)Math.Round(Percentile(d.DevWorkMinutes, 0.9)),
                score = d.Resolved == 0 ? 100 : (int)Math.Round(100.0 * d.WithinSla / d.Resolved),
                withinSlaCount = d.WithinSla,
                totalCount = d.Resolved,
                revisionRate = d.Total == 0 ? 0.0 : Math.Round((double)d.WithRevision / d.Total, 2),
            })
            .OrderByDescending(d => d.ticketsResolved)
            .ToList();

        var categorySummary = categoryStats.Values
            .Select(c => new
            {
                category = c.Category,
                ticketsResolved = c.Resolved,
                medianDevWorkMinutes = (int)Math.Round(Median(c.DevWorkMinutes)),
                score = c.Resolved == 0 ? 100 : (int)Math.Round(100.0 * c.WithinSla / c.Resolved),
            })
            .OrderByDescending(c => c.ticketsResolved)
            .ToList();

        // Claude block
        var claudeRuns = await _db.ClaudeRuns
            .Where(r => r.CreatedAt >= rangeFrom && r.CreatedAt <= rangeTo)
            .ToListAsync(ct);
        if (projectId.HasValue)
        {
            var inScope = ticketIds.ToHashSet();
            claudeRuns = claudeRuns.Where(r => inScope.Contains(r.TicketId)).ToList();
        }

        var claudeTickets = tickets.Where(t => t.AssigneeType == "CLAUDE").ToList();
        var claudeResolved = claudeTickets.Count(t => t.EscalationStage == "COMPLETED");
        var claudeRuntimes = claudeRuns
            .Where(r => r.DurationMs.HasValue)
            .Select(r => r.DurationMs!.Value / 1000.0)
            .ToList();
        var claudeTurnaround = claudeTickets
            .Where(t => t.EscalationStage == "COMPLETED" && t.AssignedAt.HasValue && t.SubmittedForApprovalAt.HasValue)
            .Select(t => (t.SubmittedForApprovalAt!.Value - t.AssignedAt!.Value).TotalMinutes)
            .ToList();
        var claudeCosts = claudeRuns.Where(r => r.CostUsd.HasValue).Select(r => (double)r.CostUsd!.Value).ToList();

        return new
        {
            window = new
            {
                from = rangeFrom,
                to = rangeTo,
                ticketsConsidered = tickets.Count,
            },
            stageAverages = new
            {
                triageQueueMedianMinutes = (int)Math.Round(Median(triage)),
                triageQueueP90Minutes = (int)Math.Round(Percentile(triage, 0.9)),
                ownerEscalationMedianMinutes = (int)Math.Round(Median(ownerEsc)),
                ownerEscalationP90Minutes = (int)Math.Round(Percentile(ownerEsc, 0.9)),
                devWorkMedianMinutes = (int)Math.Round(Median(devWorkAll)),
                devWorkP90Minutes = (int)Math.Round(Percentile(devWorkAll, 0.9)),
                ownerApprovalMedianMinutes = (int)Math.Round(Median(ownerApprovalAll)),
                ownerApprovalP90Minutes = (int)Math.Round(Percentile(ownerApprovalAll, 0.9)),
                totalMedianMinutes = (int)Math.Round(Median(totalAll)),
                totalP90Minutes = (int)Math.Round(Percentile(totalAll, 0.9)),
            },
            bottleneckStage = bottleneck,
            ownerScore = new
            {
                platformOwnerEmail = platformOwnerEmail ?? "owner@managedplatform.com",
                ticketsHandled = tickets.Count,
                escalationSpeed = new
                {
                    score = escalationScore,
                    withinSlaCount = ownerWithinEscalationSla,
                    totalCount = ownerEscalationCount,
                    medianMinutes = (int)Math.Round(Median(ownerEscalationIntervals)),
                },
                approvalSpeed = new
                {
                    score = approvalScore,
                    withinSlaCount = ownerWithinApprovalSla,
                    totalCount = ownerTotalApprovalCount,
                    medianMinutes = (int)Math.Round(Median(ownerApprovalIntervals)),
                },
                compositeScore,
            },
            developers,
            categorySummary,
            claude = new
            {
                ticketsResolved = claudeResolved,
                totalRuns = claudeRuns.Count,
                successfulRuns = claudeRuns.Count(r => r.Status == "SUCCEEDED"),
                cappedRuns = claudeRuns.Count(r => r.Status == "CAPPED"),
                failedRuns = claudeRuns.Count(r => r.Status == "FAILED"),
                medianAgentRuntimeSeconds = (int)Math.Round(Median(claudeRuntimes)),
                medianEffectiveTurnaroundMinutes = (int)Math.Round(Median(claudeTurnaround)),
                medianCostUsd = Math.Round(Median(claudeCosts), 2),
                totalCostUsd = Math.Round(claudeCosts.Sum(), 2),
            },
        };
    }

    private static double Median(List<double> xs)
    {
        if (xs.Count == 0) return 0;
        var sorted = xs.OrderBy(x => x).ToList();
        var mid = sorted.Count / 2;
        return sorted.Count % 2 == 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2.0;
    }

    private static double Percentile(List<double> xs, double p)
    {
        if (xs.Count == 0) return 0;
        var sorted = xs.OrderBy(x => x).ToList();
        var rank = p * (sorted.Count - 1);
        var lo = (int)Math.Floor(rank);
        var hi = (int)Math.Ceiling(rank);
        if (lo == hi) return sorted[lo];
        var frac = rank - lo;
        return sorted[lo] + frac * (sorted[hi] - sorted[lo]);
    }

    private class DevAccumulator
    {
        public string Email { get; set; } = "";
        public int Total { get; set; }       // Tickets ever assigned (for revisionRate)
        public int Resolved { get; set; }    // Reached COMPLETED (for score)
        public int WithinSla { get; set; }
        public int WithRevision { get; set; }
        public List<double> DevWorkMinutes { get; set; } = new();
    }

    private class CategoryAccumulator
    {
        public string Category { get; set; } = "";
        public int Resolved { get; set; }
        public int WithinSla { get; set; }
        public List<double> DevWorkMinutes { get; set; } = new();
    }
}
