using BugsManaged.Api.Data;
using BugsManaged.Api.Entities;
using Microsoft.EntityFrameworkCore;

namespace BugsManaged.Api.Services;

// Polls ClaudeRuns for PENDING rows every 5 seconds. Per-tenant serial
// execution: at most one RUNNING row per OrganizationId at a time. Per-tenant
// daily $100 cap is enforced before each run; per-run $20 cap is enforced
// inside the sidecar (we just pass it as hardCostCapUsd).
public class ClaudeRunWorker : BackgroundService
{
    private readonly IServiceScopeFactory _scopes;
    private readonly ILogger<ClaudeRunWorker> _log;
    private readonly TimeSpan _pollInterval = TimeSpan.FromSeconds(5);

    private const decimal DailyTenantCapUsd = 100.00m;
    private const decimal PerRunHardCapUsd = 20.00m;

    public ClaudeRunWorker(IServiceScopeFactory scopes, ILogger<ClaudeRunWorker> log)
    {
        _scopes = scopes;
        _log = log;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _log.LogInformation("ClaudeRunWorker starting; poll interval = {Interval}s", _pollInterval.TotalSeconds);
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await PollOnceAsync(stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch (Exception ex)
            {
                _log.LogError(ex, "ClaudeRunWorker poll failed");
            }

            try
            {
                await Task.Delay(_pollInterval, stoppingToken);
            }
            catch (OperationCanceledException) { break; }
        }
    }

    private async Task PollOnceAsync(CancellationToken ct)
    {
        // One row per call. We rely on the worker waking again every 5s for
        // the next one. This keeps "no parallel runs for same OrganizationId"
        // trivially true, at the cost of some throughput when many tenants
        // queue at once. Acceptable for current scale.
        using var scope = _scopes.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<BugsManagedDbContext>();
        var orgContext = scope.ServiceProvider.GetRequiredService<IOrgContext>();
        var sidecar = scope.ServiceProvider.GetRequiredService<IClaudeAgentClient>();
        var noteService = scope.ServiceProvider.GetRequiredService<TicketNoteService>();

        // Find the next PENDING run whose tenant currently has no RUNNING row.
        var runningOrgIds = await db.ClaudeRuns.IgnoreQueryFilters()
            .Where(r => r.Status == "RUNNING")
            .Select(r => r.OrganizationId)
            .Distinct()
            .ToListAsync(ct);

        var nextRun = await db.ClaudeRuns.IgnoreQueryFilters()
            .Where(r => r.Status == "PENDING" && !runningOrgIds.Contains(r.OrganizationId))
            .OrderBy(r => r.CreatedAt)
            .FirstOrDefaultAsync(ct);

        if (nextRun == null) return;

        // Set org context so EF query filters resolve normally for the rest
        // of this scope (TicketNoteService relies on the filter being
        // honored for ticket lookup).
        orgContext.SetOrganization(nextRun.OrganizationId);

        // Daily $100 cap: sum costs in the last 24 hours for this tenant.
        var since = DateTime.UtcNow.AddHours(-24);
        var spentToday = await db.ClaudeRuns.IgnoreQueryFilters()
            .Where(r => r.OrganizationId == nextRun.OrganizationId
                && r.CostUsd != null
                && r.CreatedAt >= since)
            .SumAsync(r => r.CostUsd ?? 0m, ct);

        if (spentToday >= DailyTenantCapUsd)
        {
            nextRun.Status = "CAPPED";
            nextRun.ErrorMessage = $"Tenant daily ${DailyTenantCapUsd:F2} cap reached (spent ${spentToday:F2} in last 24h)";
            await db.SaveChangesAsync(ct);
            _log.LogWarning("Run {RunId} CAPPED (org {OrgId} spent ${Spent})", nextRun.Id, nextRun.OrganizationId, spentToday);
            return;
        }

        // Mark RUNNING.
        nextRun.Status = "RUNNING";
        await db.SaveChangesAsync(ct);

        var ticket = await db.Tickets.IgnoreQueryFilters().FirstOrDefaultAsync(t => t.Id == nextRun.TicketId, ct);
        if (ticket == null)
        {
            nextRun.Status = "FAILED";
            nextRun.ErrorMessage = "Ticket not found";
            await db.SaveChangesAsync(ct);
            return;
        }

        var project = await db.Projects.IgnoreQueryFilters().FirstOrDefaultAsync(p => p.Id == ticket.ProjectId, ct);
        if (project == null || string.IsNullOrEmpty(project.RepoPath))
        {
            nextRun.Status = "FAILED";
            nextRun.ErrorMessage = "Project missing or has no RepoPath";
            await db.SaveChangesAsync(ct);
            return;
        }

        var request = new ClaudeRunRequestDto
        {
            RunId = nextRun.Id,
            Model = nextRun.Model,
            HardCostCapUsd = PerRunHardCapUsd,
            Ticket = new ClaudeRunTicketDto
            {
                Id = ticket.Id,
                Title = ticket.Title,
                Description = ticket.Description,
                Transcript = ticket.Transcript,
                ConsoleErrors = ticket.ConsoleErrors,
                CurrentPageUrl = ticket.CurrentPageUrl,
                TicketType = ticket.TicketType,
            },
            Repo = new ClaudeRunRepoDto
            {
                Path = project.RepoPath ?? "",
                Subpath = project.RepoSubpath ?? "",
                DevBranch = string.IsNullOrEmpty(project.DevBranch) ? "dev" : project.DevBranch,
                GithubOwner = project.GithubOwner,
                GithubRepo = project.GithubRepo,
            },
        };

        ClaudeRunResultDto result;
        try
        {
            result = await sidecar.RunAsync(request, ct);
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "Sidecar call threw for run {RunId}", nextRun.Id);
            nextRun.Status = "FAILED";
            nextRun.ErrorMessage = "Sidecar exception: " + ex.Message;
            await db.SaveChangesAsync(ct);
            return;
        }

        nextRun.Status = result.Status switch
        {
            "SUCCEEDED" => "SUCCEEDED",
            "CAPPED" => "CAPPED",
            _ => "FAILED",
        };
        nextRun.AnalysisMarkdown = result.AnalysisMarkdown;
        nextRun.PrUrl = result.PrUrl;
        nextRun.BranchName = result.BranchName;
        nextRun.TokensIn = result.TokensIn;
        nextRun.TokensOut = result.TokensOut;
        nextRun.CostUsd = result.CostUsd;
        nextRun.DurationMs = result.DurationMs;
        nextRun.ErrorMessage = result.ErrorMessage;

        // Auto-flip Claude tickets into the owner-approval loop. Only when:
        //   - run SUCCEEDED, AND
        //   - sidecar opened a PR (PrUrl != null).
        // Analysis-only successes and FAILED/CAPPED runs leave the ticket in
        // ASSIGNED_CLAUDE so the platform owner can manually decide what to
        // do next (re-assign to a human, accept the analysis as-is, etc.).
        if (nextRun.Status == "SUCCEEDED" && !string.IsNullOrWhiteSpace(result.PrUrl)
            && ticket.EscalationStage == "ASSIGNED_CLAUDE")
        {
            var flipAt = DateTime.UtcNow;
            var fromStage = ticket.EscalationStage;
            ticket.EscalationStage = "OWNER_APPROVAL_PENDING";
            ticket.SubmittedForApprovalAt = flipAt;
            ticket.SubmittedForApprovalBy = "claude@managedplatform.com";
            ticket.Status = "IN_REVIEW";
            db.TicketStageHistory.Add(new TicketStageHistory
            {
                TicketId = ticket.Id,
                OrganizationId = ticket.OrganizationId,
                FromStage = fromStage,
                ToStage = ticket.EscalationStage,
                ChangedBy = "claude@managedplatform.com",
                ChangedAt = flipAt,
            });
        }

        await db.SaveChangesAsync(ct);

        _log.LogInformation("Run {RunId} completed with status {Status} (cost ${Cost})", nextRun.Id, nextRun.Status, result.CostUsd);

        // On success, drop a TicketNote attributed to the synthetic Claude
        // user so the ticket timeline shows what was done (and links to the
        // PR if one was opened).
        if (nextRun.Status == "SUCCEEDED" && !string.IsNullOrWhiteSpace(result.AnalysisMarkdown))
        {
            try
            {
                var body = result.AnalysisMarkdown!;
                if (!string.IsNullOrEmpty(result.PrUrl))
                    body += $"\n\n**PR:** {result.PrUrl}";

                await noteService.AddNoteAsync(
                    ticketId: ticket.Id,
                    authorEmail: "claude@managedplatform.com",
                    authorName: "Claude (AI Developer)",
                    content: body,
                    noteType: "INTERNAL",
                    source: "DASHBOARD");
            }
            catch (Exception ex)
            {
                _log.LogWarning(ex, "Failed to add Claude note for run {RunId}", nextRun.Id);
            }
        }
    }
}
