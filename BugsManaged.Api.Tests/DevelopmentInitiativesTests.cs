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

// Initiatives (an order holding numbered phases, its stage following the
// least-advanced phase), "builds on" sequence flags, and the test checklist.
public class DevelopmentInitiativesTests
{
    private const long OrgId = 42;
    private const long ProjectId = 7;

    private sealed record Rig(DevelopmentController Orders, DevelopmentTestsController Tests, BugsManagedDbContext Db);

    private static Rig Build(string role = "PLATFORM_OWNER", string[]? serviceScopes = null, BugsManagedDbContext? shared = null)
    {
        var org = new TestDoubles.TestOrgContext { CurrentOrganizationId = OrgId };
        var db = shared ?? TestDoubles.NewInMemoryDb(org);
        TestDoubles.EnsureOrganization(db, OrgId);
        if (!db.Projects.IgnoreQueryFilters().Any(p => p.Id == ProjectId))
        {
            db.Projects.Add(new Project { Id = ProjectId, Name = "Service Managed", Slug = "service-managed", ApiKey = "k1", OrganizationId = OrgId });
            db.SaveChanges();
        }

        var activity = new TicketActivityLogger(db);
        var service = new DevelopmentOrderService(db, activity);
        var opts = Options.Create(new DevelopmentTrackerOptions { BoardBaseUrl = "https://board.test", TimeZone = "UTC" });
        var orders = new DevelopmentController(db, org, activity, new BillingService(db), new TestDoubles.NoOpAuditLogger(), opts, service);
        var tests = new DevelopmentTestsController(db, activity, service);

        var claims = new List<Claim>
        {
            new(ClaimTypes.Email, "owner@x.com"),
            new(ClaimTypes.Role, role),
            new("fullName", "Owner"),
            new("organizationId", OrgId.ToString()),
        };
        foreach (var s in serviceScopes ?? Array.Empty<string>()) claims.Add(new Claim(ServiceKeys.ScopeClaim, s));
        var http = new DefaultHttpContext { User = new ClaimsPrincipal(new ClaimsIdentity(claims, "TestAuth")) };
        orders.ControllerContext = new ControllerContext { HttpContext = http };
        tests.ControllerContext = new ControllerContext { HttpContext = http };
        return new Rig(orders, tests, db);
    }

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

    private static async Task<long> NewOrder(Rig rig, string title, string stage = "PR_OPEN",
        long? parent = null, long? dependsOn = null, string? gate = null, List<DevelopmentController.TestItemRequest>? tests = null)
    {
        var d = Detail(await rig.Orders.CreateOrder(new DevelopmentController.CreateOrderRequest(
            ProjectId, null, title, null, null, null, null, null, "Larry", stage, null, null,
            ParentOrderId: parent, DependsOnOrderId: dependsOn, DependsOnStage: gate, Tests: tests)));
        return d.Order.Id;
    }

    private static async Task<Ticket> Load(Rig rig, long id) =>
        await rig.Db.Tickets.IgnoreQueryFilters().SingleAsync(t => t.Id == id);

    private static async Task<List<DevelopmentController.OrderSummaryDto>> Board(Rig rig, string? stage = null, bool includePhases = true) =>
        Assert.IsType<List<DevelopmentController.OrderSummaryDto>>(
            Assert.IsType<OkObjectResult>(await rig.Orders.ListOrders(null, null, stage, null, null, true, includePhases)).Value);

    // ===== grouping =====

    [Fact]
    public async Task Group_NewInitiative_NumbersPhasesChainsThemAndFollowsLowestStage()
    {
        var rig = Build();
        var a = await NewOrder(rig, "Estimates + change orders", "PR_OPEN");
        var b = await NewOrder(rig, "Easy change orders", "PR_OPEN");
        var c = await NewOrder(rig, "AI quoting", "LOCAL_DEMO");

        var d = Detail(await rig.Orders.Group(new DevelopmentController.GroupRequest(
            new List<long> { a, b, c }, "Estimates, change orders + AI quoting", "one effort", null, null, null)));

        Assert.True(d.Order.IsInitiative);
        Assert.Equal(DevelopmentStages.LocalDemo, d.Order.Stage);
        Assert.Equal(new long[] { a, b, c }, d.Order.Phases!.Select(p => p.Id));
        Assert.Equal(new int?[] { 1, 2, 3 }, d.Order.Phases!.Select(p => p.PhaseNumber));
        Assert.Equal(new long?[] { null, a, b }, d.Order.Phases!.Select(p => p.DependsOnOrderId));
        Assert.False(d.Order.NeedsAnnouncement);

        var phaseB = await Load(rig, b);
        Assert.Equal(d.Order.Id, phaseB.ParentOrderId);
        Assert.Equal(2, phaseB.PhaseNumber);
        Assert.Equal(a, phaseB.DependsOnOrderId);
        Assert.Null(phaseB.DependsOnStage); // default gate: merged to dev
    }

    [Fact]
    public async Task Group_IntoExistingInitiative_AppendsAndBuildsOnItsLastPhase()
    {
        var rig = Build();
        var a = await NewOrder(rig, "Phase A");
        var init = Detail(await rig.Orders.Group(new DevelopmentController.GroupRequest(new List<long> { a }, "Initiative", null, null, null, null))).Order.Id;
        var b = await NewOrder(rig, "Phase B");

        var d = Detail(await rig.Orders.Group(new DevelopmentController.GroupRequest(new List<long> { b }, null, null, null, null, init)));

        Assert.Equal(new long[] { a, b }, d.Order.Phases!.Select(p => p.Id));
        Assert.Equal(a, (await Load(rig, b)).DependsOnOrderId);
    }

    [Fact]
    public async Task Group_RejectsAnInitiativeAsAPhase()
    {
        var rig = Build();
        var a = await NewOrder(rig, "A");
        var init = Detail(await rig.Orders.Group(new DevelopmentController.GroupRequest(new List<long> { a }, "Init", null, null, null, null))).Order.Id;

        var result = await rig.Orders.Group(new DevelopmentController.GroupRequest(new List<long> { init }, "Outer", null, null, null, null));
        Assert.IsType<BadRequestObjectResult>(result);
    }

    // ===== stage roll-up =====

    [Fact]
    public async Task PhaseStageMove_RollsUpTheInitiative_AndInitiativeCannotBeMovedByHand()
    {
        var rig = Build();
        var a = await NewOrder(rig, "A", "PR_OPEN");
        var b = await NewOrder(rig, "B", "PR_OPEN");
        var init = Detail(await rig.Orders.Group(new DevelopmentController.GroupRequest(new List<long> { a, b }, "Init", null, null, null, null))).Order.Id;

        Detail(await rig.Orders.SetStage(a, new DevelopmentController.SetStageRequest("MERGED_DEV", null)));
        Assert.Equal(DevelopmentStages.PrOpen, (await Load(rig, init)).DevelopmentStage);

        Detail(await rig.Orders.SetStage(b, new DevelopmentController.SetStageRequest("BETA", null)));
        Assert.Equal(DevelopmentStages.MergedDev, (await Load(rig, init)).DevelopmentStage);

        var manual = await rig.Orders.SetStage(init, new DevelopmentController.SetStageRequest("PRODUCTION", null));
        Assert.IsType<ConflictObjectResult>(manual);
    }

    [Fact]
    public async Task InitiativeInProduction_IsNotInTheShippedList()
    {
        var rig = Build();
        var a = await NewOrder(rig, "A", "BETA");
        var init = Detail(await rig.Orders.Group(new DevelopmentController.GroupRequest(new List<long> { a }, "Init", null, null, null, null))).Order.Id;
        Detail(await rig.Orders.SetStage(a, new DevelopmentController.SetStageRequest("PRODUCTION", null)));

        Assert.Equal(DevelopmentStages.Production, (await Load(rig, init)).DevelopmentStage);
        var shipped = Assert.IsType<OkObjectResult>(await rig.Orders.Shipped(null)).Value!;
        var items = (List<DevelopmentController.OrderSummaryDto>)shipped.GetType().GetProperty("items")!.GetValue(shipped)!;
        Assert.Contains(items, i => i.Id == a);
        Assert.DoesNotContain(items, i => i.Id == init);
    }

    // ===== sequence ("which one is ahead") =====

    [Fact]
    public async Task Sequence_FlagsWaitingReadyAndAhead()
    {
        var rig = Build();
        var baseId = await NewOrder(rig, "Base", "PR_OPEN");
        var next = await NewOrder(rig, "Stacked", "PR_OPEN", dependsOn: baseId);

        var d = Detail(await rig.Orders.GetOrder(next));
        Assert.Equal(DevelopmentSequence.Waiting, d.Order.Sequence!.State);
        Assert.Equal(baseId, d.Order.Sequence.BaseOrderId);

        Detail(await rig.Orders.SetStage(next, new DevelopmentController.SetStageRequest("MERGED_DEV", null)));
        d = Detail(await rig.Orders.GetOrder(next));
        Assert.Equal(DevelopmentSequence.Ahead, d.Order.Sequence!.State);
        Assert.Contains($"#{baseId}", d.Order.Sequence.Message);

        Detail(await rig.Orders.SetStage(baseId, new DevelopmentController.SetStageRequest("MERGED_DEV", null)));
        d = Detail(await rig.Orders.GetOrder(next));
        Assert.Equal(DevelopmentSequence.Done, d.Order.Sequence!.State);
    }

    [Fact]
    public async Task Sequence_GateProduction_WaitsForTheBaseToGoLive()
    {
        var rig = Build();
        var api = await NewOrder(rig, "API", "BETA");
        var mobile = await NewOrder(rig, "Mobile", "PR_OPEN", dependsOn: api, gate: "PRODUCTION");

        var d = Detail(await rig.Orders.GetOrder(mobile));
        Assert.Equal(DevelopmentSequence.Waiting, d.Order.Sequence!.State);
        Assert.Equal(DevelopmentStages.Production, d.Order.Sequence.Gate);

        Detail(await rig.Orders.SetStage(api, new DevelopmentController.SetStageRequest("PRODUCTION", null)));
        d = Detail(await rig.Orders.GetOrder(mobile));
        Assert.Equal(DevelopmentSequence.Ready, d.Order.Sequence!.State);
    }

    [Fact]
    public async Task Placement_RejectsALoopAndReordersPhases()
    {
        var rig = Build();
        var a = await NewOrder(rig, "A");
        var b = await NewOrder(rig, "B", dependsOn: a);
        var loop = await rig.Orders.SetPlacement(a, new DevelopmentController.PlacementRequest(null, null, b, null));
        Assert.IsType<BadRequestObjectResult>(loop);

        var c = await NewOrder(rig, "C");
        var init = Detail(await rig.Orders.Group(new DevelopmentController.GroupRequest(new List<long> { a, b, c }, "Init", null, null, null, null, Chain: false))).Order.Id;

        // Move C to the front.
        Detail(await rig.Orders.SetPlacement(c, new DevelopmentController.PlacementRequest(init, 1, null, null)));
        var phases = Detail(await rig.Orders.GetOrder(init)).Order.Phases!;
        Assert.Equal(new long[] { c, a, b }, phases.Select(p => p.Id));
        Assert.Equal(new int?[] { 1, 2, 3 }, phases.Select(p => p.PhaseNumber));

        // Take A out: the rest renumber.
        Detail(await rig.Orders.SetPlacement(a, new DevelopmentController.PlacementRequest(null, null, null, null)));
        phases = Detail(await rig.Orders.GetOrder(init)).Order.Phases!;
        Assert.Equal(new long[] { c, b }, phases.Select(p => p.Id));
        Assert.Equal(new int?[] { 1, 2 }, phases.Select(p => p.PhaseNumber));
        Assert.Null((await Load(rig, a)).PhaseNumber);
    }

    [Fact]
    public async Task Board_IncludesHiddenPhasesOfAListedInitiative()
    {
        var rig = Build();
        var shipped = await NewOrder(rig, "Shipped phase", "BETA");
        var active = await NewOrder(rig, "Active phase", "PR_OPEN");
        var init = Detail(await rig.Orders.Group(new DevelopmentController.GroupRequest(new List<long> { shipped, active }, "Init", null, null, null, null))).Order.Id;

        var withPhases = await Board(rig, stage: "ORDERED,IN_PROGRESS,LOCAL_DEMO,PR_OPEN,MERGED_DEV");
        Assert.Contains(withPhases, o => o.Id == init);
        Assert.Contains(withPhases, o => o.Id == shipped && o.ParentOrderId == init && o.PhaseNumber == 1 && o.PhaseCount == 2);

        var plain = await Board(rig, stage: "ORDERED,IN_PROGRESS,LOCAL_DEMO,PR_OPEN,MERGED_DEV", includePhases: false);
        Assert.DoesNotContain(plain, o => o.Id == shipped);
    }

    [Fact]
    public async Task CreateOrder_IntoAnInitiative_LandsAsTheNextPhase()
    {
        var rig = Build();
        var a = await NewOrder(rig, "A");
        var init = Detail(await rig.Orders.Group(new DevelopmentController.GroupRequest(new List<long> { a }, "Init", null, null, null, null))).Order.Id;

        var b = await NewOrder(rig, "B from the next video", "ORDERED", parent: init, dependsOn: a);

        var phaseB = await Load(rig, b);
        Assert.Equal(init, phaseB.ParentOrderId);
        Assert.Equal(2, phaseB.PhaseNumber);
        Assert.Equal(DevelopmentStages.Ordered, (await Load(rig, init)).DevelopmentStage);
    }

    // ===== test checklist =====

    [Fact]
    public async Task TestChecklist_CreateWithOrder_RecordResults_NewRound()
    {
        var rig = Build();
        var id = await NewOrder(rig, "Easy change orders", "LOCAL_DEMO", tests: new List<DevelopmentController.TestItemRequest>
        {
            new("Open WO 90001 and approve the quote", "An overrun watch appears", "LOCAL"),
            new("Click Create Change Order", "A draft CO with the overrun lines", null),
        });

        var d = Detail(await rig.Orders.GetOrder(id));
        Assert.Equal(2, d.Tests!.Count);
        Assert.Equal(DevelopmentTests.Local, d.Tests[0].Environment);
        Assert.Equal(DevelopmentTests.Any, d.Tests[1].Environment);
        Assert.Equal(new DevelopmentController.TestSummaryDto(2, 0, 0, 2), d.Order.Tests);

        Assert.IsType<OkObjectResult>(await rig.Tests.Record(id, d.Tests[0].Id, new DevelopmentTestsController.ResultRequest("pass", null, null)));
        Assert.IsType<OkObjectResult>(await rig.Tests.Record(id, d.Tests[1].Id, new DevelopmentTestsController.ResultRequest("FAIL", "CO had no lines", null)));

        d = Detail(await rig.Orders.GetOrder(id));
        Assert.Equal(new DevelopmentController.TestSummaryDto(2, 1, 1, 0), d.Order.Tests);
        Assert.Equal(DevelopmentTests.Local, d.Tests![1].TestedIn); // from the stage: local demo
        Assert.Equal("CO had no lines", d.Tests[1].ResultNote);
        Assert.Contains(rig.Db.TicketActivities.IgnoreQueryFilters(), a => a.TicketId == id && a.Kind == "DEV_TEST_FAILED");

        Assert.IsType<OkObjectResult>(await rig.Tests.NewRound(id, new DevelopmentTestsController.NewRoundRequest("beta")));
        d = Detail(await rig.Orders.GetOrder(id));
        Assert.Equal(new DevelopmentController.TestSummaryDto(2, 0, 0, 2), d.Order.Tests);
        Assert.Contains(rig.Db.TicketActivities.IgnoreQueryFilters(), a => a.TicketId == id && a.Kind == "DEV_TESTS_NEW_ROUND");
    }

    [Fact]
    public async Task TestChecklist_ViewerCanRecordButNotEdit_ReadOnlyKeyCannotRecord()
    {
        var owner = Build();
        var id = await NewOrder(owner, "X", tests: new List<DevelopmentController.TestItemRequest> { new("Try it") });
        var itemId = Detail(await owner.Orders.GetOrder(id)).Tests![0].Id;

        var viewer = Build(role: "VIEWER", shared: owner.Db);
        Assert.IsType<OkObjectResult>(await viewer.Tests.Record(id, itemId, new DevelopmentTestsController.ResultRequest("PASS", null, "BETA")));
        Assert.Equal(403, Assert.IsType<ObjectResult>(await viewer.Tests.Add(id,
            new DevelopmentTestsController.AddTestsRequest(new List<DevelopmentController.TestItemRequest> { new("More") }))).StatusCode);

        var readKey = Build(role: ServiceKeys.Role, serviceScopes: new[] { "development:read" }, shared: owner.Db);
        Assert.Equal(403, Assert.IsType<ObjectResult>(await readKey.Tests.Record(id, itemId, new DevelopmentTestsController.ResultRequest("FAIL", null, null))).StatusCode);
    }

    [Fact]
    public async Task TestChecklist_InitiativeCountsAndShowsEveryPhase()
    {
        var rig = Build();
        var a = await NewOrder(rig, "A", tests: new List<DevelopmentController.TestItemRequest> { new("a1"), new("a2") });
        var b = await NewOrder(rig, "B", tests: new List<DevelopmentController.TestItemRequest> { new("b1") });
        var init = Detail(await rig.Orders.Group(new DevelopmentController.GroupRequest(new List<long> { a, b }, "Init", null, null, null, null))).Order.Id;

        var d = Detail(await rig.Orders.GetOrder(init));
        Assert.Equal(3, d.Order.Tests!.Total);
        Assert.Equal(new long[] { a, b }, d.PhaseTests!.Select(p => p.OrderId));
        Assert.Equal(2, d.PhaseTests![0].Items.Count);
    }

    [Fact]
    public async Task TestChecklist_ReplaceRewritesTheList()
    {
        var rig = Build();
        var id = await NewOrder(rig, "X", tests: new List<DevelopmentController.TestItemRequest> { new("old 1"), new("old 2") });

        var result = Assert.IsType<OkObjectResult>(await rig.Tests.Add(id, new DevelopmentTestsController.AddTestsRequest(
            new List<DevelopmentController.TestItemRequest> { new("new 1", "it works", "beta") }, Replace: true)));
        var items = Assert.IsType<List<DevelopmentController.TestItemDto>>(result.Value);
        Assert.Single(items);
        Assert.Equal("new 1", items[0].Text);
        Assert.Equal(DevelopmentTests.Beta, items[0].Environment);
    }
}
