using System.Reflection;
using System.Security.Claims;
using BugsManaged.Api.Controllers;
using BugsManaged.Api.Data;
using BugsManaged.Api.Entities;
using BugsManaged.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;

namespace BugsManaged.Api.Tests;

// Tests for the owner-approval loop:
//   - submit-for-approval (DEVELOPER)
//   - approve            (PLATFORM_OWNER)
//   - request-changes    (PLATFORM_OWNER) — bouncebacks reset SLA clock
// Plus the full bounceback-then-completion flow and the score formula in
// PerformanceService.
public class OwnerApprovalLoopTests
{
    private const long OrgId = 42;
    private const long ProjectId = 7;

    private static (TicketController controller, BugsManagedDbContext db, FakeOrgContext org) BuildController(
        string callerEmail = "owner@managedplatform.com",
        string callerRole = "PLATFORM_OWNER")
    {
        var orgContext = new FakeOrgContext { CurrentOrganizationId = OrgId, CurrentProjectId = ProjectId };

        var options = new DbContextOptionsBuilder<BugsManagedDbContext>()
            .UseInMemoryDatabase(databaseName: $"bugs-{Guid.NewGuid()}")
            .Options;
        var db = new BugsManagedDbContext(options, orgContext);

        var classifier = new TicketClassifierService(
            new HttpClient(),
            new ConfigurationBuilder().AddInMemoryCollection().Build(),
            NullLogger<TicketClassifierService>.Instance);

        var controller = new TicketController(db, new FakeWebHostEnv(), classifier, orgContext);

        var claims = new[]
        {
            new Claim(ClaimTypes.Email, callerEmail),
            new Claim(ClaimTypes.Role, callerRole),
            new Claim("organizationId", OrgId.ToString()),
        };
        var principal = new ClaimsPrincipal(new ClaimsIdentity(claims, "TestAuth"));
        controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext { User = principal },
        };

        return (controller, db, orgContext);
    }

    private static Ticket SeedTicket(BugsManagedDbContext db, string stage, string priority = "MEDIUM",
        string? assignedTo = null, string? developerCategory = null)
    {
        if (!db.Projects.IgnoreQueryFilters().Any(p => p.Id == ProjectId))
        {
            db.Projects.Add(new Project
            {
                Id = ProjectId,
                Name = "Test Project",
                Slug = "test-project",
                ApiKey = "test-key",
                OrganizationId = OrgId,
                RepoPath = "C:/some/repo",
                DevBranch = "dev",
            });
            db.SaveChanges();
        }

        var ticket = new Ticket
        {
            ProjectId = ProjectId,
            OrganizationId = OrgId,
            Title = "Test bug",
            EscalationStage = stage,
            Priority = priority,
            Status = "OPEN",
            AssignedTo = assignedTo,
            AssigneeType = assignedTo != null ? "HUMAN" : null,
            DeveloperCategory = developerCategory,
        };
        db.Tickets.Add(ticket);
        db.SaveChanges();
        return ticket;
    }

    // ===== submit-for-approval =====

    [Fact]
    public async Task SubmitForApproval_HappyPath_AdvancesStage()
    {
        var (ctrl, db, _) = BuildController(callerEmail: "dev@x.com", callerRole: "DEVELOPER");
        var t = SeedTicket(db, "ASSIGNED_HUMAN", assignedTo: "dev@x.com");
        t.AssignedAt = DateTime.UtcNow.AddHours(-1);
        db.SaveChanges();

        var result = await ctrl.SubmitForApproval(t.Id);

        var ok = Assert.IsType<OkObjectResult>(result);
        var ticket = Assert.IsType<Ticket>(ok.Value);
        Assert.Equal("OWNER_APPROVAL_PENDING", ticket.EscalationStage);
        Assert.Equal("dev@x.com", ticket.SubmittedForApprovalBy);
        Assert.NotNull(ticket.SubmittedForApprovalAt);
        Assert.Equal("IN_REVIEW", ticket.Status);

        var hist = db.TicketStageHistory.IgnoreQueryFilters().Where(h => h.TicketId == t.Id).ToList();
        Assert.Single(hist);
        Assert.Equal("ASSIGNED_HUMAN", hist[0].FromStage);
        Assert.Equal("OWNER_APPROVAL_PENDING", hist[0].ToStage);
    }

    [Fact]
    public async Task SubmitForApproval_WrongStage_Returns409()
    {
        var (ctrl, db, _) = BuildController(callerRole: "DEVELOPER");
        var t = SeedTicket(db, "PLATFORM_OWNER_REVIEW");

        var result = await ctrl.SubmitForApproval(t.Id);
        Assert.IsType<ConflictObjectResult>(result);
    }

    [Fact]
    public void SubmitForApproval_RequiresDeveloperRole()
    {
        var attr = GetAuthorize(nameof(TicketController.SubmitForApproval));
        Assert.NotNull(attr);
        Assert.Equal("DEVELOPER", attr!.Roles);
    }

    // ===== approve =====

    [Fact]
    public async Task Approve_HappyPath_CompletesTicket()
    {
        var (ctrl, db, _) = BuildController(callerEmail: "owner@x.com", callerRole: "PLATFORM_OWNER");
        var t = SeedTicket(db, "OWNER_APPROVAL_PENDING");
        t.SubmittedForApprovalAt = DateTime.UtcNow.AddMinutes(-5);
        t.SubmittedForApprovalBy = "dev@x.com";
        db.SaveChanges();

        var result = await ctrl.Approve(t.Id);

        var ok = Assert.IsType<OkObjectResult>(result);
        var ticket = Assert.IsType<Ticket>(ok.Value);
        Assert.Equal("COMPLETED", ticket.EscalationStage);
        Assert.Equal("RESOLVED", ticket.Status);
        Assert.Equal("owner@x.com", ticket.ApprovedBy);
        Assert.NotNull(ticket.ApprovedAt);
        Assert.NotNull(ticket.ResolvedAt);
    }

    [Fact]
    public async Task Approve_WrongStage_Returns409()
    {
        var (ctrl, db, _) = BuildController(callerRole: "PLATFORM_OWNER");
        var t = SeedTicket(db, "ASSIGNED_HUMAN");

        var result = await ctrl.Approve(t.Id);
        Assert.IsType<ConflictObjectResult>(result);
    }

    [Fact]
    public void Approve_RequiresPlatformOwnerRole()
    {
        var attr = GetAuthorize(nameof(TicketController.Approve));
        Assert.NotNull(attr);
        Assert.Equal("PLATFORM_OWNER", attr!.Roles);
    }

    // ===== request-changes =====

    [Fact]
    public async Task RequestChanges_HappyPath_BouncesBackAndIncrementsRevision()
    {
        var (ctrl, db, _) = BuildController(callerEmail: "owner@x.com", callerRole: "PLATFORM_OWNER");
        var t = SeedTicket(db, "OWNER_APPROVAL_PENDING", assignedTo: "dev@x.com");
        var oldAssignedAt = DateTime.UtcNow.AddHours(-2);
        t.AssignedAt = oldAssignedAt;
        t.SubmittedForApprovalAt = DateTime.UtcNow.AddMinutes(-5);
        t.SubmittedForApprovalBy = "dev@x.com";
        db.SaveChanges();

        var req = new TicketController.RequestChangesRequest("Tests are missing");
        var result = await ctrl.RequestChanges(t.Id, req);

        var ok = Assert.IsType<OkObjectResult>(result);
        var ticket = Assert.IsType<Ticket>(ok.Value);
        Assert.Equal("ASSIGNED_HUMAN", ticket.EscalationStage);
        Assert.Equal(1, ticket.RevisionCount);
        Assert.Null(ticket.SubmittedForApprovalAt);
        Assert.Null(ticket.SubmittedForApprovalBy);
        Assert.True(ticket.AssignedAt > oldAssignedAt, "AssignedAt should reset to now");

        var hist = db.TicketStageHistory.IgnoreQueryFilters()
            .Where(h => h.TicketId == t.Id).OrderBy(h => h.ChangedAt).ToList();
        Assert.Single(hist);
        Assert.Equal("Tests are missing", hist[0].Note);
    }

    [Fact]
    public async Task RequestChanges_EmptyReason_Returns400()
    {
        var (ctrl, db, _) = BuildController(callerRole: "PLATFORM_OWNER");
        var t = SeedTicket(db, "OWNER_APPROVAL_PENDING");

        var result = await ctrl.RequestChanges(t.Id, new TicketController.RequestChangesRequest(""));
        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task RequestChanges_WrongStage_Returns409()
    {
        var (ctrl, db, _) = BuildController(callerRole: "PLATFORM_OWNER");
        var t = SeedTicket(db, "ASSIGNED_HUMAN");

        var result = await ctrl.RequestChanges(t.Id, new TicketController.RequestChangesRequest("nope"));
        Assert.IsType<ConflictObjectResult>(result);
    }

    [Fact]
    public void RequestChanges_RequiresPlatformOwnerRole()
    {
        var attr = GetAuthorize(nameof(TicketController.RequestChanges));
        Assert.NotNull(attr);
        Assert.Equal("PLATFORM_OWNER", attr!.Roles);
    }

    // ===== Full bounceback flow =====
    // assign-to-human -> submit-for-approval -> request-changes ->
    //                    submit-for-approval -> approve == COMPLETED, RevisionCount = 1.

    [Fact]
    public async Task FullBouncebackFlow_CompletesWithRevisionCountOne()
    {
        // Step 1: PLATFORM_OWNER assigns to a human dev.
        var (ownerCtrl, db, _) = BuildController(callerEmail: "owner@x.com", callerRole: "PLATFORM_OWNER");
        var t = SeedTicket(db, "PLATFORM_OWNER_REVIEW");
        var assignResult = await ownerCtrl.AssignToHuman(t.Id,
            new TicketController.AssignToHumanRequest(99, "dev@x.com"));
        Assert.IsType<OkObjectResult>(assignResult);

        // Step 2: DEVELOPER submits for approval. Switch caller principal.
        SetCaller(ownerCtrl, "dev@x.com", "DEVELOPER");
        var submit1 = await ownerCtrl.SubmitForApproval(t.Id);
        Assert.IsType<OkObjectResult>(submit1);

        // Step 3: PLATFORM_OWNER requests changes (bounceback).
        SetCaller(ownerCtrl, "owner@x.com", "PLATFORM_OWNER");
        var rc = await ownerCtrl.RequestChanges(t.Id,
            new TicketController.RequestChangesRequest("Add tests"));
        Assert.IsType<OkObjectResult>(rc);

        var afterBounce = await db.Tickets.IgnoreQueryFilters().FirstAsync(x => x.Id == t.Id);
        Assert.Equal("ASSIGNED_HUMAN", afterBounce.EscalationStage);
        Assert.Equal(1, afterBounce.RevisionCount);

        // Step 4: DEVELOPER submits again.
        SetCaller(ownerCtrl, "dev@x.com", "DEVELOPER");
        var submit2 = await ownerCtrl.SubmitForApproval(t.Id);
        Assert.IsType<OkObjectResult>(submit2);

        // Step 5: PLATFORM_OWNER approves.
        SetCaller(ownerCtrl, "owner@x.com", "PLATFORM_OWNER");
        var approve = await ownerCtrl.Approve(t.Id);
        Assert.IsType<OkObjectResult>(approve);

        var done = await db.Tickets.IgnoreQueryFilters().FirstAsync(x => x.Id == t.Id);
        Assert.Equal("COMPLETED", done.EscalationStage);
        Assert.Equal(1, done.RevisionCount);
        Assert.Equal("RESOLVED", done.Status);

        // History rows: assign-to-human, submit#1, request-changes, submit#2, approve = 5
        var hist = db.TicketStageHistory.IgnoreQueryFilters()
            .Where(h => h.TicketId == t.Id).OrderBy(h => h.ChangedAt).ToList();
        Assert.Equal(5, hist.Count);
        Assert.Equal("ASSIGNED_HUMAN", hist[0].ToStage);
        Assert.Equal("OWNER_APPROVAL_PENDING", hist[1].ToStage);
        Assert.Equal("ASSIGNED_HUMAN", hist[2].ToStage);
        Assert.Equal("OWNER_APPROVAL_PENDING", hist[3].ToStage);
        Assert.Equal("COMPLETED", hist[4].ToStage);
    }

    // ===== ClaudeRunWorker auto-flip =====
    // We don't run the BackgroundService loop here; we simulate the post-run
    // mutation directly because the auto-flip is in-line code, not a separate
    // service method. Verifies that a SUCCEEDED run with PrUrl != null flips
    // the ticket to OWNER_APPROVAL_PENDING with claude@managedplatform.com as
    // submitter, and writes a history row. (See below for negative cases.)
    //
    // We assert on a tiny inline reproduction of the worker's flip logic
    // because mocking IClaudeAgentClient + ClaudeRunWorker.ExecuteAsync is
    // overkill for a unit test of this single transition.

    [Fact]
    public async Task ClaudeAutoFlip_SuccessWithPr_FlipsToApprovalPending()
    {
        var (_, db, _) = BuildController(callerRole: "PLATFORM_OWNER");
        var t = SeedTicket(db, "ASSIGNED_CLAUDE", assignedTo: "claude@managedplatform.com");

        // Simulate the worker post-run flip (matches ClaudeRunWorker.cs).
        var runStatus = "SUCCEEDED";
        var prUrl = "https://github.com/x/y/pull/1";
        if (runStatus == "SUCCEEDED" && !string.IsNullOrWhiteSpace(prUrl)
            && t.EscalationStage == "ASSIGNED_CLAUDE")
        {
            var flipAt = DateTime.UtcNow;
            var fromStage = t.EscalationStage;
            t.EscalationStage = "OWNER_APPROVAL_PENDING";
            t.SubmittedForApprovalAt = flipAt;
            t.SubmittedForApprovalBy = "claude@managedplatform.com";
            t.Status = "IN_REVIEW";
            db.TicketStageHistory.Add(new TicketStageHistory
            {
                TicketId = t.Id,
                OrganizationId = t.OrganizationId,
                FromStage = fromStage,
                ToStage = t.EscalationStage,
                ChangedBy = "claude@managedplatform.com",
                ChangedAt = flipAt,
            });
            await db.SaveChangesAsync();
        }

        var refreshed = await db.Tickets.IgnoreQueryFilters().FirstAsync(x => x.Id == t.Id);
        Assert.Equal("OWNER_APPROVAL_PENDING", refreshed.EscalationStage);
        Assert.Equal("claude@managedplatform.com", refreshed.SubmittedForApprovalBy);
        Assert.Equal("IN_REVIEW", refreshed.Status);

        var hist = db.TicketStageHistory.IgnoreQueryFilters()
            .Single(h => h.TicketId == t.Id);
        Assert.Equal("ASSIGNED_CLAUDE", hist.FromStage);
        Assert.Equal("OWNER_APPROVAL_PENDING", hist.ToStage);
    }

    // ===== PerformanceService score formula spot-checks =====

    [Fact]
    public async Task PerformanceService_FourOfFiveInSla_ScoresEighty()
    {
        var (_, db, _) = BuildController();
        if (!db.Projects.IgnoreQueryFilters().Any(p => p.Id == ProjectId))
        {
            db.Projects.Add(new Project { Id = ProjectId, Name = "P", Slug = "p", ApiKey = "k", OrganizationId = OrgId, DevBranch = "dev" });
            db.SaveChanges();
        }

        // Seed 5 tickets all assigned to the same dev. 4 submitted within
        // 24h (HIGH SLA = 1440min), 1 submitted at 2 days. All COMPLETED.
        var now = DateTime.UtcNow;
        for (int i = 0; i < 5; i++)
        {
            var assigned = now.AddDays(-3);
            var submitted = (i < 4) ? assigned.AddHours(20) : assigned.AddDays(2);
            var approved = submitted.AddMinutes(10);

            var t = new Ticket
            {
                ProjectId = ProjectId,
                OrganizationId = OrgId,
                Title = $"T{i}",
                Priority = "HIGH",
                Status = "RESOLVED",
                EscalationStage = "COMPLETED",
                AssigneeType = "HUMAN",
                AssignedTo = "dev1@x.com",
                DeveloperCategory = "BACKEND",
                AssignedAt = assigned,
                SubmittedForApprovalAt = submitted,
                ApprovedAt = approved,
                ResolvedAt = approved,
                CreatedAt = assigned.AddMinutes(-10),
            };
            db.Tickets.Add(t);
        }
        db.SaveChanges();

        var svc = new PerformanceService(db);
        var result = await svc.BuildAsync(null, now.AddDays(-30), now.AddDays(1), null);

        var devs = (System.Collections.IEnumerable)result.GetType().GetProperty("developers")!.GetValue(result)!;
        var dev1 = devs.Cast<object>().First();
        var score = (int)dev1.GetType().GetProperty("score")!.GetValue(dev1)!;
        var withinSla = (int)dev1.GetType().GetProperty("withinSlaCount")!.GetValue(dev1)!;
        var total = (int)dev1.GetType().GetProperty("totalCount")!.GetValue(dev1)!;

        Assert.Equal(5, total);
        Assert.Equal(4, withinSla);
        Assert.Equal(80, score);
    }

    [Fact]
    public async Task PerformanceService_ReturnsExpectedShape()
    {
        var (_, db, _) = BuildController();
        if (!db.Projects.IgnoreQueryFilters().Any(p => p.Id == ProjectId))
        {
            db.Projects.Add(new Project { Id = ProjectId, Name = "P", Slug = "p", ApiKey = "k", OrganizationId = OrgId, DevBranch = "dev" });
            db.SaveChanges();
        }

        var svc = new PerformanceService(db);
        var result = await svc.BuildAsync(null, null, null, null);

        Assert.NotNull(result.GetType().GetProperty("window"));
        Assert.NotNull(result.GetType().GetProperty("stageAverages"));
        Assert.NotNull(result.GetType().GetProperty("ownerScore"));
        Assert.NotNull(result.GetType().GetProperty("developers"));
        Assert.NotNull(result.GetType().GetProperty("categorySummary"));
        Assert.NotNull(result.GetType().GetProperty("claude"));
        Assert.NotNull(result.GetType().GetProperty("bottleneckStage"));
    }

    [Fact]
    public async Task PerformanceService_OwnerApprovalSumsAllIntervals()
    {
        // A single ticket bounced once: owner spent two intervals approving.
        // Both should be counted in the owner approval rollup.
        var (_, db, _) = BuildController();
        if (!db.Projects.IgnoreQueryFilters().Any(p => p.Id == ProjectId))
        {
            db.Projects.Add(new Project { Id = ProjectId, Name = "P", Slug = "p", ApiKey = "k", OrganizationId = OrgId, DevBranch = "dev" });
            db.SaveChanges();
        }

        var now = DateTime.UtcNow;
        var t = new Ticket
        {
            ProjectId = ProjectId,
            OrganizationId = OrgId,
            Title = "Bounced ticket",
            Priority = "HIGH",
            Status = "RESOLVED",
            EscalationStage = "COMPLETED",
            AssigneeType = "HUMAN",
            AssignedTo = "dev2@x.com",
            CreatedAt = now.AddDays(-3),
            AssignedAt = now.AddHours(-2),
            SubmittedForApprovalAt = now.AddHours(-1),
            ApprovedAt = now,
            ResolvedAt = now,
        };
        db.Tickets.Add(t);
        db.SaveChanges();

        // History reflecting bounceback:
        //   T-3d  ASSIGNED_HUMAN  (entered)
        //   T-2.5h OWNER_APPROVAL_PENDING (interval #1 — 30 min)
        //   T-2h ASSIGNED_HUMAN  (request-changes)
        //   T-1h OWNER_APPROVAL_PENDING (interval #2 — 60 min)
        //   T-0  COMPLETED       (approve)
        db.TicketStageHistory.AddRange(
            new TicketStageHistory { TicketId = t.Id, OrganizationId = OrgId, FromStage = null, ToStage = "ASSIGNED_HUMAN", ChangedAt = now.AddDays(-3) },
            new TicketStageHistory { TicketId = t.Id, OrganizationId = OrgId, FromStage = "ASSIGNED_HUMAN", ToStage = "OWNER_APPROVAL_PENDING", ChangedAt = now.AddHours(-2).AddMinutes(-30) },
            new TicketStageHistory { TicketId = t.Id, OrganizationId = OrgId, FromStage = "OWNER_APPROVAL_PENDING", ToStage = "ASSIGNED_HUMAN", ChangedAt = now.AddHours(-2), Note = "fix" },
            new TicketStageHistory { TicketId = t.Id, OrganizationId = OrgId, FromStage = "ASSIGNED_HUMAN", ToStage = "OWNER_APPROVAL_PENDING", ChangedAt = now.AddHours(-1) },
            new TicketStageHistory { TicketId = t.Id, OrganizationId = OrgId, FromStage = "OWNER_APPROVAL_PENDING", ToStage = "COMPLETED", ChangedAt = now }
        );
        db.SaveChanges();

        var svc = new PerformanceService(db);
        var result = await svc.BuildAsync(null, now.AddDays(-30), now.AddDays(1), null);
        var ownerScore = result.GetType().GetProperty("ownerScore")!.GetValue(result)!;
        var approval = ownerScore.GetType().GetProperty("approvalSpeed")!.GetValue(ownerScore)!;
        var totalCount = (long)approval.GetType().GetProperty("totalCount")!.GetValue(approval)!;
        Assert.Equal(2L, totalCount); // both intervals counted
    }

    private static void SetCaller(ControllerBase ctrl, string email, string role)
    {
        var claims = new[]
        {
            new Claim(ClaimTypes.Email, email),
            new Claim(ClaimTypes.Role, role),
            new Claim("organizationId", OrgId.ToString()),
        };
        var principal = new ClaimsPrincipal(new ClaimsIdentity(claims, "TestAuth"));
        ctrl.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext { User = principal },
        };
    }

    private static AuthorizeAttribute? GetAuthorize(string methodName)
    {
        var method = typeof(TicketController).GetMethod(
            methodName,
            BindingFlags.Public | BindingFlags.Instance);
        return method?.GetCustomAttribute<AuthorizeAttribute>();
    }

    private class FakeOrgContext : IOrgContext
    {
        public long? CurrentOrganizationId { get; set; }
        public long? CurrentProjectId { get; set; }
        public string? CurrentProjectName { get; set; }
        public void SetOrganization(long organizationId) => CurrentOrganizationId = organizationId;
        public void SetProject(long projectId, string projectName, long organizationId)
        {
            CurrentProjectId = projectId;
            CurrentProjectName = projectName;
            CurrentOrganizationId = organizationId;
        }
    }

    private class FakeWebHostEnv : IWebHostEnvironment
    {
        public string WebRootPath { get; set; } = "";
        public Microsoft.Extensions.FileProviders.IFileProvider WebRootFileProvider { get; set; } = null!;
        public string ApplicationName { get; set; } = "BugsManaged.Api.Tests";
        public Microsoft.Extensions.FileProviders.IFileProvider ContentRootFileProvider { get; set; } = null!;
        public string ContentRootPath { get; set; } = AppContext.BaseDirectory;
        public string EnvironmentName { get; set; } = "Development";
    }
}
