using System.Security.Claims;
using System.Text.Json;
using BugsManaged.Api.Controllers;
using BugsManaged.Api.Data;
using BugsManaged.Api.Entities;
using BugsManaged.Api.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace BugsManaged.Api.Tests;

// Azure DevOps service hooks -> development orders. PRs are matched to the
// orders sessions logged (or create one), completed PRs move the stage by
// target branch, successful deployments move everything that was waiting.
public class AzureDevOpsWebhookTests
{
    private const long OrgId = 42;
    private const long ProjectId = 7;
    private const string Actor = "service-key:9";
    private const string ActorName = "Azure DevOps webhook";

    private static (AzureDevOpsWebhookService svc, BugsManagedDbContext db, DevelopmentOrderService orders) Build(DevelopmentTrackerOptions? options = null)
    {
        var org = new TestDoubles.TestOrgContext { CurrentOrganizationId = OrgId };
        var db = TestDoubles.NewInMemoryDb(org);
        TestDoubles.EnsureOrganization(db, OrgId);
        db.Projects.Add(new Project { Id = ProjectId, Name = "Service Managed", Slug = "service-managed", ApiKey = "k1", OrganizationId = OrgId });
        db.Projects.Add(new Project { Id = ProjectId + 1, Name = "Forsor", Slug = "forsor", ApiKey = "k2", OrganizationId = OrgId });
        db.SaveChanges();

        var activity = new TicketActivityLogger(db);
        var orders = new DevelopmentOrderService(db, activity);
        var opts = options ?? new DevelopmentTrackerOptions { BoardBaseUrl = "https://bugout.managedplatform.com", TimeZone = "UTC" };
        var svc = new AzureDevOpsWebhookService(db, orders, activity, org, Options.Create(opts), NullLogger<AzureDevOpsWebhookService>.Instance);
        return (svc, db, orders);
    }

    private static Ticket SeedOrder(BugsManagedDbContext db, string stage, string title = "Estimates", long projectId = ProjectId, params (string Kind, string Repo, string Name)[] links)
    {
        var t = new Ticket
        {
            OrganizationId = OrgId, ProjectId = projectId, Title = title, TicketType = "FEATURE_REQUEST", Status = "OPEN",
            IsDevelopmentOrder = true, DevelopmentStage = stage, SubmittedBy = "Larry",
        };
        db.Tickets.Add(t);
        db.SaveChanges();
        foreach (var l in links)
            db.TicketDevelopmentLinks.Add(new TicketDevelopmentLink { TicketId = t.Id, OrganizationId = OrgId, Kind = l.Kind, Repo = l.Repo, Name = l.Name });
        db.SaveChanges();
        return t;
    }

    private static JsonElement PullRequest(string eventType, int id, string repo, string status, string source = "anil/dispatch-flicker",
        string target = "dev", string? description = null, string closedBy = "Dilpreet Singh") =>
        JsonDocument.Parse(JsonSerializer.Serialize(new
        {
            eventType,
            resource = new
            {
                repository = new { id = "r1", name = repo, webUrl = $"https://dev.azure.com/protocall/WebbasedLLC/_git/{repo}", project = new { name = "WebbasedLLC" } },
                pullRequestId = id,
                status,
                createdBy = new { displayName = "Anil Kumar", uniqueName = "anil@example.com" },
                closedBy = status == "active" ? null : new { displayName = closedBy },
                title = "Fix dispatch board flicker",
                description = description ?? "Fixes the flicker on the dispatch board",
                sourceRefName = "refs/heads/" + source,
                targetRefName = "refs/heads/" + target,
            },
        })).RootElement;

    private static JsonElement ReleaseDeployment(string environment, string status, string repo, string release = "Release-42") =>
        JsonDocument.Parse(JsonSerializer.Serialize(new
        {
            eventType = "ms.vss-release.deployment-completed-event",
            resource = new
            {
                environment = new { name = environment, releaseDefinition = new { name = $"{repo}-Release" } },
                deployment = new
                {
                    deploymentStatus = status,
                    release = new { name = release, artifacts = new[] { new { definitionReference = new { repository = new { name = repo } } } } },
                },
            },
        })).RootElement;

    private static JsonElement PipelineStage(string stageName, string state, string result, string pipeline, string repoFullName) =>
        JsonDocument.Parse(JsonSerializer.Serialize(new
        {
            eventType = "ms.vss-pipelines.stage-state-changed-event",
            resource = new
            {
                stage = new { name = stageName.Replace(' ', '_'), displayName = stageName, state, result },
                pipeline = new { name = pipeline },
                run = new { resources = new { repositories = new { self = new { repository = new { fullName = repoFullName } } } } },
            },
        })).RootElement;

    // ===== pull requests =====

    [Fact]
    public async Task PrCreated_ForUnknownPr_CreatesOrderAtPrOpen_WithLinks()
    {
        var (svc, db, _) = Build();

        var outcome = await svc.HandleAsync(PullRequest("git.pullrequest.created", 4362, "ServiceManagerUI", "active"), Actor, ActorName);

        Assert.True(outcome.Handled);
        Assert.Equal("order-created", outcome.Action);
        var t = await db.Tickets.IgnoreQueryFilters().SingleAsync(x => x.Id == outcome.OrderId);
        Assert.True(t.IsDevelopmentOrder);
        Assert.Equal(ProjectId, t.ProjectId);
        Assert.Equal("Fix dispatch board flicker", t.Title);
        Assert.Equal("Anil Kumar", t.SubmittedBy);
        Assert.Equal(DevelopmentStages.PrOpen, t.DevelopmentStage);
        Assert.Equal("IN_REVIEW", t.Status);
        Assert.Equal("FEATURE_REQUEST", t.TicketType);

        var links = db.TicketDevelopmentLinks.IgnoreQueryFilters().Where(l => l.TicketId == t.Id).ToList();
        Assert.Contains(links, l => l.Kind == "PR" && l.Name == "PR 4362" && l.Repo == "ServiceManagerUI" && l.Url == "https://dev.azure.com/protocall/WebbasedLLC/_git/ServiceManagerUI/pullrequest/4362");
        Assert.Contains(links, l => l.Kind == "BRANCH" && l.Name == "anil/dispatch-flicker" && l.Repo == "ServiceManagerUI");

        Assert.Single(db.TicketStageHistory.IgnoreQueryFilters().Where(h => h.TicketId == t.Id));
        Assert.Contains(db.TicketActivities.IgnoreQueryFilters().Where(a => a.TicketId == t.Id), a => a.Kind == "DEV_ORDER_CREATED" && a.Message.Contains("Anil Kumar"));
    }

    [Fact]
    public async Task PrCreated_Redelivered_IsIdempotent()
    {
        var (svc, db, _) = Build();
        var first = await svc.HandleAsync(PullRequest("git.pullrequest.created", 4362, "ServiceManagerUI", "active"), Actor, ActorName);
        var second = await svc.HandleAsync(PullRequest("git.pullrequest.created", 4362, "ServiceManagerUI", "active"), Actor, ActorName);

        Assert.Equal(first.OrderId, second.OrderId);
        Assert.Equal("order-matched", second.Action);
        Assert.Equal(1, db.Tickets.IgnoreQueryFilters().Count(t => t.IsDevelopmentOrder));
        Assert.Equal(2, db.TicketDevelopmentLinks.IgnoreQueryFilters().Count(l => l.TicketId == first.OrderId));
        Assert.Equal(1, db.TicketStageHistory.IgnoreQueryFilters().Count(h => h.TicketId == first.OrderId));
    }

    [Fact]
    public async Task PrCreated_MatchesSessionOrder_ByPrLink_AndMovesToPrOpen()
    {
        var (svc, db, _) = Build();
        var order = SeedOrder(db, DevelopmentStages.InProgress, links: ("PR", "ServiceManagerUI", "PR 4347"));

        var outcome = await svc.HandleAsync(PullRequest("git.pullrequest.created", 4347, "ServiceManagerUI", "active", source: "Larry_Estimates_ChangeOrders"), Actor, ActorName);

        Assert.Equal(order.Id, outcome.OrderId);
        Assert.Equal("stage-pr-open", outcome.Action);
        var t = await db.Tickets.IgnoreQueryFilters().SingleAsync(x => x.Id == order.Id);
        Assert.Equal(DevelopmentStages.PrOpen, t.DevelopmentStage);
        Assert.Equal(1, db.Tickets.IgnoreQueryFilters().Count(x => x.IsDevelopmentOrder));
        // PR link already existed; only the branch link is new.
        var links = db.TicketDevelopmentLinks.IgnoreQueryFilters().Where(l => l.TicketId == order.Id).ToList();
        Assert.Equal(2, links.Count);
        Assert.Contains(links, l => l.Kind == "BRANCH" && l.Name == "Larry_Estimates_ChangeOrders");
    }

    [Fact]
    public async Task PrCreated_MatchesByBoardUrlInDescription()
    {
        var (svc, db, _) = Build();
        var order = SeedOrder(db, DevelopmentStages.Ordered);

        var outcome = await svc.HandleAsync(PullRequest("git.pullrequest.created", 4400, "ServiceManagedWeb", "active",
            description: $"Video: https://videos-dev.managedplatform.com/x/r/y\nOrder: https://bugout.managedplatform.com/development/{order.Id}"), Actor, ActorName);

        Assert.Equal(order.Id, outcome.OrderId);
        Assert.Equal(1, db.Tickets.IgnoreQueryFilters().Count(x => x.IsDevelopmentOrder));
        Assert.Equal(DevelopmentStages.PrOpen, (await db.Tickets.IgnoreQueryFilters().SingleAsync(x => x.Id == order.Id)).DevelopmentStage);
        Assert.Contains(db.TicketDevelopmentLinks.IgnoreQueryFilters().Where(l => l.TicketId == order.Id), l => l.Kind == "PR" && l.Name == "PR 4400" && l.Repo == "ServiceManagedWeb");
    }

    [Fact]
    public async Task PrCompletedIntoDev_MovesToMergedDev()
    {
        var (svc, db, _) = Build();
        var order = SeedOrder(db, DevelopmentStages.PrOpen, links: ("PR", "ServiceManagerUI", "PR 4347"));

        var outcome = await svc.HandleAsync(PullRequest("git.pullrequest.updated", 4347, "ServiceManagerUI", "completed"), Actor, ActorName);

        Assert.Equal("stage-merged_dev", outcome.Action);
        var t = await db.Tickets.IgnoreQueryFilters().SingleAsync(x => x.Id == order.Id);
        Assert.Equal(DevelopmentStages.MergedDev, t.DevelopmentStage);
        Assert.Equal("IN_REVIEW", t.Status);
        var history = db.TicketStageHistory.IgnoreQueryFilters().Where(h => h.TicketId == order.Id).ToList();
        Assert.Single(history);
        Assert.Contains("completed into dev", history[0].Note);
        Assert.Contains("Dilpreet Singh", history[0].Note);

        // Redelivery of the same completion changes nothing more.
        var again = await svc.HandleAsync(PullRequest("git.pullrequest.updated", 4347, "ServiceManagerUI", "completed"), Actor, ActorName);
        Assert.Equal("pr-completed-already-past", again.Action);
        Assert.Single(db.TicketStageHistory.IgnoreQueryFilters().Where(h => h.TicketId == order.Id));
    }

    [Fact]
    public async Task PrCompletedIntoMaster_MovesToProduction()
    {
        var (svc, db, _) = Build();
        var order = SeedOrder(db, DevelopmentStages.Beta, links: ("PR", "ServiceManagerUI", "PR 4500"));

        var outcome = await svc.HandleAsync(PullRequest("git.pullrequest.updated", 4500, "ServiceManagerUI", "completed", target: "master"), Actor, ActorName);

        Assert.Equal("stage-production", outcome.Action);
        var t = await db.Tickets.IgnoreQueryFilters().SingleAsync(x => x.Id == order.Id);
        Assert.Equal(DevelopmentStages.Production, t.DevelopmentStage);
        Assert.NotNull(t.ProductionAt);
        Assert.Equal("RESOLVED", t.Status);
    }

    [Fact]
    public async Task PrCompletedIntoUnmappedBranch_NotesOnly()
    {
        var (svc, db, _) = Build();
        var order = SeedOrder(db, DevelopmentStages.PrOpen, links: ("PR", "ServiceManagerUI", "PR 4347"));

        var outcome = await svc.HandleAsync(PullRequest("git.pullrequest.updated", 4347, "ServiceManagerUI", "completed", target: "feature/big-rewrite"), Actor, ActorName);

        Assert.Equal("pr-completed-unmapped-branch", outcome.Action);
        Assert.Equal(DevelopmentStages.PrOpen, (await db.Tickets.IgnoreQueryFilters().SingleAsync(x => x.Id == order.Id)).DevelopmentStage);
        Assert.Contains(db.TicketActivities.IgnoreQueryFilters().Where(a => a.TicketId == order.Id), a => a.Kind == "DEV_PR_COMPLETED");
    }

    [Fact]
    public async Task PrAbandoned_NotesOnce_StageUnchanged()
    {
        var (svc, db, _) = Build();
        var order = SeedOrder(db, DevelopmentStages.PrOpen, links: ("PR", "ServiceManagerUI", "PR 4347"));

        await svc.HandleAsync(PullRequest("git.pullrequest.updated", 4347, "ServiceManagerUI", "abandoned"), Actor, ActorName);
        var again = await svc.HandleAsync(PullRequest("git.pullrequest.updated", 4347, "ServiceManagerUI", "abandoned"), Actor, ActorName);

        Assert.Equal("pr-abandoned", again.Action);
        Assert.Equal(DevelopmentStages.PrOpen, (await db.Tickets.IgnoreQueryFilters().SingleAsync(x => x.Id == order.Id)).DevelopmentStage);
        Assert.Equal(1, db.TicketActivities.IgnoreQueryFilters().Count(a => a.TicketId == order.Id && a.Kind == "DEV_PR_ABANDONED"));
    }

    [Fact]
    public async Task PrAbandoned_ForUnknownPr_IsIgnored()
    {
        var (svc, db, _) = Build();
        var outcome = await svc.HandleAsync(PullRequest("git.pullrequest.updated", 4999, "ServiceManagerUI", "abandoned"), Actor, ActorName);
        Assert.False(outcome.Handled);
        Assert.Equal(0, db.Tickets.IgnoreQueryFilters().Count(t => t.IsDevelopmentOrder));
    }

    [Fact]
    public async Task PrCreated_UnmappedRepo_IsIgnored_ButLinkedRepoResolvesThroughExistingOrder()
    {
        var opts = new DevelopmentTrackerOptions { TimeZone = "UTC" };
        opts.RepoProjects.Clear();
        var (svc, db, _) = Build(opts);

        var ignored = await svc.HandleAsync(PullRequest("git.pullrequest.created", 1, "MysteryRepo", "active"), Actor, ActorName);
        Assert.False(ignored.Handled);
        Assert.Equal("unmapped-repo", ignored.Action);

        // An earlier order linked ForsorWeb to the Forsor application; a new PR in that repo lands there.
        SeedOrder(db, DevelopmentStages.MergedDev, "Boosts", ProjectId + 1, ("BRANCH", "ForsorWeb", "feature/boosts"));
        var created = await svc.HandleAsync(PullRequest("git.pullrequest.created", 2, "ForsorWeb", "active", source: "feature/tags"), Actor, ActorName);
        Assert.Equal("order-created", created.Action);
        Assert.Equal(ProjectId + 1, (await db.Tickets.IgnoreQueryFilters().SingleAsync(t => t.Id == created.OrderId)).ProjectId);
    }

    // ===== deployments =====

    [Fact]
    public async Task ReleaseDeploymentToBeta_MovesMergedOrdersOfThatApp()
    {
        var (svc, db, _) = Build();
        var a = SeedOrder(db, DevelopmentStages.MergedDev, "A");
        var b = SeedOrder(db, DevelopmentStages.MergedDev, "B");
        var open = SeedOrder(db, DevelopmentStages.PrOpen, "still open");
        var otherApp = SeedOrder(db, DevelopmentStages.MergedDev, "forsor thing", ProjectId + 1);

        var outcome = await svc.HandleAsync(ReleaseDeployment("Beta", "succeeded", "ServiceManagerUI"), Actor, ActorName);

        Assert.True(outcome.Handled);
        Assert.Equal("stage-beta", outcome.Action);
        Assert.Equal(DevelopmentStages.Beta, (await db.Tickets.IgnoreQueryFilters().SingleAsync(t => t.Id == a.Id)).DevelopmentStage);
        Assert.Equal(DevelopmentStages.Beta, (await db.Tickets.IgnoreQueryFilters().SingleAsync(t => t.Id == b.Id)).DevelopmentStage);
        Assert.Equal(DevelopmentStages.PrOpen, (await db.Tickets.IgnoreQueryFilters().SingleAsync(t => t.Id == open.Id)).DevelopmentStage);
        Assert.Equal(DevelopmentStages.MergedDev, (await db.Tickets.IgnoreQueryFilters().SingleAsync(t => t.Id == otherApp.Id)).DevelopmentStage);
        Assert.Contains("Release-42", db.TicketStageHistory.IgnoreQueryFilters().Single(h => h.TicketId == a.Id).Note);

        var nothing = await svc.HandleAsync(ReleaseDeployment("Beta", "succeeded", "ServiceManagerUI"), Actor, ActorName);
        Assert.Equal("deploy-nothing-waiting", nothing.Action);
    }

    [Fact]
    public async Task FailedDeployment_IsIgnored()
    {
        var (svc, db, _) = Build();
        var a = SeedOrder(db, DevelopmentStages.MergedDev, "A");
        var outcome = await svc.HandleAsync(ReleaseDeployment("Beta", "failed", "ServiceManagerUI"), Actor, ActorName);
        Assert.False(outcome.Handled);
        Assert.Equal(DevelopmentStages.MergedDev, (await db.Tickets.IgnoreQueryFilters().SingleAsync(t => t.Id == a.Id)).DevelopmentStage);
    }

    [Fact]
    public async Task PipelineStageToProd_MovesMergedAndBetaToProduction()
    {
        var (svc, db, _) = Build();
        var merged = SeedOrder(db, DevelopmentStages.MergedDev, "merged");
        var beta = SeedOrder(db, DevelopmentStages.Beta, "in beta");
        var open = SeedOrder(db, DevelopmentStages.PrOpen, "open");

        var outcome = await svc.HandleAsync(PipelineStage("Deploy to Prod", "completed", "succeeded", "ServiceManagedWeb CI", "WebbasedLLC/ServiceManagedWeb"), Actor, ActorName);

        Assert.Equal("stage-production", outcome.Action);
        foreach (var id in new[] { merged.Id, beta.Id })
        {
            var t = await db.Tickets.IgnoreQueryFilters().SingleAsync(x => x.Id == id);
            Assert.Equal(DevelopmentStages.Production, t.DevelopmentStage);
            Assert.NotNull(t.ProductionAt);
        }
        Assert.Equal(DevelopmentStages.PrOpen, (await db.Tickets.IgnoreQueryFilters().SingleAsync(x => x.Id == open.Id)).DevelopmentStage);
    }

    [Fact]
    public async Task PipelineStage_ResolvesAppByPipelineNameWhenNoRepo()
    {
        var (svc, db, _) = Build();
        var merged = SeedOrder(db, DevelopmentStages.MergedDev, "merged");
        var payload = JsonDocument.Parse(JsonSerializer.Serialize(new
        {
            eventType = "ms.vss-pipelines.stage-state-changed-event",
            resource = new { stage = new { name = "Beta", state = "completed", result = "succeeded" }, pipeline = new { name = "ServiceManaged nightly" } },
        })).RootElement;

        var outcome = await svc.HandleAsync(payload, Actor, ActorName);

        Assert.Equal("stage-beta", outcome.Action);
        Assert.Equal(DevelopmentStages.Beta, (await db.Tickets.IgnoreQueryFilters().SingleAsync(x => x.Id == merged.Id)).DevelopmentStage);
    }

    [Fact]
    public async Task UnknownEvent_IsIgnoredNotRejected()
    {
        var (svc, _, _) = Build();
        var payload = JsonDocument.Parse("{\"eventType\":\"workitem.updated\",\"resource\":{\"id\":1}}").RootElement;
        var outcome = await svc.HandleAsync(payload, Actor, ActorName);
        Assert.False(outcome.Handled);
        Assert.Equal("ignored", outcome.Action);
    }

    // ===== controller =====

    [Fact]
    public async Task Controller_ReadOnlyKey_Gets403_WriteKey_Gets200Or202()
    {
        var (svc, _, _) = Build();
        var org = new TestDoubles.TestOrgContext { CurrentOrganizationId = OrgId };
        var ctrl = new DevelopmentWebhookController(svc, org, NullLogger<DevelopmentWebhookController>.Instance);

        ClaimsPrincipal Principal(params string[] scopes)
        {
            var claims = new List<Claim> { new(ClaimTypes.Role, ServiceKeys.Role), new(ClaimTypes.Email, Actor), new("fullName", ActorName) };
            claims.AddRange(scopes.Select(s => new Claim(ServiceKeys.ScopeClaim, s)));
            return new ClaimsPrincipal(new ClaimsIdentity(claims, "TestAuth"));
        }

        ctrl.ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext { User = Principal(ServiceKeys.ScopeDevelopmentRead) } };
        var denied = Assert.IsType<ObjectResult>(await ctrl.AzureDevOps(PullRequest("git.pullrequest.created", 1, "ServiceManagerUI", "active"), default));
        Assert.Equal(403, denied.StatusCode);

        ctrl.ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext { User = Principal(ServiceKeys.ScopeDevelopmentWrite) } };
        Assert.IsType<OkObjectResult>(await ctrl.AzureDevOps(PullRequest("git.pullrequest.created", 1, "ServiceManagerUI", "active"), default));
        Assert.IsType<AcceptedResult>(await ctrl.AzureDevOps(JsonDocument.Parse("{\"eventType\":\"workitem.updated\",\"resource\":{}}").RootElement, default));
    }
}
