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

// xUnit tests for the four new tiered-escalation endpoints on TicketController.
// We exercise:
//   - Happy path: each endpoint advances the ticket through the expected stage.
//   - Stage-gating: a wrong-stage call returns 409 Conflict.
//   - Role-gating: every Authorize(Roles=...) attribute matches the spec, so
//     the framework will reject DEVELOPER attempts with 403 (verified via
//     reflection because action-level Authorize is enforced by the runtime
//     pipeline, not in-method).
public class EscalationEndpointsTests
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

    private static Ticket SeedTicket(BugsManagedDbContext db, string stage, string? repoPath = "C:/some/repo")
    {
        // Project must exist for assign-to-claude to look up RepoPath.
        if (!db.Projects.IgnoreQueryFilters().Any(p => p.Id == ProjectId))
        {
            db.Projects.Add(new Project
            {
                Id = ProjectId,
                Name = "Test Project",
                Slug = "test-project",
                ApiKey = "test-key",
                OrganizationId = OrgId,
                RepoPath = repoPath,
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
            Status = "OPEN",
        };
        db.Tickets.Add(ticket);
        db.SaveChanges();
        return ticket;
    }

    // ===== EscalateToPlatformOwner =====

    [Fact]
    public async Task EscalateToPlatformOwner_HappyPath_AdvancesStage()
    {
        var (ctrl, db, _) = BuildController(callerEmail: "admin@x.com", callerRole: "SUPER_ADMIN");
        var t = SeedTicket(db, "SUPER_ADMIN_REVIEW");

        var result = await ctrl.EscalateToPlatformOwner(t.Id);

        var ok = Assert.IsType<OkObjectResult>(result);
        var ticket = Assert.IsType<Ticket>(ok.Value);
        Assert.Equal("PLATFORM_OWNER_REVIEW", ticket.EscalationStage);
        Assert.Equal("admin@x.com", ticket.EscalatedToOwnerBy);
        Assert.NotNull(ticket.EscalatedToOwnerAt);
    }

    [Fact]
    public async Task EscalateToPlatformOwner_WrongStage_Returns409()
    {
        var (ctrl, db, _) = BuildController(callerRole: "SUPER_ADMIN");
        var t = SeedTicket(db, "PLATFORM_OWNER_REVIEW");

        var result = await ctrl.EscalateToPlatformOwner(t.Id);
        Assert.IsType<ConflictObjectResult>(result);
    }

    [Fact]
    public void EscalateToPlatformOwner_RequiresSuperAdminRole()
    {
        var attr = GetAuthorize(nameof(TicketController.EscalateToPlatformOwner));
        Assert.NotNull(attr);
        Assert.Equal("SUPER_ADMIN", attr!.Roles);
    }

    // ===== AssignToHuman =====

    [Fact]
    public async Task AssignToHuman_HappyPath_SetsAssignment()
    {
        var (ctrl, db, _) = BuildController(callerEmail: "owner@x.com", callerRole: "PLATFORM_OWNER");
        var t = SeedTicket(db, "PLATFORM_OWNER_REVIEW");

        var req = new TicketController.AssignToHumanRequest(99, "dev@x.com");
        var result = await ctrl.AssignToHuman(t.Id, req);

        var ok = Assert.IsType<OkObjectResult>(result);
        var ticket = Assert.IsType<Ticket>(ok.Value);
        Assert.Equal("ASSIGNED_HUMAN", ticket.EscalationStage);
        Assert.Equal("HUMAN", ticket.AssigneeType);
        Assert.Equal("dev@x.com", ticket.AssignedTo);
        Assert.Equal("owner@x.com", ticket.AssignedBy);
    }

    [Fact]
    public async Task AssignToHuman_WrongStage_Returns409()
    {
        var (ctrl, db, _) = BuildController(callerRole: "PLATFORM_OWNER");
        var t = SeedTicket(db, "SUPER_ADMIN_REVIEW");

        var req = new TicketController.AssignToHumanRequest(99, "dev@x.com");
        var result = await ctrl.AssignToHuman(t.Id, req);
        Assert.IsType<ConflictObjectResult>(result);
    }

    [Fact]
    public void AssignToHuman_RequiresPlatformOwnerRole()
    {
        var attr = GetAuthorize(nameof(TicketController.AssignToHuman));
        Assert.NotNull(attr);
        Assert.Equal("PLATFORM_OWNER", attr!.Roles);
    }

    // ===== AssignToClaude =====

    [Fact]
    public async Task AssignToClaude_HappyPath_CreatesPendingRunAndReturns202()
    {
        var (ctrl, db, _) = BuildController(callerEmail: "owner@x.com", callerRole: "PLATFORM_OWNER");
        var t = SeedTicket(db, "PLATFORM_OWNER_REVIEW");

        var result = await ctrl.AssignToClaude(t.Id, new TicketController.AssignToClaudeRequest("sonnet"));

        var accepted = Assert.IsType<AcceptedResult>(result);
        Assert.NotNull(accepted.Value);

        var refreshed = await db.Tickets.IgnoreQueryFilters().FirstAsync(x => x.Id == t.Id);
        Assert.Equal("ASSIGNED_CLAUDE", refreshed.EscalationStage);
        Assert.Equal("CLAUDE", refreshed.AssigneeType);

        var run = await db.ClaudeRuns.IgnoreQueryFilters().FirstAsync(r => r.TicketId == t.Id);
        Assert.Equal("PENDING", run.Status);
        Assert.Equal("claude-sonnet-4-6", run.Model);
        Assert.Equal("owner@x.com", run.RequestedBy);
    }

    [Fact]
    public async Task AssignToClaude_OpusModel_ResolvesToOpus47()
    {
        var (ctrl, db, _) = BuildController(callerRole: "PLATFORM_OWNER");
        var t = SeedTicket(db, "PLATFORM_OWNER_REVIEW");

        await ctrl.AssignToClaude(t.Id, new TicketController.AssignToClaudeRequest("opus"));
        var run = await db.ClaudeRuns.IgnoreQueryFilters().FirstAsync(r => r.TicketId == t.Id);
        Assert.Equal("claude-opus-4-7", run.Model);
    }

    [Fact]
    public async Task AssignToClaude_NoRepoPath_Returns400()
    {
        var (ctrl, db, _) = BuildController(callerRole: "PLATFORM_OWNER");
        var t = SeedTicket(db, "PLATFORM_OWNER_REVIEW", repoPath: null);

        var result = await ctrl.AssignToClaude(t.Id, new TicketController.AssignToClaudeRequest("sonnet"));
        var bad = Assert.IsType<BadRequestObjectResult>(result);
        Assert.Contains("RepoPath", bad.Value!.ToString()!, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task AssignToClaude_WrongStage_Returns409()
    {
        var (ctrl, db, _) = BuildController(callerRole: "PLATFORM_OWNER");
        var t = SeedTicket(db, "SUPER_ADMIN_REVIEW");

        var result = await ctrl.AssignToClaude(t.Id, new TicketController.AssignToClaudeRequest("sonnet"));
        Assert.IsType<ConflictObjectResult>(result);
    }

    [Fact]
    public void AssignToClaude_RequiresPlatformOwnerRole()
    {
        var attr = GetAuthorize(nameof(TicketController.AssignToClaude));
        Assert.NotNull(attr);
        Assert.Equal("PLATFORM_OWNER", attr!.Roles);
    }

    // ===== GetClaudeRuns =====

    [Fact]
    public async Task GetClaudeRuns_ReturnsRowsForTicketMostRecentFirst()
    {
        var (ctrl, db, _) = BuildController(callerRole: "DEVELOPER");
        var t = SeedTicket(db, "ASSIGNED_CLAUDE");
        db.ClaudeRuns.Add(new ClaudeRun { TicketId = t.Id, OrganizationId = OrgId, Status = "SUCCEEDED", Model = "claude-sonnet-4-6", CreatedAt = DateTime.UtcNow.AddMinutes(-10) });
        db.ClaudeRuns.Add(new ClaudeRun { TicketId = t.Id, OrganizationId = OrgId, Status = "PENDING",   Model = "claude-sonnet-4-6", CreatedAt = DateTime.UtcNow });
        db.SaveChanges();

        var result = await ctrl.GetClaudeRuns(t.Id);
        var ok = Assert.IsType<OkObjectResult>(result);
        var runs = Assert.IsAssignableFrom<List<ClaudeRun>>(ok.Value);
        Assert.Equal(2, runs.Count);
        Assert.Equal("PENDING", runs[0].Status); // newest first
    }

    [Fact]
    public void GetClaudeRuns_AllowsAnyAuthenticatedRole()
    {
        // [Authorize] with no Roles set means any authenticated user.
        var attr = GetAuthorize(nameof(TicketController.GetClaudeRuns));
        Assert.NotNull(attr);
        Assert.True(string.IsNullOrEmpty(attr!.Roles));
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
