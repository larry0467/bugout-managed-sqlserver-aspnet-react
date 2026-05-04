using BugsManaged.Api.Controllers;
using BugsManaged.Api.Data;
using BugsManaged.Api.Entities;
using BugsManaged.Api.Services;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;

namespace BugsManaged.Api.Tests;

// Fast-path on Create: when the submitter's email matches a privileged user
// on the same tenant, the ticket skips the queues that would loop back to
// them. PLATFORM_OWNER and SUPER_ADMIN both land at PLATFORM_OWNER_REVIEW.
public class FastPathSubmitTests
{
    private const long OrgId = 42;
    private const long ProjectId = 7;

    private static (TicketController controller, BugsManagedDbContext db) Build()
    {
        var orgContext = new FakeOrgContext { CurrentOrganizationId = OrgId, CurrentProjectId = ProjectId };
        var options = new DbContextOptionsBuilder<BugsManagedDbContext>()
            .UseInMemoryDatabase(databaseName: $"bugs-{Guid.NewGuid()}")
            .Options;
        var db = new BugsManagedDbContext(options, orgContext);

        db.Projects.Add(new Project
        {
            Id = ProjectId,
            Name = "Test",
            Slug = "test",
            ApiKey = "k",
            OrganizationId = OrgId,
        });
        db.SaveChanges();

        var classifier = new TicketClassifierService(
            new HttpClient(),
            new ConfigurationBuilder().AddInMemoryCollection().Build(),
            NullLogger<TicketClassifierService>.Instance);

        var controller = new TicketController(db, new FakeWebHostEnv(), classifier, orgContext);
        controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext(),
        };
        return (controller, db);
    }

    private static void SeedUser(BugsManagedDbContext db, string email, string role, long orgId = OrgId)
    {
        db.Users.Add(new User
        {
            Email = email,
            Password = "x",
            FullName = email,
            Role = role,
            OrganizationId = orgId,
        });
        db.SaveChanges();
    }

    private static Ticket NewTicket(string? submittedBy) => new()
    {
        Title = "test",
        SubmittedBy = submittedBy,
    };

    [Fact]
    public async Task Submitter_PlatformOwner_LandsAtPlatformOwnerReview()
    {
        var (ctrl, db) = Build();
        SeedUser(db, "owner@x.com", "PLATFORM_OWNER");

        var result = await ctrl.Create(NewTicket("owner@x.com"));

        var created = Assert.IsType<CreatedAtActionResult>(result);
        var ticket = Assert.IsType<Ticket>(created.Value);
        Assert.Equal("PLATFORM_OWNER_REVIEW", ticket.EscalationStage);
        Assert.NotNull(ticket.EscalatedToOwnerAt);
        Assert.Equal("owner@x.com", ticket.EscalatedToOwnerBy);

        var history = db.TicketStageHistory.Where(h => h.TicketId == ticket.Id).ToList();
        Assert.Single(history);
        Assert.Null(history[0].FromStage);
        Assert.Equal("PLATFORM_OWNER_REVIEW", history[0].ToStage);
        Assert.Contains("PLATFORM_OWNER", history[0].Note);
    }

    [Fact]
    public async Task Submitter_SuperAdmin_LandsAtPlatformOwnerReview()
    {
        var (ctrl, db) = Build();
        SeedUser(db, "admin@x.com", "SUPER_ADMIN");

        var result = await ctrl.Create(NewTicket("admin@x.com"));

        var ticket = Assert.IsType<Ticket>(((CreatedAtActionResult)result).Value);
        Assert.Equal("PLATFORM_OWNER_REVIEW", ticket.EscalationStage);
        Assert.NotNull(ticket.EscalatedToOwnerAt);
    }

    [Fact]
    public async Task Submitter_Developer_NoFastPath()
    {
        var (ctrl, db) = Build();
        SeedUser(db, "dev@x.com", "DEVELOPER");

        var result = await ctrl.Create(NewTicket("dev@x.com"));

        var ticket = Assert.IsType<Ticket>(((CreatedAtActionResult)result).Value);
        Assert.Equal("SUPER_ADMIN_REVIEW", ticket.EscalationStage);
        Assert.Null(ticket.EscalatedToOwnerAt);

        var history = db.TicketStageHistory.Where(h => h.TicketId == ticket.Id).ToList();
        Assert.Single(history);
        Assert.Equal("SUPER_ADMIN_REVIEW", history[0].ToStage);
        Assert.Null(history[0].Note);
    }

    [Fact]
    public async Task Submitter_AnonymousNoEmail_NoFastPath()
    {
        var (ctrl, _) = Build();

        var result = await ctrl.Create(NewTicket(null));

        var ticket = Assert.IsType<Ticket>(((CreatedAtActionResult)result).Value);
        Assert.Equal("SUPER_ADMIN_REVIEW", ticket.EscalationStage);
    }

    [Fact]
    public async Task Submitter_PlatformOwnerInDifferentOrg_NoFastPath()
    {
        var (ctrl, db) = Build();
        // Same email, but the user is a PLATFORM_OWNER on a different tenant —
        // they should NOT get fast-path on this org's tickets.
        SeedUser(db, "owner@x.com", "PLATFORM_OWNER", orgId: 999);

        var result = await ctrl.Create(NewTicket("owner@x.com"));

        var ticket = Assert.IsType<Ticket>(((CreatedAtActionResult)result).Value);
        Assert.Equal("SUPER_ADMIN_REVIEW", ticket.EscalationStage);
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
