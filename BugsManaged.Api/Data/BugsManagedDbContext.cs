using BugsManaged.Api.Entities;
using BugsManaged.Api.Services;
using Microsoft.EntityFrameworkCore;

namespace BugsManaged.Api.Data;

public class BugsManagedDbContext : DbContext
{
    private readonly IOrgContext _orgContext;

    public BugsManagedDbContext(DbContextOptions<BugsManagedDbContext> options, IOrgContext orgContext) : base(options)
    {
        _orgContext = orgContext;
    }

    public DbSet<Organization> Organizations => Set<Organization>();
    public DbSet<User> Users => Set<User>();
    public DbSet<Project> Projects => Set<Project>();
    public DbSet<Ticket> Tickets => Set<Ticket>();
    public DbSet<TicketNote> TicketNotes => Set<TicketNote>();
    public DbSet<ClaudeRun> ClaudeRuns => Set<ClaudeRun>();
    public DbSet<TicketStageHistory> TicketStageHistory => Set<TicketStageHistory>();
    public DbSet<SandboxResetLog> SandboxResetLogs => Set<SandboxResetLog>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Organization>()
            .HasIndex(o => o.Slug).IsUnique();

        modelBuilder.Entity<User>()
            .HasIndex(u => u.Email).IsUnique();

        modelBuilder.Entity<Project>()
            .HasIndex(p => p.Slug).IsUnique();

        modelBuilder.Entity<Project>()
            .HasIndex(p => p.ApiKey).IsUnique();

        modelBuilder.Entity<Project>()
            .HasIndex(p => p.OrganizationId);

        modelBuilder.Entity<Ticket>()
            .HasIndex(t => t.ProjectId);

        modelBuilder.Entity<Ticket>()
            .HasIndex(t => new { t.ProjectId, t.Status });

        modelBuilder.Entity<Ticket>()
            .HasIndex(t => t.OrganizationId);

        modelBuilder.Entity<TicketNote>()
            .HasIndex(n => n.TicketId);

        modelBuilder.Entity<TicketNote>()
            .HasIndex(n => n.OrganizationId);

        modelBuilder.Entity<ClaudeRun>()
            .HasIndex(r => r.TicketId);

        modelBuilder.Entity<ClaudeRun>()
            .HasIndex(r => r.Status);

        modelBuilder.Entity<ClaudeRun>()
            .HasIndex(r => r.OrganizationId);

        modelBuilder.Entity<TicketStageHistory>()
            .HasIndex(h => h.TicketId);

        modelBuilder.Entity<TicketStageHistory>()
            .HasIndex(h => h.OrganizationId);

        // SandboxResetLog is platform-meta (not tenant data) — no global
        // query filter, no OrganizationId. Index by OccurredAtUtc so the
        // /api/admin/sandbox/status "last reset" lookup is a single seek.
        modelBuilder.Entity<SandboxResetLog>()
            .HasIndex(l => l.OccurredAtUtc);

        // Global query filters — every org-scoped query auto-filters by the
        // current org resolved by OrgResolutionMiddleware. Use
        // .IgnoreQueryFilters() when you genuinely need to read across orgs
        // (middleware API key lookup, seeder, admin reports across tenants).
        //
        // When CurrentOrganizationId is null (no JWT, no API key), the filter
        // compares OrganizationId to null, which matches nothing. That's the
        // correct default: no context -> no data.
        modelBuilder.Entity<User>()
            .HasQueryFilter(u => _orgContext.CurrentOrganizationId != null && u.OrganizationId == _orgContext.CurrentOrganizationId);

        modelBuilder.Entity<Project>()
            .HasQueryFilter(p => _orgContext.CurrentOrganizationId != null && p.OrganizationId == _orgContext.CurrentOrganizationId);

        modelBuilder.Entity<Ticket>()
            .HasQueryFilter(t => _orgContext.CurrentOrganizationId != null && t.OrganizationId == _orgContext.CurrentOrganizationId);

        modelBuilder.Entity<TicketNote>()
            .HasQueryFilter(n => _orgContext.CurrentOrganizationId != null && n.OrganizationId == _orgContext.CurrentOrganizationId);

        modelBuilder.Entity<ClaudeRun>()
            .HasQueryFilter(r => _orgContext.CurrentOrganizationId != null && r.OrganizationId == _orgContext.CurrentOrganizationId);

        modelBuilder.Entity<TicketStageHistory>()
            .HasQueryFilter(h => _orgContext.CurrentOrganizationId != null && h.OrganizationId == _orgContext.CurrentOrganizationId);
    }

    public override int SaveChanges()
    {
        UpdateTimestamps();
        return base.SaveChanges();
    }

    public override Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        UpdateTimestamps();
        return base.SaveChangesAsync(cancellationToken);
    }

    private void UpdateTimestamps()
    {
        var entries = ChangeTracker.Entries()
            .Where(e => e.State == EntityState.Modified);

        foreach (var entry in entries)
        {
            if (entry.Entity is Organization org) org.UpdatedAt = DateTime.UtcNow;
            else if (entry.Entity is User user) user.UpdatedAt = DateTime.UtcNow;
            else if (entry.Entity is Project proj) proj.UpdatedAt = DateTime.UtcNow;
            else if (entry.Entity is Ticket ticket) ticket.UpdatedAt = DateTime.UtcNow;
            else if (entry.Entity is ClaudeRun run) run.UpdatedAt = DateTime.UtcNow;
        }
    }
}
