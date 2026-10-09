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

// The whole team on the board: triage hands a ticket to a developer, their own
// Claude Code session (or dispatcher) finds it in the queue, and the PR they
// open puts THAT ticket on the board instead of a duplicate order.
public class TeamDevelopmentTests
{
    private const long OrgId = 42;
    private const long ProjectId = 7;
    private const string DevEmail = "dilpreet@protocall.co";

    private static (DevelopmentFixController ctrl, BugsManagedDbContext db, TestDoubles.RecordingNotificationService notify) Build(string role = "PLATFORM_OWNER")
    {
        var org = new TestDoubles.TestOrgContext { CurrentOrganizationId = OrgId, CurrentProjectId = ProjectId };
        var db = TestDoubles.NewInMemoryDb(org);
        TestDoubles.EnsureOrganization(db, OrgId);
        db.Projects.Add(new Project { Id = ProjectId, Name = "Service Managed", Slug = "service-managed", ApiKey = "k1", OrganizationId = OrgId });
        db.Users.Add(new User { OrganizationId = OrgId, Email = DevEmail, FullName = "Dilpreet Singh", Role = "DEVELOPER", Password = "x" });
        db.Users.Add(new User { OrganizationId = OrgId, Email = "viewer@protocall.co", FullName = "Read Only", Role = "VIEWER", Password = "x" });
        db.SaveChanges();

        var notify = new TestDoubles.RecordingNotificationService();
        var activity = new TicketActivityLogger(db);
        var ctrl = new DevelopmentFixController(
            db, org, activity, new DevelopmentOrderService(db, activity),
            new TicketNoteService(db, new HttpClient(), NullLogger<TicketNoteService>.Instance),
            new TestDoubles.NoOpVideoBlobService(), new TestDoubles.NoOpScreenshotBlobService(), new TestDoubles.NoOpAuditLogger(),
            Options.Create(new DevelopmentTrackerOptions { BoardBaseUrl = "https://bugout.managedplatform.com", TimeZone = "UTC" }),
            NullLogger<DevelopmentFixController>.Instance,
            new TestDoubles.FakeVideosManagedClient(), notify);
        var claims = new List<Claim> { new(ClaimTypes.Email, "larry@protocall.co"), new(ClaimTypes.Role, role), new("fullName", "Larry"), new("organizationId", OrgId.ToString()) };
        ctrl.ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext { User = new ClaimsPrincipal(new ClaimsIdentity(claims, "TestAuth")) } };
        return (ctrl, db, notify);
    }

    private static Ticket SeedBug(BugsManagedDbContext db, string title = "Dispatch board flickers")
    {
        var t = new Ticket
        {
            OrganizationId = OrgId, ProjectId = ProjectId, Title = title, TicketType = "BUG", Status = "OPEN", Priority = "HIGH",
            SubmittedBy = "tech@customer.com", EscalationStage = "PLATFORM_OWNER_REVIEW", CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow,
        };
        db.Tickets.Add(t);
        db.SaveChanges();
        return t;
    }

    private static DevelopmentFixController.FixQueueItemDto Item(IActionResult r) =>
        Assert.IsType<DevelopmentFixController.FixQueueItemDto>(Assert.IsType<OkObjectResult>(r).Value);

    private static List<DevelopmentFixController.FixQueueItemDto> Items(IActionResult r) =>
        Assert.IsType<List<DevelopmentFixController.FixQueueItemDto>>(Assert.IsType<OkObjectResult>(r).Value);

    // ===== triage hands it to a developer =====

    [Fact]
    public async Task Develop_with_a_developer_assigns_it_queues_it_and_tells_them()
    {
        var (ctrl, db, _) = Build();
        var bug = SeedBug(db);

        var item = Item(await ctrl.Triage(bug.Id, new DevelopmentFixController.TriageRequest("DEVELOP", "Only the drag handler", null, " Dilpreet@ProToCall.co ")));

        Assert.Equal(FixStatuses.Requested, item.FixStatus);
        Assert.Equal(DevEmail, item.AssignedTo);
        Assert.Equal("HUMAN", item.AssigneeType);
        var t = await db.Tickets.IgnoreQueryFilters().SingleAsync(x => x.Id == bug.Id);
        Assert.Equal("ASSIGNED_HUMAN", t.EscalationStage);
        Assert.Equal("larry@protocall.co", t.AssignedBy);
        Assert.Contains(db.TicketStageHistory.IgnoreQueryFilters().Where(h => h.TicketId == bug.Id), h => h.ToStage == "ASSIGNED_HUMAN" && h.FromStage == "PLATFORM_OWNER_REVIEW");
        Assert.Contains(db.TicketActivities.IgnoreQueryFilters().Where(a => a.TicketId == bug.Id), a => a.Kind == "TRIAGE_DEVELOP" && a.Message.Contains("Dilpreet Singh"));
    }

    [Fact]
    public async Task Develop_with_someone_who_is_not_a_developer_is_refused_and_changes_nothing()
    {
        var (ctrl, db, _) = Build();
        var bug = SeedBug(db);

        Assert.IsType<BadRequestObjectResult>(await ctrl.Triage(bug.Id, new DevelopmentFixController.TriageRequest("DEVELOP", null, null, "viewer@protocall.co")));
        Assert.IsType<BadRequestObjectResult>(await ctrl.Triage(bug.Id, new DevelopmentFixController.TriageRequest("DEVELOP", null, null, "nobody@example.com")));

        var t = await db.Tickets.IgnoreQueryFilters().SingleAsync(x => x.Id == bug.Id);
        Assert.Null(t.FixStatus);
        Assert.Null(t.AssignedTo);
        Assert.Null(t.TriageDecision);
    }

    [Fact]
    public async Task Develop_with_devbox_hands_a_person_assigned_ticket_back_to_the_devbox()
    {
        var (ctrl, db, _) = Build();
        var bug = SeedBug(db);
        await ctrl.Triage(bug.Id, new DevelopmentFixController.TriageRequest("DEVELOP", null, null, DevEmail));
        // Back to the queue so it can be triaged again.
        await ctrl.Release(bug.Id); // 409 (not claimed) is fine; the next triage re-queues anyway

        var item = Item(await ctrl.Triage(bug.Id, new DevelopmentFixController.TriageRequest("DEVELOP", null, null, "devbox")));

        Assert.Null(item.AssignedTo);
        Assert.Null(item.AssigneeType);
        Assert.Equal(FixStatuses.Requested, item.FixStatus);
    }

    [Fact]
    public async Task Develop_without_assign_to_leaves_the_assignment_alone()
    {
        var (ctrl, db, _) = Build();
        var bug = SeedBug(db);
        bug.AssignedTo = DevEmail;
        bug.AssigneeType = "HUMAN";
        db.SaveChanges();

        var item = Item(await ctrl.Triage(bug.Id, new DevelopmentFixController.TriageRequest("DEVELOP", null, null)));

        Assert.Equal(DevEmail, item.AssignedTo);
    }

    // ===== the queue is split by who builds it =====

    [Fact]
    public async Task Queue_filters_by_developer_and_by_nobody_in_particular()
    {
        var (ctrl, db, _) = Build();
        var mine = SeedBug(db, "Assigned to Dilpreet");
        var open = SeedBug(db, "Anyone's");
        var claude = SeedBug(db, "Assigned to Claude");
        await ctrl.Triage(mine.Id, new DevelopmentFixController.TriageRequest("DEVELOP", null, null, DevEmail));
        await ctrl.Triage(open.Id, new DevelopmentFixController.TriageRequest("DEVELOP", null, null));
        claude.AssignedTo = "claude@bugout.example";
        claude.AssigneeType = "CLAUDE";
        db.SaveChanges();
        await ctrl.Triage(claude.Id, new DevelopmentFixController.TriageRequest("DEVELOP", null, null));

        var forDev = Items(await ctrl.Queue(null, null, 20, "DILPREET@protocall.co"));
        Assert.Equal(new[] { mine.Id }, forDev.Select(i => i.TicketId).ToArray());

        var forDevbox = Items(await ctrl.Queue("service-managed", null, 20, "none"));
        Assert.Equal(new[] { open.Id, claude.Id }.OrderBy(x => x), forDevbox.Select(i => i.TicketId).OrderBy(x => x));

        var all = Items(await ctrl.Queue(null, null, 20));
        Assert.Equal(3, all.Count);
    }

    // ===== the PR puts the same ticket on the board =====

    private static AzureDevOpsWebhookService Webhook(BugsManagedDbContext db)
    {
        var org = new TestDoubles.TestOrgContext { CurrentOrganizationId = OrgId };
        var activity = new TicketActivityLogger(db);
        return new AzureDevOpsWebhookService(db, new DevelopmentOrderService(db, activity), activity, org,
            Options.Create(new DevelopmentTrackerOptions { BoardBaseUrl = "https://bugout.managedplatform.com", TimeZone = "UTC" }),
            NullLogger<AzureDevOpsWebhookService>.Instance);
    }

    private static JsonElement PullRequest(string eventType, int id, string status, string source, string? description, string target = "dev") =>
        JsonDocument.Parse(JsonSerializer.Serialize(new
        {
            eventType,
            resource = new
            {
                repository = new { id = "r1", name = "ServiceManagerUI", webUrl = "https://dev.azure.com/protocall/WebbasedLLC/_git/ServiceManagerUI", project = new { name = "WebbasedLLC" } },
                pullRequestId = id,
                status,
                createdBy = new { displayName = "Dilpreet Singh", uniqueName = DevEmail },
                closedBy = status == "active" ? null : new { displayName = "Dilpreet Singh" },
                title = "BugOut #x: Dispatch board flickers",
                description = description ?? "",
                sourceRefName = "refs/heads/" + source,
                targetRefName = "refs/heads/" + target,
            },
        })).RootElement;

    [Fact]
    public async Task Pr_naming_the_ticket_in_its_description_promotes_that_ticket_instead_of_a_duplicate()
    {
        var (ctrl, db, _) = Build();
        var bug = SeedBug(db);
        await ctrl.Triage(bug.Id, new DevelopmentFixController.TriageRequest("DEVELOP", null, null, DevEmail));
        await ctrl.Claim(bug.Id, new DevelopmentFixController.ClaimRequest("Dilpreet's laptop"));
        var ticketsBefore = db.Tickets.IgnoreQueryFilters().Count();

        var outcome = await Webhook(db).HandleAsync(PullRequest("git.pullrequest.created", 4401, "active", "dilpreet/flicker",
            $"Fixes the flicker.\n\n**Ticket:** https://bugout.managedplatform.com/development/{bug.Id}"), "service-key:9", "Azure DevOps webhook");

        Assert.Equal("ticket-promoted", outcome.Action);
        Assert.Equal(bug.Id, outcome.OrderId);
        Assert.Equal(ticketsBefore, db.Tickets.IgnoreQueryFilters().Count()); // no second order
        var t = await db.Tickets.IgnoreQueryFilters().SingleAsync(x => x.Id == bug.Id);
        Assert.True(t.IsDevelopmentOrder);
        Assert.Equal(DevelopmentStages.PrOpen, t.DevelopmentStage);
        Assert.Equal(FixStatuses.Claimed, t.FixStatus); // the session still owns the fix

        // The session then reports with the same PR: no duplicate links, stays at PR open.
        var item = Item(await ctrl.Result(bug.Id, new DevelopmentFixController.FixResultRequest("READY_TO_TEST", "Drag handler fixed", new List<DevelopmentController.LinkRequest>
        {
            new("PR", "ServiceManagerUI", "PR 4401", "https://dev.azure.com/protocall/WebbasedLLC/_git/ServiceManagerUI/pullrequest/4401", "into dev"),
        }, "Drag a job across two technicians")));
        Assert.Equal(FixStatuses.ReadyToTest, item.FixStatus);
        Assert.Equal(1, db.TicketDevelopmentLinks.IgnoreQueryFilters().Count(l => l.TicketId == bug.Id && l.Kind == "PR"));
        Assert.Equal(DevelopmentStages.PrOpen, item.DevelopmentStage);
    }

    [Fact]
    public async Task Pr_from_a_BugOut_Fix_branch_promotes_the_ticket_and_merging_moves_it_on()
    {
        var (ctrl, db, _) = Build();
        var bug = SeedBug(db);
        var hook = Webhook(db);

        var created = await hook.HandleAsync(PullRequest("git.pullrequest.created", 4402, "active", $"BugOut_Fix_{bug.Id}", "no board link here"), "service-key:9", "Azure DevOps webhook");
        Assert.Equal("ticket-promoted", created.Action);
        Assert.Equal(bug.Id, created.OrderId);
        Assert.Contains(db.TicketDevelopmentLinks.IgnoreQueryFilters().Where(l => l.TicketId == bug.Id), l => l.Kind == "BRANCH" && l.Name == $"BugOut_Fix_{bug.Id}");

        var merged = await hook.HandleAsync(PullRequest("git.pullrequest.updated", 4402, "completed", $"BugOut_Fix_{bug.Id}", "no board link here"), "service-key:9", "Azure DevOps webhook");
        Assert.Equal(bug.Id, merged.OrderId);
        Assert.Equal(DevelopmentStages.MergedDev, (await db.Tickets.IgnoreQueryFilters().SingleAsync(x => x.Id == bug.Id)).DevelopmentStage);
    }

    [Fact]
    public async Task An_abandoned_pr_never_promotes_a_ticket()
    {
        var (_, db, _) = Build();
        var bug = SeedBug(db);

        var outcome = await Webhook(db).HandleAsync(PullRequest("git.pullrequest.updated", 4403, "abandoned", $"BugOut_Fix_{bug.Id}", null), "service-key:9", "Azure DevOps webhook");

        Assert.False(outcome.Handled);
        Assert.False((await db.Tickets.IgnoreQueryFilters().SingleAsync(x => x.Id == bug.Id)).IsDevelopmentOrder);
    }
}
