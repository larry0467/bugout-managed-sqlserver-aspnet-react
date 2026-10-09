using System.Security.Claims;
using BugsManaged.Api.Controllers;
using BugsManaged.Api.Data;
using BugsManaged.Api.Entities;
using BugsManaged.Api.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace BugsManaged.Api.Tests;

// DevelopmentController: orders are FEATURE_REQUEST tickets with the
// IsDevelopmentOrder bit; stages are validated and leave an audit trail;
// everything is org-scoped; service keys need the write scope to change
// anything.
public class DevelopmentOrdersTests
{
    private const long OrgId = 42;
    private const long OtherOrgId = 43;
    private const long ProjectId = 7;

    private static (DevelopmentController ctrl, BugsManagedDbContext db) Build(
        string role = "PLATFORM_OWNER",
        string email = "owner@x.com",
        string name = "Owner",
        string[]? serviceScopes = null,
        long orgId = OrgId)
    {
        var org = new TestDoubles.TestOrgContext { CurrentOrganizationId = orgId };
        var db = TestDoubles.NewInMemoryDb(org);
        TestDoubles.EnsureOrganization(db, OrgId);
        TestDoubles.EnsureOrganization(db, OtherOrgId);

        if (!db.Projects.IgnoreQueryFilters().Any(p => p.Id == ProjectId))
        {
            db.Projects.Add(new Project { Id = ProjectId, Name = "Service Managed", Slug = "service-managed", ApiKey = "k1", OrganizationId = OrgId });
            db.Projects.Add(new Project { Id = ProjectId + 1, Name = "Other Org App", Slug = "other-org-app", ApiKey = "k2", OrganizationId = OtherOrgId });
            db.SaveChanges();
        }

        var opts = Options.Create(new DevelopmentTrackerOptions { BoardBaseUrl = "https://board.test", TimeZone = "UTC" });
        var activity = new TicketActivityLogger(db);
        var ctrl = new DevelopmentController(db, org, activity, new BillingService(db), new TestDoubles.NoOpAuditLogger(), opts,
            new DevelopmentOrderService(db, activity));

        var claims = new List<Claim>
        {
            new(ClaimTypes.Email, email),
            new(ClaimTypes.Role, role),
            new("fullName", name),
            new("organizationId", orgId.ToString()),
        };
        foreach (var s in serviceScopes ?? Array.Empty<string>())
            claims.Add(new Claim(ServiceKeys.ScopeClaim, s));

        ctrl.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext { User = new ClaimsPrincipal(new ClaimsIdentity(claims, "TestAuth")) },
        };
        return (ctrl, db);
    }

    private static DevelopmentController.CreateOrderRequest NewOrder(string title = "Estimates + change orders", string? stage = null) =>
        new(ProjectId, null, title, "Summary of what was ordered",
            "https://videos-dev.managedplatform.com/larry-baxter/r/first-ai-drafted-estimate",
            "WEBVTT\n\n00:00.000 --> 00:05.000\nhello", "https://onedrive.example/SESSION.md", "sess-1",
            "Larry", stage, null,
            new List<DevelopmentController.LinkRequest>
            {
                new("BRANCH", "ServiceManagerUI", "Larry_Estimates_ChangeOrders", null, null),
                new("PR", "ServiceManagerUI", "PR 4347", "https://dev.azure.com/x/_git/ServiceManagerUI/pullrequest/4347", null),
            });

    private static DevelopmentController.OrderDetailDto Detail(IActionResult result)
    {
        var value = result switch
        {
            CreatedAtActionResult c => c.Value,
            OkObjectResult o => o.Value,
            _ => throw new Xunit.Sdk.XunitException($"Expected 201/200, got {result.GetType().Name}: {(result as ObjectResult)?.Value}"),
        };
        return Assert.IsType<DevelopmentController.OrderDetailDto>(value);
    }

    // ===== create =====

    [Fact]
    public async Task Create_AsServiceKeyWithWriteScope_CreatesFeatureRequestOrder()
    {
        var (ctrl, db) = Build(role: ServiceKeys.Role, email: "service-key:1", name: "Claude Code - devbox",
            serviceScopes: new[] { ServiceKeys.ScopeDevelopmentWrite });

        var result = await ctrl.CreateOrder(NewOrder());
        var detail = Detail(result);

        var ticket = await db.Tickets.IgnoreQueryFilters().SingleAsync(t => t.Id == detail.Order.Id);
        Assert.True(ticket.IsDevelopmentOrder);
        Assert.Equal("FEATURE_REQUEST", ticket.TicketType);
        Assert.Equal(DevelopmentStages.Ordered, ticket.DevelopmentStage);
        Assert.Equal("NONE", ticket.EscalationStage);
        Assert.Equal("OPEN", ticket.Status);
        Assert.Equal(OrgId, ticket.OrganizationId);
        Assert.Equal("Larry", ticket.SubmittedBy);
        Assert.Equal("https://videos-dev.managedplatform.com/larry-baxter/r/first-ai-drafted-estimate", ticket.VideoUrl);
        Assert.Contains("WEBVTT", ticket.Transcript);
        Assert.Equal("https://onedrive.example/SESSION.md", ticket.SessionLogUrl);
        Assert.Null(ticket.ProductionAt);

        Assert.Equal("Service Managed", detail.Order.ProjectName);
        Assert.Equal("Ordered", detail.Order.StageLabel);
        Assert.Equal($"https://board.test/development/{ticket.Id}", detail.Order.BoardUrl);
        Assert.True(detail.Order.HasTranscript);
        Assert.Equal(2, detail.Order.Links.Count);
        Assert.Contains(detail.Order.Links, l => l.Kind == "PR" && l.Name == "PR 4347" && l.Repo == "ServiceManagerUI");

        var history = db.TicketStageHistory.IgnoreQueryFilters().Where(h => h.TicketId == ticket.Id).ToList();
        Assert.Single(history);
        Assert.Null(history[0].FromStage);
        Assert.Equal(DevelopmentStages.Ordered, history[0].ToStage);
        Assert.Equal("service-key:1", history[0].ChangedBy);

        var activity = db.TicketActivities.IgnoreQueryFilters().Where(a => a.TicketId == ticket.Id).ToList();
        Assert.Contains(activity, a => a.Kind == "DEV_ORDER_CREATED" && a.ActorName == "Claude Code - devbox");
        Assert.Single(detail.StageHistory);
    }

    [Fact]
    public async Task Create_AtProductionStage_StampsProductionAtAndResolves()
    {
        var (ctrl, db) = Build();
        var detail = Detail(await ctrl.CreateOrder(NewOrder(stage: "production")));

        var ticket = await db.Tickets.IgnoreQueryFilters().SingleAsync(t => t.Id == detail.Order.Id);
        Assert.Equal(DevelopmentStages.Production, ticket.DevelopmentStage);
        Assert.NotNull(ticket.ProductionAt);
        Assert.Equal("RESOLVED", ticket.Status);
        Assert.NotNull(ticket.ResolvedAt);
        Assert.True(detail.Order.NeedsAnnouncement);
    }

    [Fact]
    public async Task Create_UnknownStage_Returns400()
    {
        var (ctrl, _) = Build();
        var result = await ctrl.CreateOrder(NewOrder(stage: "SHIPPED_TO_MARS"));
        var bad = Assert.IsType<BadRequestObjectResult>(result);
        Assert.Contains("ORDERED", bad.Value!.ToString()!);
    }

    [Fact]
    public async Task Create_UnknownProject_Returns400WithKnownSlugs()
    {
        var (ctrl, _) = Build();
        var req = NewOrder() with { ProjectId = null, ProjectSlug = "no-such-app" };
        var result = await ctrl.CreateOrder(req);
        var bad = Assert.IsType<BadRequestObjectResult>(result);
        // Anonymous payload: serialize so the knownSlugs list is actually inspected.
        var json = System.Text.Json.JsonSerializer.Serialize(bad.Value);
        Assert.Contains("service-managed", json);
        Assert.Contains("projectId or projectSlug", json);
    }

    [Fact]
    public async Task Create_BySlug_ResolvesProject()
    {
        var (ctrl, _) = Build();
        var req = NewOrder() with { ProjectId = null, ProjectSlug = "service-managed" };
        var detail = Detail(await ctrl.CreateOrder(req));
        Assert.Equal(ProjectId, detail.Order.ProjectId);
    }

    [Fact]
    public async Task Create_ServiceKeyWithoutWriteScope_Returns403()
    {
        var (ctrl, _) = Build(role: ServiceKeys.Role, serviceScopes: new[] { ServiceKeys.ScopeDevelopmentRead });
        var result = await ctrl.CreateOrder(NewOrder());
        var obj = Assert.IsType<ObjectResult>(result);
        Assert.Equal(403, obj.StatusCode);
    }

    [Fact]
    public async Task Create_AsViewer_Returns403_ButViewerCanList()
    {
        var (ctrl, _) = Build(role: "VIEWER");
        var denied = Assert.IsType<ObjectResult>(await ctrl.CreateOrder(NewOrder()));
        Assert.Equal(403, denied.StatusCode);

        Assert.IsType<OkObjectResult>(await ctrl.ListOrders(null, null, null, null, null));
    }

    [Fact]
    public async Task Create_InvalidLinkKind_Returns400()
    {
        var (ctrl, _) = Build();
        var req = NewOrder() with { Links = new List<DevelopmentController.LinkRequest> { new("TWEET", null, "x", null, null) } };
        Assert.IsType<BadRequestObjectResult>(await ctrl.CreateOrder(req));
    }

    // ===== stage =====

    [Fact]
    public async Task SetStage_ToProduction_StampsProductionAt_RecordsHistoryAndActivity()
    {
        var (ctrl, db) = Build(email: "owner@x.com", name: "Owner");
        var id = Detail(await ctrl.CreateOrder(NewOrder())).Order.Id;

        var detail = Detail(await ctrl.SetStage(id, new DevelopmentController.SetStageRequest("PRODUCTION", "deployed by the team")));

        var ticket = await db.Tickets.IgnoreQueryFilters().SingleAsync(t => t.Id == id);
        Assert.Equal(DevelopmentStages.Production, ticket.DevelopmentStage);
        Assert.NotNull(ticket.ProductionAt);
        Assert.Equal("RESOLVED", ticket.Status);
        Assert.True(detail.Order.NeedsAnnouncement);

        var history = db.TicketStageHistory.IgnoreQueryFilters().Where(h => h.TicketId == id).OrderBy(h => h.Id).ToList();
        Assert.Equal(2, history.Count);
        Assert.Equal(DevelopmentStages.Ordered, history[1].FromStage);
        Assert.Equal(DevelopmentStages.Production, history[1].ToStage);
        Assert.Equal("deployed by the team", history[1].Note);

        var act = db.TicketActivities.IgnoreQueryFilters().Single(a => a.TicketId == id && a.Kind == "DEV_STAGE_CHANGED");
        Assert.Contains("Ordered", act.Message);
        Assert.Contains("Production", act.Message);
        Assert.Contains("deployed by the team", act.Message);
        Assert.Contains("\"toStage\":\"PRODUCTION\"", act.PayloadJson);
    }

    [Fact]
    public async Task SetStage_RollbackBelowProduction_ClearsProductionAndDigestStamps()
    {
        var (ctrl, db) = Build();
        var id = Detail(await ctrl.CreateOrder(NewOrder(stage: "PRODUCTION"))).Order.Id;
        var ticket = await db.Tickets.IgnoreQueryFilters().SingleAsync(t => t.Id == id);
        ticket.DigestSentAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        Detail(await ctrl.SetStage(id, new DevelopmentController.SetStageRequest("BETA", "rolled back")));

        ticket = await db.Tickets.IgnoreQueryFilters().SingleAsync(t => t.Id == id);
        Assert.Equal(DevelopmentStages.Beta, ticket.DevelopmentStage);
        Assert.Null(ticket.ProductionAt);
        Assert.Null(ticket.DigestSentAt);
        Assert.Equal("READY_FOR_TESTING", ticket.Status);
        Assert.Null(ticket.ResolvedAt);
    }

    [Fact]
    public async Task SetStage_SameStage_IsNoOp()
    {
        var (ctrl, db) = Build();
        var id = Detail(await ctrl.CreateOrder(NewOrder())).Order.Id;

        Detail(await ctrl.SetStage(id, new DevelopmentController.SetStageRequest("ORDERED", null)));

        Assert.Single(db.TicketStageHistory.IgnoreQueryFilters().Where(h => h.TicketId == id));
    }

    [Fact]
    public async Task SetStage_Invalid_Returns400()
    {
        var (ctrl, _) = Build();
        var id = Detail(await ctrl.CreateOrder(NewOrder())).Order.Id;
        Assert.IsType<BadRequestObjectResult>(await ctrl.SetStage(id, new DevelopmentController.SetStageRequest("DONE", null)));
    }

    [Fact]
    public async Task SetStage_UsesOrgStatusDictionary_WhenPresent()
    {
        var (ctrl, db) = Build();
        // Org renamed its statuses: no IN_REVIEW key, so PR_OPEN leaves Status alone.
        db.TicketStatusDefs.Add(new TicketStatusDef { OrganizationId = OrgId, Key = "OPEN", DisplayName = "Open", Color = "#fff", SortOrder = 0 });
        db.TicketStatusDefs.Add(new TicketStatusDef { OrganizationId = OrgId, Key = "WORKING", DisplayName = "Working", Color = "#fff", SortOrder = 1 });
        await db.SaveChangesAsync();

        var id = Detail(await ctrl.CreateOrder(NewOrder())).Order.Id;
        Detail(await ctrl.SetStage(id, new DevelopmentController.SetStageRequest("PR_OPEN", null)));

        var ticket = await db.Tickets.IgnoreQueryFilters().SingleAsync(t => t.Id == id);
        Assert.Equal(DevelopmentStages.PrOpen, ticket.DevelopmentStage);
        Assert.Equal("OPEN", ticket.Status);
    }

    // ===== patch =====

    [Fact]
    public async Task Patch_AnnouncementVideo_OnProductionItem_MovesToAnnounced_AndClearingMovesBack()
    {
        var (ctrl, db) = Build();
        var id = Detail(await ctrl.CreateOrder(NewOrder(stage: "PRODUCTION"))).Order.Id;

        var detail = Detail(await ctrl.UpdateOrder(id, new DevelopmentController.UpdateOrderRequest(
            null, null, null, null, null, null, "https://videos-dev.managedplatform.com/larry-baxter/r/what-shipped", null, null)));

        Assert.Equal(DevelopmentStages.Announced, detail.Order.Stage);
        Assert.NotNull(detail.Order.AnnouncedAt);
        Assert.False(detail.Order.NeedsAnnouncement);
        Assert.Equal(3, db.TicketStageHistory.IgnoreQueryFilters().Count(h => h.TicketId == id) + 1); // created + announced

        detail = Detail(await ctrl.UpdateOrder(id, new DevelopmentController.UpdateOrderRequest(
            null, null, null, null, null, null, "", null, null)));

        Assert.Equal(DevelopmentStages.Production, detail.Order.Stage);
        Assert.Null(detail.Order.AnnouncementVideoUrl);
        Assert.Null(detail.Order.AnnouncedAt);
        Assert.True(detail.Order.NeedsAnnouncement);
    }

    [Fact]
    public async Task Patch_NullLeavesField_EmptyClearsIt()
    {
        var (ctrl, db) = Build();
        var id = Detail(await ctrl.CreateOrder(NewOrder())).Order.Id;

        Detail(await ctrl.UpdateOrder(id, new DevelopmentController.UpdateOrderRequest(
            "New title", null, null, null, "", null, null, "high", null)));

        var ticket = await db.Tickets.IgnoreQueryFilters().SingleAsync(t => t.Id == id);
        Assert.Equal("New title", ticket.Title);
        Assert.Equal("Summary of what was ordered", ticket.Description);
        Assert.Null(ticket.SessionLogUrl);
        Assert.Equal("HIGH", ticket.Priority);

        var act = db.TicketActivities.IgnoreQueryFilters().Single(a => a.TicketId == id && a.Kind == "DEV_ORDER_UPDATED");
        Assert.Contains("title", act.Message);
        Assert.Contains("sessionLogUrl", act.Message);
        Assert.Contains("priority", act.Message);
    }

    [Fact]
    public async Task Patch_EmptyTitle_Returns400()
    {
        var (ctrl, _) = Build();
        var id = Detail(await ctrl.CreateOrder(NewOrder())).Order.Id;
        Assert.IsType<BadRequestObjectResult>(await ctrl.UpdateOrder(id,
            new DevelopmentController.UpdateOrderRequest("  ", null, null, null, null, null, null, null, null)));
    }

    // ===== links =====

    [Fact]
    public async Task Links_AddAndRemove_LogActivity()
    {
        var (ctrl, db) = Build();
        var id = Detail(await ctrl.CreateOrder(NewOrder() with { Links = null })).Order.Id;

        var created = Assert.IsType<ObjectResult>(await ctrl.AddLink(id,
            new DevelopmentController.LinkRequest("pr", "ServiceManagedWeb", "PR 4348", "https://dev.azure.com/x/pr/4348", "stacked on 4347")));
        Assert.Equal(201, created.StatusCode);
        var link = Assert.IsType<DevelopmentController.LinkDto>(created.Value);
        Assert.Equal("PR", link.Kind);

        var detail = Detail(await ctrl.GetOrder(id));
        Assert.Single(detail.Order.Links);

        Assert.IsType<NoContentResult>(await ctrl.RemoveLink(id, link.Id));
        detail = Detail(await ctrl.GetOrder(id));
        Assert.Empty(detail.Order.Links);

        var kinds = db.TicketActivities.IgnoreQueryFilters().Where(a => a.TicketId == id).Select(a => a.Kind).ToList();
        Assert.Contains("DEV_LINK_ADDED", kinds);
        Assert.Contains("DEV_LINK_REMOVED", kinds);
    }

    // ===== promote =====

    [Fact]
    public async Task Promote_TurnsTicketIntoOrder_SecondCallConflicts()
    {
        var (ctrl, db) = Build();
        var plain = new Ticket { OrganizationId = OrgId, ProjectId = ProjectId, Title = "Widget idea", TicketType = "FEATURE_REQUEST", Status = "OPEN" };
        db.Tickets.Add(plain);
        await db.SaveChangesAsync();

        var detail = Detail(await ctrl.PromoteTicket(plain.Id, new DevelopmentController.PromoteRequest(null, "https://log", null)));
        Assert.Equal(DevelopmentStages.Ordered, detail.Order.Stage);
        Assert.Equal("https://log", detail.Order.SessionLogUrl);

        var again = await ctrl.PromoteTicket(plain.Id, null);
        Assert.IsType<ConflictObjectResult>(again);
    }

    // ===== isolation =====

    [Fact]
    public async Task CrossOrg_OrderIsInvisible()
    {
        var (ctrl, db) = Build();
        var foreign = new Ticket
        {
            OrganizationId = OtherOrgId, ProjectId = ProjectId + 1, Title = "Theirs",
            TicketType = "FEATURE_REQUEST", Status = "OPEN", IsDevelopmentOrder = true, DevelopmentStage = DevelopmentStages.Ordered,
        };
        db.Tickets.Add(foreign);
        await db.SaveChangesAsync();

        Assert.IsType<NotFoundObjectResult>(await ctrl.GetOrder(foreign.Id));
        Assert.IsType<NotFoundObjectResult>(await ctrl.SetStage(foreign.Id, new DevelopmentController.SetStageRequest("BETA", null)));
        Assert.IsType<NotFoundObjectResult>(await ctrl.AddLink(foreign.Id, new DevelopmentController.LinkRequest("DOC", null, "x", null, null)));

        var ok = Assert.IsType<OkObjectResult>(await ctrl.ListOrders(null, null, null, null, null));
        var list = Assert.IsType<List<DevelopmentController.OrderSummaryDto>>(ok.Value);
        Assert.DoesNotContain(list, o => o.Id == foreign.Id);
    }

    [Fact]
    public async Task Create_ProjectFromAnotherOrg_Returns400()
    {
        var (ctrl, _) = Build();
        var result = await ctrl.CreateOrder(NewOrder() with { ProjectId = ProjectId + 1 });
        Assert.IsType<BadRequestObjectResult>(result);
    }

    // ===== list / shipped =====

    [Fact]
    public async Task List_FiltersByStage_NeedsAnnouncement_AndSearch()
    {
        var (ctrl, _) = Build();
        Detail(await ctrl.CreateOrder(NewOrder("Alpha work", "PR_OPEN")));
        var prodId = Detail(await ctrl.CreateOrder(NewOrder("Beta shipped", "PRODUCTION"))).Order.Id;
        var announcedId = Detail(await ctrl.CreateOrder(NewOrder("Gamma announced", "ANNOUNCED"))).Order.Id;

        var all = List(await ctrl.ListOrders(null, null, null, null, null));
        Assert.Equal(3, all.Count);

        var prOpen = List(await ctrl.ListOrders(null, null, "pr_open", null, null));
        Assert.Single(prOpen);
        Assert.Equal("Alpha work", prOpen[0].Title);

        var needs = List(await ctrl.ListOrders(null, null, null, true, null));
        Assert.Single(needs);
        Assert.Equal(prodId, needs[0].Id);

        var notAnnounced = List(await ctrl.ListOrders(null, null, null, null, null, includeAnnounced: false));
        Assert.DoesNotContain(notAnnounced, o => o.Id == announcedId);

        var searched = List(await ctrl.ListOrders(null, null, null, null, "gamma"));
        Assert.Single(searched);

        var bySlug = List(await ctrl.ListOrders(null, "service-managed", null, null, null));
        Assert.Equal(3, bySlug.Count);
        Assert.Empty(List(await ctrl.ListOrders(null, "nope", null, null, null)));
    }

    [Fact]
    public async Task Shipped_ReturnsItemsThatReachedProductionOnThatDay()
    {
        var (ctrl, db) = Build();
        var todayId = Detail(await ctrl.CreateOrder(NewOrder("Today", "PRODUCTION"))).Order.Id;
        var oldId = Detail(await ctrl.CreateOrder(NewOrder("Last week", "PRODUCTION"))).Order.Id;
        var old = await db.Tickets.IgnoreQueryFilters().SingleAsync(t => t.Id == oldId);
        old.ProductionAt = DateTime.UtcNow.AddDays(-7);
        await db.SaveChangesAsync();

        var ok = Assert.IsType<OkObjectResult>(await ctrl.Shipped(DateTime.UtcNow.ToString("yyyy-MM-dd")));
        var json = System.Text.Json.JsonSerializer.Serialize(ok.Value);
        Assert.Contains("\"Today\"", json);
        Assert.DoesNotContain("\"Last week\"", json);
        Assert.Contains($"\"Id\":{todayId}", json);

        Assert.IsType<BadRequestObjectResult>(await ctrl.Shipped("yesterday"));
    }

    // ===== projects =====

    [Fact]
    public async Task EnsureProject_ReturnsExisting_OrCreates()
    {
        var (ctrl, db) = Build();

        var existing = Assert.IsType<OkObjectResult>(await ctrl.EnsureProject(new DevelopmentController.EnsureProjectRequest("Service Managed", null)));
        Assert.Equal(ProjectId, Assert.IsType<DevelopmentController.ProjectDto>(existing.Value).Id);

        var created = Assert.IsType<ObjectResult>(await ctrl.EnsureProject(new DevelopmentController.EnsureProjectRequest("Utilities Managed", null)));
        Assert.Equal(201, created.StatusCode);
        var dto = Assert.IsType<DevelopmentController.ProjectDto>(created.Value);
        Assert.Equal("utilities-managed", dto.Slug);
        Assert.Equal(OrgId, db.Projects.IgnoreQueryFilters().Single(p => p.Id == dto.Id).OrganizationId);

        // Slug collision with another org is a 409, not a silent cross-org match.
        var clash = await ctrl.EnsureProject(new DevelopmentController.EnsureProjectRequest("Something", "other-org-app"));
        Assert.IsType<ConflictObjectResult>(clash);
    }

    private static List<DevelopmentController.OrderSummaryDto> List(IActionResult result)
    {
        var ok = Assert.IsType<OkObjectResult>(result);
        return Assert.IsType<List<DevelopmentController.OrderSummaryDto>>(ok.Value);
    }
}
