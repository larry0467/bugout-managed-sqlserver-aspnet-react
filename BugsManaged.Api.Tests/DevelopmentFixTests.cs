using System.Security.Claims;
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

// The drafted-fix queue: bugs on auto-draft apps are queued on arrival, the
// devbox worker claims and reports, a human approves or rejects, and a
// ready fix becomes a development order at PR_OPEN.
public class DevelopmentFixTests
{
    private const long OrgId = 42;
    private const long ProjectId = 7;

    private static (DevelopmentFixController ctrl, BugsManagedDbContext db, TestDoubles.TestOrgContext org) Build(
        string role = "PLATFORM_OWNER", string email = "owner@x.com", string name = "Owner", string[]? serviceScopes = null)
    {
        var org = new TestDoubles.TestOrgContext { CurrentOrganizationId = OrgId, CurrentProjectId = ProjectId };
        var db = TestDoubles.NewInMemoryDb(org);
        TestDoubles.EnsureOrganization(db, OrgId);
        db.Projects.Add(new Project { Id = ProjectId, Name = "Service Managed", Slug = "service-managed", ApiKey = "k1", OrganizationId = OrgId, AutoDraftFixes = true });
        db.Projects.Add(new Project { Id = ProjectId + 1, Name = "Forsor", Slug = "forsor", ApiKey = "k2", OrganizationId = OrgId, AutoDraftFixes = false });
        db.SaveChanges();

        var activity = new TicketActivityLogger(db);
        var ctrl = new DevelopmentFixController(
            db, org, activity, new DevelopmentOrderService(db, activity),
            new TicketNoteService(db, new HttpClient(), NullLogger<TicketNoteService>.Instance),
            new TestDoubles.NoOpVideoBlobService(), new TestDoubles.NoOpScreenshotBlobService(), new TestDoubles.NoOpAuditLogger(),
            Options.Create(new DevelopmentTrackerOptions { BoardBaseUrl = "https://board.test", TimeZone = "UTC" }),
            NullLogger<DevelopmentFixController>.Instance);
        ctrl.ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext { User = Principal(role, email, name, serviceScopes) } };
        return (ctrl, db, org);
    }

    private static ClaimsPrincipal Principal(string role, string email, string name, string[]? scopes)
    {
        var claims = new List<Claim> { new(ClaimTypes.Email, email), new(ClaimTypes.Role, role), new("fullName", name), new("organizationId", OrgId.ToString()) };
        foreach (var s in scopes ?? Array.Empty<string>()) claims.Add(new Claim(ServiceKeys.ScopeClaim, s));
        return new ClaimsPrincipal(new ClaimsIdentity(claims, "TestAuth"));
    }

    private static void AsWorker(DevelopmentFixController ctrl) =>
        ctrl.ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext { User = Principal(ServiceKeys.Role, "service-key:3", "Claude Code - devbox", new[] { ServiceKeys.ScopeDevelopmentWrite }) } };

    private static Ticket SeedBug(BugsManagedDbContext db, string title = "Dispatch board flickers", string? fixStatus = FixStatuses.Requested, long projectId = ProjectId)
    {
        var t = new Ticket
        {
            OrganizationId = OrgId, ProjectId = projectId, Title = title, TicketType = "BUG", Status = "OPEN", Priority = "HIGH",
            SubmittedBy = "tech@customer.com", Transcript = "it flickers when I drag a job", ConsoleErrors = "TypeError: x is undefined",
            VideoUrl = "https://acct.blob.core.windows.net/videos/ticket_1.webm",
            FixStatus = fixStatus, FixRequestedAt = fixStatus != null ? DateTime.UtcNow.AddMinutes(-5) : null,
        };
        db.Tickets.Add(t);
        db.SaveChanges();
        return t;
    }

    private static DevelopmentFixController.FixQueueItemDto Item(IActionResult r) =>
        Assert.IsType<DevelopmentFixController.FixQueueItemDto>(Assert.IsType<OkObjectResult>(r).Value);

    // ===== arrival =====

    [Fact]
    public async Task WidgetBug_OnAutoDraftApp_IsQueued_FeatureRequestIsNot()
    {
        var org = new TestDoubles.TestOrgContext { CurrentOrganizationId = OrgId, CurrentProjectId = ProjectId };
        var db = TestDoubles.NewInMemoryDb(org);
        db.Projects.Add(new Project { Id = ProjectId, Name = "Service Managed", Slug = "service-managed", ApiKey = "k1", OrganizationId = OrgId, AutoDraftFixes = true });
        db.SaveChanges();
        var tickets = TestDoubles.CreateTicketController(db, org);

        var bug = Assert.IsType<Ticket>(Assert.IsType<CreatedAtActionResult>(await tickets.Create(new Ticket { Title = "crash", TicketType = "BUG", SubmittedBy = "a@b.c" })).Value);
        var feature = Assert.IsType<Ticket>(Assert.IsType<CreatedAtActionResult>(await tickets.Create(new Ticket { Title = "idea", TicketType = "FEATURE_REQUEST", SubmittedBy = "a@b.c" })).Value);

        Assert.Equal(FixStatuses.Requested, bug.FixStatus);
        Assert.NotNull(bug.FixRequestedAt);
        Assert.Null(feature.FixStatus);
    }

    [Fact]
    public async Task WidgetBug_OnAppWithoutAutoDraft_IsNotQueued()
    {
        var org = new TestDoubles.TestOrgContext { CurrentOrganizationId = OrgId, CurrentProjectId = ProjectId };
        var db = TestDoubles.NewInMemoryDb(org);
        db.Projects.Add(new Project { Id = ProjectId, Name = "Forsor", Slug = "forsor", ApiKey = "k1", OrganizationId = OrgId, AutoDraftFixes = false });
        db.SaveChanges();
        var tickets = TestDoubles.CreateTicketController(db, org);

        var bug = Assert.IsType<Ticket>(Assert.IsType<CreatedAtActionResult>(await tickets.Create(new Ticket { Title = "crash", TicketType = "BUG" })).Value);
        Assert.Null(bug.FixStatus);
    }

    // ===== queue / claim / release =====

    [Fact]
    public async Task Queue_ListsRequestedOnly_WithBlobSasAndContext_ClaimAndRelease()
    {
        var (ctrl, db, _) = Build();
        AsWorker(ctrl);
        var queued = SeedBug(db);
        SeedBug(db, "already claimed", FixStatuses.Claimed);
        SeedBug(db, "plain bug", null);

        var list = Assert.IsType<List<DevelopmentFixController.FixQueueItemDto>>(Assert.IsType<OkObjectResult>(await ctrl.Queue(null, null, 20)).Value);
        Assert.Single(list);
        var item = list[0];
        Assert.Equal(queued.Id, item.TicketId);
        Assert.Equal("service-managed", item.ProjectSlug);
        Assert.Equal("it flickers when I drag a job", item.Transcript);
        Assert.EndsWith("?sas=1", item.VideoUrl);
        Assert.Equal("Fix requested", item.FixStatusLabel);
        Assert.Equal($"https://board.test/development/{queued.Id}", item.BoardUrl);

        var claimed = Item(await ctrl.Claim(queued.Id, new DevelopmentFixController.ClaimRequest("devbox f56db69b")));
        Assert.Equal(FixStatuses.Claimed, claimed.FixStatus);
        Assert.Equal("devbox f56db69b", claimed.FixClaimedBy);
        Assert.IsType<ConflictObjectResult>(await ctrl.Claim(queued.Id, null));
        Assert.Empty(Assert.IsType<List<DevelopmentFixController.FixQueueItemDto>>(Assert.IsType<OkObjectResult>(await ctrl.Queue("service-managed", null, 20)).Value));

        var released = Item(await ctrl.Release(queued.Id));
        Assert.Equal(FixStatuses.Requested, released.FixStatus);
        Assert.Null(released.FixClaimedBy);
        Assert.Contains(db.TicketActivities.IgnoreQueryFilters().Where(a => a.TicketId == queued.Id).Select(a => a.Kind), k => k == "FIX_CLAIMED");
    }

    // ===== result =====

    [Fact]
    public async Task Result_ReadyToTest_MakesTheBugADevelopmentOrderWithLinksAndNote()
    {
        var (ctrl, db, _) = Build();
        AsWorker(ctrl);
        var bug = SeedBug(db, fixStatus: FixStatuses.Claimed);

        var result = Item(await ctrl.Result(bug.Id, new DevelopmentFixController.FixResultRequest(
            "ready_to_test",
            "Root cause: the drag handler re-rendered the board on every pointer move. Debounced it.",
            new List<DevelopmentController.LinkRequest>
            {
                new("BRANCH", "ServiceManagedWeb", "BugOut_Fix_" + bug.Id, null, null),
                new("PR", "ServiceManagedWeb", "PR 4410", "https://dev.azure.com/protocall/WebbasedLLC/_git/ServiceManagedWeb/pullrequest/4410", null),
            },
            "Drag a job on the dispatch board: no flicker, job lands in the new slot.")));

        Assert.Equal(FixStatuses.ReadyToTest, result.FixStatus);
        Assert.True(result.IsDevelopmentOrder);
        Assert.Equal(DevelopmentStages.PrOpen, result.DevelopmentStage);
        Assert.Equal(2, result.Links.Count);
        Assert.Contains("Drag a job", result.TestingNotes);

        var t = await db.Tickets.IgnoreQueryFilters().SingleAsync(x => x.Id == bug.Id);
        Assert.Equal("BUG", t.TicketType);
        Assert.Equal("IN_REVIEW", t.Status);
        Assert.NotNull(t.FixCompletedAt);
        Assert.Contains("Debounced", t.FixSummary);
        Assert.Single(db.TicketStageHistory.IgnoreQueryFilters().Where(h => h.TicketId == bug.Id && h.ToStage == DevelopmentStages.PrOpen));
        var kinds = db.TicketActivities.IgnoreQueryFilters().Where(a => a.TicketId == bug.Id).Select(a => a.Kind).ToList();
        Assert.Contains("FIX_READY", kinds);
        Assert.Contains("DEV_ORDER_CREATED", kinds);
        var note = db.TicketNotes.IgnoreQueryFilters().Single(n => n.TicketId == bug.Id);
        Assert.Contains("PR 4410", note.Content);
        Assert.Contains($"/development/{bug.Id}", note.Content);
        Assert.Equal("INTERNAL", note.NoteType);

        // Redelivered result: links are not duplicated.
        var again = await ctrl.Result(bug.Id, new DevelopmentFixController.FixResultRequest("READY_TO_TEST", "x", null, null));
        Assert.IsType<ConflictObjectResult>(again);
        Assert.Equal(2, db.TicketDevelopmentLinks.IgnoreQueryFilters().Count(l => l.TicketId == bug.Id));
    }

    [Fact]
    public async Task Result_Failed_LeavesTicketOffTheBoard()
    {
        var (ctrl, db, _) = Build();
        AsWorker(ctrl);
        var bug = SeedBug(db, fixStatus: FixStatuses.Claimed);

        var result = Item(await ctrl.Result(bug.Id, new DevelopmentFixController.FixResultRequest("FAILED", "Could not reproduce; the page URL points at a tenant the devbox has no data for.", null, null)));

        Assert.Equal(FixStatuses.Failed, result.FixStatus);
        Assert.False(result.IsDevelopmentOrder);
        Assert.Contains("FIX_FAILED", db.TicketActivities.IgnoreQueryFilters().Where(a => a.TicketId == bug.Id).Select(a => a.Kind));
    }

    [Fact]
    public async Task Result_BadOutcomeOrLink_Returns400()
    {
        var (ctrl, db, _) = Build();
        AsWorker(ctrl);
        var bug = SeedBug(db, fixStatus: FixStatuses.Claimed);
        Assert.IsType<BadRequestObjectResult>(await ctrl.Result(bug.Id, new DevelopmentFixController.FixResultRequest("DONE", null, null, null)));
        Assert.IsType<BadRequestObjectResult>(await ctrl.Result(bug.Id, new DevelopmentFixController.FixResultRequest("READY_TO_TEST", null,
            new List<DevelopmentController.LinkRequest> { new("TWEET", null, "x", null, null) }, null)));
    }

    // ===== human decisions =====

    [Fact]
    public async Task Approve_AndReject_AreHumanOnly()
    {
        var (ctrl, db, _) = Build();
        var bug = SeedBug(db, fixStatus: FixStatuses.ReadyToTest);

        // A key cannot approve.
        AsWorker(ctrl);
        Assert.Equal(403, Assert.IsType<ObjectResult>(await ctrl.Approve(bug.Id)).StatusCode);
        Assert.Equal(403, Assert.IsType<ObjectResult>(await ctrl.Reject(bug.Id, new DevelopmentFixController.RejectRequest("no", false))).StatusCode);

        // A DEVELOPER cannot either.
        ctrl.ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext { User = Principal("DEVELOPER", "dev@x.com", "Dev", null) } };
        Assert.Equal(403, Assert.IsType<ObjectResult>(await ctrl.Approve(bug.Id)).StatusCode);

        // The owner approves.
        ctrl.ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext { User = Principal("PLATFORM_OWNER", "owner@x.com", "Owner", null) } };
        var approved = Item(await ctrl.Approve(bug.Id));
        Assert.Equal(FixStatuses.Approved, approved.FixStatus);
        Assert.Contains("FIX_APPROVED", db.TicketActivities.IgnoreQueryFilters().Where(a => a.TicketId == bug.Id).Select(a => a.Kind));

        // Rejecting an approved fix with requeue sends it back with feedback.
        var rejected = Item(await ctrl.Reject(bug.Id, new DevelopmentFixController.RejectRequest("It fixed the flicker but broke keyboard drag", true)));
        Assert.Equal(FixStatuses.Requested, rejected.FixStatus);
        Assert.Equal("It fixed the flicker but broke keyboard drag", rejected.FixFeedback);
        Assert.Null(rejected.FixClaimedBy);
    }

    [Fact]
    public async Task Reject_WithoutRequeue_StaysRejected()
    {
        var (ctrl, db, _) = Build(role: "SUPER_ADMIN");
        var bug = SeedBug(db, fixStatus: FixStatuses.ReadyToTest);
        var rejected = Item(await ctrl.Reject(bug.Id, new DevelopmentFixController.RejectRequest("not needed", false)));
        Assert.Equal(FixStatuses.Rejected, rejected.FixStatus);
    }

    [Fact]
    public async Task RequestFix_ByHand_QueuesAnyTicket_ButNotWhileClaimed()
    {
        var (ctrl, db, _) = Build(role: "DEVELOPER", email: "dev@x.com", name: "Dev");
        var feature = new Ticket { OrganizationId = OrgId, ProjectId = ProjectId + 1, Title = "Add tags", TicketType = "FEATURE_REQUEST", Status = "OPEN" };
        db.Tickets.Add(feature);
        db.SaveChanges();

        var queued = Item(await ctrl.RequestFix(feature.Id, new DevelopmentFixController.RequestFixRequest("keep it to the listing page")));
        Assert.Equal(FixStatuses.Requested, queued.FixStatus);
        Assert.Equal("keep it to the listing page", queued.FixFeedback);

        var claimed = SeedBug(db, "busy", FixStatuses.Claimed);
        Assert.IsType<ConflictObjectResult>(await ctrl.RequestFix(claimed.Id, null));
    }

    // ===== per-app switch =====

    [Fact]
    public async Task AutoDraftSwitch_IsHumanAdminOnly_AndAppsListShowsCounts()
    {
        var (ctrl, db, _) = Build();
        SeedBug(db, "a", FixStatuses.Requested);
        SeedBug(db, "b", FixStatuses.ReadyToTest);

        var apps = Assert.IsType<List<DevelopmentFixController.AppFixSettingDto>>(Assert.IsType<OkObjectResult>(await ctrl.Apps()).Value).OrderBy(a => a.Id).ToList();
        Assert.True(apps[0].AutoDraftFixes);
        Assert.Equal(1, apps[0].Requested);
        Assert.Equal(1, apps[0].ReadyToTest);
        Assert.False(apps[1].AutoDraftFixes);

        AsWorker(ctrl);
        Assert.Equal(403, Assert.IsType<ObjectResult>(await ctrl.SetAutoDraft(ProjectId + 1, new DevelopmentFixController.AutoDraftRequest(true))).StatusCode);

        ctrl.ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext { User = Principal("SUPER_ADMIN", "admin@x.com", "Admin", null) } };
        var toggled = Assert.IsType<DevelopmentFixController.AppFixSettingDto>(Assert.IsType<OkObjectResult>(await ctrl.SetAutoDraft(ProjectId + 1, new DevelopmentFixController.AutoDraftRequest(true))).Value);
        Assert.True(toggled.AutoDraftFixes);
        Assert.True((await db.Projects.IgnoreQueryFilters().SingleAsync(p => p.Id == ProjectId + 1)).AutoDraftFixes);
    }
}
