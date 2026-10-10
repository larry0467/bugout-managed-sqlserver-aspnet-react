using System.Text.Json;
using System.Text.RegularExpressions;
using BugsManaged.Api.Data;
using BugsManaged.Api.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace BugsManaged.Api.Services;

public record WebhookOutcome(bool Handled, string Action, long? OrderId, string? Detail);

// Turns Azure DevOps service-hook events into development-order changes so
// the board follows the team's work without anyone touching it:
//
//   git.pullrequest.created           -> order found or created, PR + branch links, stage PR_OPEN
//   git.pullrequest.updated           -> completed into dev => MERGED_DEV (BranchStages); abandoned => note
//   ms.vss-release.deployment-completed-event
//   ms.vss-pipelines.stage-state-changed-event
//                                     -> succeeded beta/prod deploy => every order of that app waiting
//                                        at the previous stage moves to BETA / PRODUCTION
//
// Matching a PR to an order, in this order: a PR link (repo + "PR {id}" or
// the PR url), a BRANCH link (repo + source branch), a board url
// (/development/{id}) in the PR description, otherwise a new order in the
// application the repository maps to. Everything is idempotent: Azure DevOps
// retries deliveries, and a session may already have logged the same PR.
public class AzureDevOpsWebhookService
{
    private readonly BugsManagedDbContext _db;
    private readonly DevelopmentOrderService _orders;
    private readonly ITicketActivityLogger _activity;
    private readonly IOrgContext _org;
    private readonly DevelopmentTrackerOptions _opts;
    private readonly ILogger<AzureDevOpsWebhookService> _log;

    public AzureDevOpsWebhookService(
        BugsManagedDbContext db,
        DevelopmentOrderService orders,
        ITicketActivityLogger activity,
        IOrgContext org,
        IOptions<DevelopmentTrackerOptions> opts,
        ILogger<AzureDevOpsWebhookService> log)
    {
        _db = db;
        _orders = orders;
        _activity = activity;
        _org = org;
        _opts = opts.Value;
        _log = log;
    }

    public async Task<WebhookOutcome> HandleAsync(JsonElement payload, string actorEmail, string actorName, CancellationToken ct = default)
    {
        if (_org.CurrentOrganizationId == null)
            return new WebhookOutcome(false, "ignored", null, "no organization context");

        var eventType = GetString(payload, "eventType") ?? "";
        var resource = payload.TryGetProperty("resource", out var r) && r.ValueKind == JsonValueKind.Object ? r : default;
        if (resource.ValueKind != JsonValueKind.Object)
            return new WebhookOutcome(false, "ignored", null, $"event '{eventType}' has no resource");

        switch (eventType)
        {
            case "git.pullrequest.created":
            case "git.pullrequest.updated":
            case "git.pullrequest.merged":
                return await HandlePullRequestAsync(eventType, resource, actorEmail, actorName, ct);
            case "ms.vss-release.deployment-completed-event":
                return await HandleReleaseDeploymentAsync(resource, actorEmail, actorName, ct);
            case "ms.vss-pipelines.stage-state-changed-event":
                return await HandlePipelineStageAsync(resource, actorEmail, actorName, ct);
            default:
                _log.LogInformation("AzureDevOps webhook: event '{EventType}' not handled", eventType);
                return new WebhookOutcome(false, "ignored", null, $"event '{eventType}' not handled");
        }
    }

    // ===== pull requests =====

    private sealed record PullRequestInfo(
        int Id, string Repo, string? RepoWebUrl, string Title, string? Description, string Status,
        string SourceBranch, string TargetBranch, string? AuthorName, string? AuthorEmail, string? ClosedByName);

    private static PullRequestInfo? ParsePullRequest(JsonElement resource)
    {
        if (!resource.TryGetProperty("pullRequestId", out var idEl) || !idEl.TryGetInt32(out var id)) return null;
        var repo = resource.TryGetProperty("repository", out var repoEl) ? repoEl : default;
        var repoName = repo.ValueKind == JsonValueKind.Object ? GetString(repo, "name") : null;
        if (string.IsNullOrWhiteSpace(repoName)) return null;

        var createdBy = resource.TryGetProperty("createdBy", out var cb) && cb.ValueKind == JsonValueKind.Object ? cb : default;
        var closedBy = resource.TryGetProperty("closedBy", out var clb) && clb.ValueKind == JsonValueKind.Object ? clb : default;

        return new PullRequestInfo(
            id,
            repoName,
            repo.ValueKind == JsonValueKind.Object ? GetString(repo, "webUrl") : null,
            GetString(resource, "title") ?? $"PR {id}",
            GetString(resource, "description"),
            (GetString(resource, "status") ?? "active").ToLowerInvariant(),
            BranchName(GetString(resource, "sourceRefName")),
            BranchName(GetString(resource, "targetRefName")),
            createdBy.ValueKind == JsonValueKind.Object ? GetString(createdBy, "displayName") : null,
            createdBy.ValueKind == JsonValueKind.Object ? GetString(createdBy, "uniqueName") : null,
            closedBy.ValueKind == JsonValueKind.Object ? GetString(closedBy, "displayName") : null);
    }

    private async Task<WebhookOutcome> HandlePullRequestAsync(string eventType, JsonElement resource, string actorEmail, string actorName, CancellationToken ct)
    {
        var pr = ParsePullRequest(resource);
        if (pr == null) return new WebhookOutcome(false, "ignored", null, "pull request payload missing pullRequestId or repository.name");

        var prUrl = PullRequestUrl(pr);
        var now = DateTime.UtcNow;
        var who = pr.AuthorName ?? pr.AuthorEmail ?? "someone";

        var ticket = await FindOrderForPullRequestAsync(pr, ct);
        var created = false;
        var promoted = false;

        // The PR names a ticket that is not on the board yet: a drafted fix or a
        // developer's own session opened the PR before reporting back (the
        // dispatcher reports only after every PR exists). Put THAT ticket on the
        // board instead of creating a second order for the same work.
        if (ticket == null && pr.Status != "abandoned")
        {
            var referenced = await FindReferencedTicketAsync(pr, ct);
            if (referenced != null)
            {
                var keysForPromotion = await _orders.StatusKeysAsync();
                referenced.IsDevelopmentOrder = true;
                referenced.DevelopmentStage = DevelopmentStages.PrOpen;
                DevelopmentOrderService.ApplyStageSideEffects(referenced, null, DevelopmentStages.PrOpen, now, keysForPromotion);
                _orders.RecordStage(referenced, null, DevelopmentStages.PrOpen, actorEmail, now, $"{pr.Repo} PR {pr.Id} opened by {who}");
                _activity.Log(referenced, "DEV_ORDER_CREATED",
                    $"{actorName} put ticket #{referenced.Id} on the Development board from {pr.Repo} PR {pr.Id} opened by {who}",
                    actorEmail, actorName, payload: new { source = "azure-devops", pr.Repo, pullRequestId = pr.Id, author = who, promoted = true });
                ticket = referenced;
                promoted = true;
            }
        }

        if (ticket == null)
        {
            // Abandoned or merge-attempt events for unknown PRs are not worth an order.
            if (eventType != "git.pullrequest.created" && pr.Status != "completed" && pr.Status != "active")
                return new WebhookOutcome(false, "ignored", null, $"no order for {pr.Repo} PR {pr.Id} and status is {pr.Status}");

            var project = await ResolveProjectForRepoAsync(pr.Repo, ct);
            if (project == null)
            {
                _log.LogWarning("AzureDevOps webhook: repository '{Repo}' is not mapped to an application (DevelopmentTracker:RepoProjects) and no order links it; PR {Id} ignored", pr.Repo, pr.Id);
                return new WebhookOutcome(false, "unmapped-repo", null, $"repository '{pr.Repo}' is not mapped to an application");
            }

            var statusKeys = await _orders.StatusKeysAsync();
            ticket = new Ticket
            {
                OrganizationId = project.OrganizationId,
                ProjectId = project.Id,
                TicketType = "FEATURE_REQUEST",
                Title = Truncate(pr.Title, 500),
                Description = Truncate(pr.Description, 10000),
                Priority = "MEDIUM",
                Status = DevelopmentOrderService.OpenStatus(statusKeys),
                Visibility = "PLATFORM",
                EscalationStage = "NONE",
                SubmittedBy = Truncate(who, 255),
                IsDevelopmentOrder = true,
                DevelopmentStage = DevelopmentStages.PrOpen,
                CreatedAt = now,
                UpdatedAt = now,
            };
            DevelopmentOrderService.ApplyStageSideEffects(ticket, null, DevelopmentStages.PrOpen, now, statusKeys);
            _db.Tickets.Add(ticket);
            await _db.SaveChangesAsync(ct);

            _orders.RecordStage(ticket, null, DevelopmentStages.PrOpen, actorEmail, now, $"created from {pr.Repo} PR {pr.Id} by {who}");
            _activity.Log(ticket, "DEV_ORDER_CREATED",
                $"{actorName} logged development from {pr.Repo} PR {pr.Id} opened by {who}: {pr.Title}",
                actorEmail, actorName, payload: new { source = "azure-devops", pr.Repo, pullRequestId = pr.Id, author = who });
            created = true;
        }

        // Links are idempotent: a session may already have added them.
        var links = await _db.TicketDevelopmentLinks.Where(l => l.TicketId == ticket.Id).ToListAsync(ct);
        var addedLinks = new List<string>();
        if (!links.Any(l => IsPullRequestLink(l, pr)))
        {
            _db.TicketDevelopmentLinks.Add(DevelopmentOrderService.NewLink(ticket, "PR", pr.Repo, $"PR {pr.Id}", prUrl,
                pr.TargetBranch.Length > 0 ? $"into {pr.TargetBranch}" : null, actorEmail));
            addedLinks.Add($"PR {pr.Id}");
        }
        if (pr.SourceBranch.Length > 0 && !links.Any(l => l.Kind == "BRANCH" && SameRepo(l.Repo, pr.Repo) && string.Equals(l.Name, pr.SourceBranch, StringComparison.OrdinalIgnoreCase)))
        {
            _db.TicketDevelopmentLinks.Add(DevelopmentOrderService.NewLink(ticket, "BRANCH", pr.Repo, pr.SourceBranch,
                pr.RepoWebUrl != null ? $"{pr.RepoWebUrl}?version=GB{Uri.EscapeDataString(pr.SourceBranch)}" : null, null, actorEmail));
            addedLinks.Add(pr.SourceBranch);
        }
        if (addedLinks.Count > 0 && !created)
        {
            _activity.Log(ticket, "DEV_LINK_ADDED",
                $"{actorName} linked {string.Join(" and ", addedLinks)} from {pr.Repo}",
                actorEmail, actorName, payload: new { source = "azure-devops", pr.Repo, pullRequestId = pr.Id, links = addedLinks });
        }

        var action = created ? "order-created" : promoted ? "ticket-promoted" : "order-matched";
        var keys = await _orders.StatusKeysAsync();

        switch (pr.Status)
        {
            case "active":
                if (!created && DevelopmentStages.OrderOf(ticket.DevelopmentStage) < DevelopmentStages.OrderOf(DevelopmentStages.PrOpen))
                {
                    _orders.MoveStage(ticket, DevelopmentStages.PrOpen, actorEmail, actorName, now, keys, $"{pr.Repo} PR {pr.Id} opened by {who}");
                    action = "stage-pr-open";
                }
                break;

            case "completed":
            {
                var target = FindStage(_opts.BranchStages, pr.TargetBranch, exact: true);
                if (target == null)
                {
                    _activity.Log(ticket, "DEV_PR_COMPLETED",
                        $"{pr.Repo} PR {pr.Id} completed into {pr.TargetBranch} (no stage mapped for that branch)",
                        actorEmail, actorName, payload: new { source = "azure-devops", pr.Repo, pullRequestId = pr.Id, pr.TargetBranch });
                    action = "pr-completed-unmapped-branch";
                }
                else if (DevelopmentStages.OrderOf(ticket.DevelopmentStage) < DevelopmentStages.OrderOf(target))
                {
                    _orders.MoveStage(ticket, target, actorEmail, actorName, now, keys,
                        $"{pr.Repo} PR {pr.Id} completed into {pr.TargetBranch}" + (pr.ClosedByName != null ? $" by {pr.ClosedByName}" : ""));
                    action = $"stage-{target.ToLowerInvariant()}";
                }
                else action = "pr-completed-already-past";
                break;
            }

            case "abandoned":
            {
                // Redeliveries must not stack identical notes.
                var marker = $"PR {pr.Id} was abandoned";
                if (!await _db.TicketActivities.AnyAsync(a => a.TicketId == ticket.Id && a.Kind == "DEV_PR_ABANDONED" && a.Message.Contains(marker), ct))
                {
                    _activity.Log(ticket, "DEV_PR_ABANDONED",
                        $"{pr.Repo} {marker}" + (pr.ClosedByName != null ? $" by {pr.ClosedByName}" : ""),
                        actorEmail, actorName, payload: new { source = "azure-devops", pr.Repo, pullRequestId = pr.Id });
                }
                action = "pr-abandoned";
                break;
            }
        }

        await _db.SaveChangesAsync(ct);
        if (ticket.ParentOrderId != null
            && (await _orders.RollUpInitiativesAsync(new[] { ticket.ParentOrderId }, actorEmail, actorName, now, ct)).Count > 0)
            await _db.SaveChangesAsync(ct);
        return new WebhookOutcome(true, action, ticket.Id, $"{pr.Repo} PR {pr.Id} ({pr.Status}) -> order #{ticket.Id} at {ticket.DevelopmentStage}");
    }

    private async Task<Ticket?> FindOrderForPullRequestAsync(PullRequestInfo pr, CancellationToken ct)
    {
        // 1. a PR link
        var prName = $"PR {pr.Id}";
        var urlTail = $"/pullrequest/{pr.Id}";
        var byPr = await _db.TicketDevelopmentLinks
            .Where(l => l.Kind == "PR" && (l.Name == prName || (l.Url != null && l.Url.EndsWith(urlTail))))
            .OrderByDescending(l => l.Id)
            .ToListAsync(ct);
        var prLink = byPr.FirstOrDefault(l => SameRepo(l.Repo, pr.Repo)) ?? byPr.FirstOrDefault(l => l.Repo == null && l.Url != null && l.Url.Contains($"/{pr.Repo}/", StringComparison.OrdinalIgnoreCase));
        if (prLink != null)
        {
            var t = await _orders.FindOrderAsync(prLink.TicketId);
            if (t != null) return t;
        }

        // 2. a BRANCH link
        if (pr.SourceBranch.Length > 0)
        {
            var branchLinks = await _db.TicketDevelopmentLinks
                .Where(l => l.Kind == "BRANCH" && l.Name == pr.SourceBranch)
                .OrderByDescending(l => l.Id)
                .ToListAsync(ct);
            var branchLink = branchLinks.FirstOrDefault(l => SameRepo(l.Repo, pr.Repo)) ?? branchLinks.FirstOrDefault(l => l.Repo == null);
            if (branchLink != null)
            {
                var t = await _orders.FindOrderAsync(branchLink.TicketId);
                if (t != null) return t;
            }
        }

        // 3. the board url in the PR description (sessions put it there)
        if (!string.IsNullOrWhiteSpace(pr.Description))
        {
            var m = Regex.Match(pr.Description, @"/development/(\d+)\b");
            if (m.Success && long.TryParse(m.Groups[1].Value, out var orderId))
            {
                var t = await _orders.FindOrderAsync(orderId);
                if (t != null) return t;
            }
        }

        return null;
    }

    // A ticket (not yet a development order) named by the PR: the board url in
    // the description, or a BugOut_Fix_<id> source branch (the dispatcher's and
    // the developer kit's branch name).
    private async Task<Ticket?> FindReferencedTicketAsync(PullRequestInfo pr, CancellationToken ct)
    {
        long? id = null;
        if (!string.IsNullOrWhiteSpace(pr.Description))
        {
            var m = Regex.Match(pr.Description, @"/development/(\d+)\b");
            if (m.Success && long.TryParse(m.Groups[1].Value, out var fromDescription)) id = fromDescription;
        }
        if (id == null && pr.SourceBranch.Length > 0)
        {
            var b = Regex.Match(pr.SourceBranch, @"(?:^|/)BugOut_Fix_(\d+)$", RegexOptions.IgnoreCase);
            if (b.Success && long.TryParse(b.Groups[1].Value, out var fromBranch)) id = fromBranch;
        }
        if (id == null) return null;
        // Org-scoped by the global query filter.
        return await _db.Tickets.FirstOrDefaultAsync(t => t.Id == id.Value && !t.IsDevelopmentOrder, ct);
    }

    private async Task<Project?> ResolveProjectForRepoAsync(string repo, CancellationToken ct)
    {
        var slug = Lookup(_opts.RepoProjects, repo);
        if (slug != null)
        {
            var p = await _db.Projects.FirstOrDefaultAsync(x => x.Slug == slug, ct);
            if (p != null) return p;
            _log.LogWarning("AzureDevOps webhook: RepoProjects maps '{Repo}' to '{Slug}' but no application has that slug in this organization", repo, slug);
        }

        // Any order that already links this repo tells us the application.
        var linked = await _db.TicketDevelopmentLinks
            .Where(l => l.Repo != null && l.Repo.ToLower() == repo.ToLower())
            .OrderByDescending(l => l.Id)
            .Select(l => l.TicketId)
            .Take(20)
            .ToListAsync(ct);
        if (linked.Count > 0)
        {
            var projectId = await _db.Tickets.Where(t => linked.Contains(t.Id)).Select(t => (long?)t.ProjectId).FirstOrDefaultAsync(ct);
            if (projectId != null) return await _db.Projects.FirstOrDefaultAsync(p => p.Id == projectId.Value, ct);
        }
        return null;
    }

    // ===== deployments =====

    private async Task<WebhookOutcome> HandleReleaseDeploymentAsync(JsonElement resource, string actorEmail, string actorName, CancellationToken ct)
    {
        var environment = resource.TryGetProperty("environment", out var env) && env.ValueKind == JsonValueKind.Object ? env : default;
        var envName = environment.ValueKind == JsonValueKind.Object ? GetString(environment, "name") : null;
        var deployment = resource.TryGetProperty("deployment", out var dep) && dep.ValueKind == JsonValueKind.Object ? dep : default;
        var status = deployment.ValueKind == JsonValueKind.Object ? GetString(deployment, "deploymentStatus") : null;
        var releaseDef = environment.ValueKind == JsonValueKind.Object && environment.TryGetProperty("releaseDefinition", out var rd) && rd.ValueKind == JsonValueKind.Object ? GetString(rd, "name") : null;
        var releaseName = deployment.ValueKind == JsonValueKind.Object && deployment.TryGetProperty("release", out var rel) && rel.ValueKind == JsonValueKind.Object ? GetString(rel, "name") : null;

        if (!string.Equals(status, "succeeded", StringComparison.OrdinalIgnoreCase))
            return new WebhookOutcome(false, "ignored", null, $"deployment status '{status}' is not succeeded");

        var repoNames = new List<string>();
        if (deployment.ValueKind == JsonValueKind.Object && deployment.TryGetProperty("release", out var release) && release.ValueKind == JsonValueKind.Object
            && release.TryGetProperty("artifacts", out var artifacts) && artifacts.ValueKind == JsonValueKind.Array)
        {
            foreach (var a in artifacts.EnumerateArray())
            {
                if (a.TryGetProperty("definitionReference", out var dr) && dr.ValueKind == JsonValueKind.Object
                    && dr.TryGetProperty("repository", out var repoRef) && repoRef.ValueKind == JsonValueKind.Object)
                {
                    var n = GetString(repoRef, "name");
                    if (!string.IsNullOrWhiteSpace(n)) repoNames.Add(n);
                }
            }
        }

        return await ApplyDeploymentAsync(envName, repoNames, new[] { releaseDef, releaseName }, $"release {releaseName ?? releaseDef ?? "?"} to {envName ?? "?"}", actorEmail, actorName, ct);
    }

    private async Task<WebhookOutcome> HandlePipelineStageAsync(JsonElement resource, string actorEmail, string actorName, CancellationToken ct)
    {
        var stage = resource.TryGetProperty("stage", out var st) && st.ValueKind == JsonValueKind.Object ? st : default;
        var stageName = stage.ValueKind == JsonValueKind.Object ? (GetString(stage, "displayName") ?? GetString(stage, "name")) : null;
        var result = stage.ValueKind == JsonValueKind.Object ? GetString(stage, "result") : null;
        var state = stage.ValueKind == JsonValueKind.Object ? GetString(stage, "state") : null;
        var pipeline = resource.TryGetProperty("pipeline", out var pl) && pl.ValueKind == JsonValueKind.Object ? GetString(pl, "name") : null;

        if (!string.Equals(state, "completed", StringComparison.OrdinalIgnoreCase) || !string.Equals(result, "succeeded", StringComparison.OrdinalIgnoreCase))
            return new WebhookOutcome(false, "ignored", null, $"pipeline stage '{stageName}' state {state}/{result} is not a successful completion");

        var repoNames = new List<string>();
        if (resource.TryGetProperty("run", out var run) && run.ValueKind == JsonValueKind.Object
            && run.TryGetProperty("resources", out var res) && res.ValueKind == JsonValueKind.Object
            && res.TryGetProperty("repositories", out var repos) && repos.ValueKind == JsonValueKind.Object)
        {
            foreach (var p in repos.EnumerateObject())
            {
                if (p.Value.ValueKind == JsonValueKind.Object && p.Value.TryGetProperty("repository", out var repo) && repo.ValueKind == JsonValueKind.Object)
                {
                    var full = GetString(repo, "fullName") ?? GetString(repo, "name") ?? GetString(repo, "id");
                    if (!string.IsNullOrWhiteSpace(full)) repoNames.Add(full.Split('/').Last());
                }
            }
        }

        return await ApplyDeploymentAsync(stageName, repoNames, new[] { pipeline }, $"pipeline {pipeline ?? "?"} stage {stageName ?? "?"}", actorEmail, actorName, ct);
    }

    private async Task<WebhookOutcome> ApplyDeploymentAsync(string? environmentName, List<string> repoNames, IEnumerable<string?> pipelineNames,
        string description, string actorEmail, string actorName, CancellationToken ct)
    {
        var targetStage = FindStage(_opts.DeployEnvironments, environmentName, exact: false);
        if (targetStage == null)
            return new WebhookOutcome(false, "ignored", null, $"environment '{environmentName}' maps to no stage (DevelopmentTracker:DeployEnvironments)");

        Project? project = null;
        foreach (var repo in repoNames)
        {
            project = await ResolveProjectForRepoAsync(repo, ct);
            if (project != null) break;
        }
        if (project == null)
        {
            foreach (var name in pipelineNames.Where(n => !string.IsNullOrWhiteSpace(n)))
            {
                var slug = FindByKeyword(_opts.PipelineProjects, name!);
                if (slug != null) { project = await _db.Projects.FirstOrDefaultAsync(p => p.Slug == slug, ct); if (project != null) break; }
            }
        }
        if (project == null)
        {
            _log.LogWarning("AzureDevOps webhook: {Description} succeeded but no application matched repos [{Repos}] or pipeline names", description, string.Join(", ", repoNames));
            return new WebhookOutcome(false, "unmapped-pipeline", null, $"{description}: no application matched");
        }

        // Which orders were waiting for this deployment: everything merged to
        // dev when beta ships; everything merged or in beta when production ships.
        var waiting = targetStage == DevelopmentStages.Production
            ? new[] { DevelopmentStages.MergedDev, DevelopmentStages.Beta }
            : new[] { DevelopmentStages.MergedDev };

        // Initiatives are skipped: their stage follows their phases.
        var tickets = await _db.Tickets
            .Where(t => t.IsDevelopmentOrder && t.ProjectId == project.Id && t.DevelopmentStage != null && waiting.Contains(t.DevelopmentStage))
            .Where(t => !_db.Tickets.Any(c => c.ParentOrderId == t.Id && c.IsDevelopmentOrder))
            .OrderBy(t => t.Id)
            .ToListAsync(ct);

        if (tickets.Count == 0)
            return new WebhookOutcome(true, "deploy-nothing-waiting", null, $"{description}: no {project.Name} orders were waiting at {string.Join("/", waiting)}");

        var keys = await _orders.StatusKeysAsync();
        var now = DateTime.UtcNow;
        foreach (var t in tickets)
            _orders.MoveStage(t, targetStage, actorEmail, actorName, now, keys, description);
        await _db.SaveChangesAsync(ct);
        if ((await _orders.RollUpInitiativesAsync(tickets.Select(t => t.ParentOrderId), actorEmail, actorName, now, ct)).Count > 0)
            await _db.SaveChangesAsync(ct);

        return new WebhookOutcome(true, $"stage-{targetStage.ToLowerInvariant()}", tickets.Count == 1 ? tickets[0].Id : null,
            $"{description}: moved {tickets.Count} {project.Name} order(s) to {DevelopmentStages.Labels[targetStage]} (#{string.Join(", #", tickets.Select(t => t.Id))})");
    }

    // ===== helpers =====

    private static string? GetString(JsonElement el, string name) =>
        el.ValueKind == JsonValueKind.Object && el.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;

    private static string BranchName(string? refName)
    {
        if (string.IsNullOrWhiteSpace(refName)) return string.Empty;
        const string prefix = "refs/heads/";
        return refName.StartsWith(prefix, StringComparison.OrdinalIgnoreCase) ? refName[prefix.Length..] : refName;
    }

    private static string PullRequestUrl(PullRequestInfo pr) =>
        pr.RepoWebUrl != null ? $"{pr.RepoWebUrl.TrimEnd('/')}/pullrequest/{pr.Id}" : $"PR {pr.Id}";

    private static bool SameRepo(string? a, string? b) =>
        a != null && b != null && string.Equals(a.Trim(), b.Trim(), StringComparison.OrdinalIgnoreCase);

    private static bool IsPullRequestLink(TicketDevelopmentLink l, PullRequestInfo pr)
    {
        if (l.Kind != "PR") return false;
        var sameNumber = string.Equals(l.Name, $"PR {pr.Id}", StringComparison.OrdinalIgnoreCase)
            || (l.Url != null && l.Url.EndsWith($"/pullrequest/{pr.Id}", StringComparison.OrdinalIgnoreCase));
        if (!sameNumber) return false;
        return l.Repo == null || SameRepo(l.Repo, pr.Repo);
    }

    private static string? Lookup(Dictionary<string, string> map, string? key)
    {
        if (string.IsNullOrWhiteSpace(key)) return null;
        foreach (var kv in map)
            if (string.Equals(kv.Key, key.Trim(), StringComparison.OrdinalIgnoreCase)) return kv.Value;
        return null;
    }

    private static string? FindByKeyword(Dictionary<string, string> map, string text)
    {
        foreach (var kv in map)
            if (text.Contains(kv.Key, StringComparison.OrdinalIgnoreCase)) return kv.Value;
        return null;
    }

    // exact: the branch name must equal the key; otherwise the key may appear
    // anywhere in the name ("Beta - East", "Deploy to Prod").
    private static string? FindStage(Dictionary<string, string> map, string? name, bool exact)
    {
        if (string.IsNullOrWhiteSpace(name)) return null;
        var value = exact ? Lookup(map, name) : FindByKeyword(map, name);
        return DevelopmentStages.Normalize(value);
    }

    private static string? Truncate(string? s, int max) =>
        s == null ? null : (s.Length <= max ? s : s[..max]);
}
