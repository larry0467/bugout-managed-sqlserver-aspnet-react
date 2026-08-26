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
    public DbSet<UserProjectAssignment> UserProjectAssignments => Set<UserProjectAssignment>();
    public DbSet<TicketLabel> TicketLabels => Set<TicketLabel>();
    public DbSet<TicketLabelAssignment> TicketLabelAssignments => Set<TicketLabelAssignment>();
    public DbSet<TicketChecklistItem> TicketChecklistItems => Set<TicketChecklistItem>();
    public DbSet<TicketActivity> TicketActivities => Set<TicketActivity>();
    public DbSet<TicketAttachment> TicketAttachments => Set<TicketAttachment>();
    public DbSet<TicketStatusDef> TicketStatusDefs => Set<TicketStatusDef>();
    public DbSet<GoogleChatSpace> GoogleChatSpaces => Set<GoogleChatSpace>();
    public DbSet<GoogleServiceAccount> GoogleServiceAccounts => Set<GoogleServiceAccount>();

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

        modelBuilder.Entity<UserProjectAssignment>()
            .HasIndex(x => new { x.UserId, x.ProjectId })
            .IsUnique();

        modelBuilder.Entity<TicketLabel>()
            .HasIndex(l => new { l.OrganizationId, l.Name }).IsUnique();

        modelBuilder.Entity<TicketLabelAssignment>()
            .HasIndex(a => new { a.TicketId, a.LabelId }).IsUnique();

        modelBuilder.Entity<TicketLabelAssignment>().HasIndex(a => a.OrganizationId);

        modelBuilder.Entity<TicketChecklistItem>().HasIndex(c => c.TicketId);
        modelBuilder.Entity<TicketChecklistItem>().HasIndex(c => c.OrganizationId);

        modelBuilder.Entity<TicketActivity>().HasIndex(a => a.TicketId);
        modelBuilder.Entity<TicketActivity>().HasIndex(a => a.OrganizationId);

        modelBuilder.Entity<TicketAttachment>().HasIndex(a => a.TicketId);
        modelBuilder.Entity<TicketAttachment>().HasIndex(a => a.NoteId);
        modelBuilder.Entity<TicketAttachment>().HasIndex(a => a.OrganizationId);

        modelBuilder.Entity<TicketStatusDef>()
            .HasIndex(s => new { s.OrganizationId, s.Key }).IsUnique();

        // One Space per client per organization. This index is the duplicate
        // guard: two tickets filed at the same instant both get past the
        // service-layer lookup, and this is what makes the second insert lose.
        modelBuilder.Entity<GoogleChatSpace>()
            .HasIndex(s => new { s.OrganizationId, s.MemberEmail }).IsUnique();

        // Inbound events identify their origin by Space, so correlation reads
        // this on every message.
        modelBuilder.Entity<GoogleChatSpace>().HasIndex(s => s.SpaceName);

        // Credentials are looked up by organization, including the shared-default
        // row where OrganizationId is null. Deliberately no global query filter:
        // GoogleChatCredentialProvider is a singleton reading from its own scope,
        // where the org context is empty and a filter would match nothing.
        modelBuilder.Entity<GoogleServiceAccount>().HasIndex(a => new { a.OrganizationId, a.IsActive });

        // Unique-when-present: one Chat message can never become two comments,
        // which is what makes redelivered events idempotent even concurrently.
        // Filtered so the vast majority of notes -- which touch Chat not at all --
        // are unconstrained.
        modelBuilder.Entity<TicketNote>()
            .HasIndex(n => n.GoogleChatMessageName)
            .IsUnique()
            .HasFilter("[GoogleChatMessageName] IS NOT NULL");
        modelBuilder.Entity<TicketStatusDef>().HasIndex(s => s.OrganizationId);

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

        // UserProjectAssignment is scoped through its User FK — no direct
        // OrganizationId column. Filter via the User navigation so org isolation
        // is maintained and EF's global-filter/required-nav warning is resolved.
        modelBuilder.Entity<UserProjectAssignment>()
            .HasQueryFilter(a => _orgContext.CurrentOrganizationId != null && a.User.OrganizationId == _orgContext.CurrentOrganizationId);

        modelBuilder.Entity<TicketLabel>()
            .HasQueryFilter(l => _orgContext.CurrentOrganizationId != null && l.OrganizationId == _orgContext.CurrentOrganizationId);

        modelBuilder.Entity<TicketLabelAssignment>()
            .HasQueryFilter(a => _orgContext.CurrentOrganizationId != null && a.OrganizationId == _orgContext.CurrentOrganizationId);

        modelBuilder.Entity<TicketChecklistItem>()
            .HasQueryFilter(c => _orgContext.CurrentOrganizationId != null && c.OrganizationId == _orgContext.CurrentOrganizationId);

        modelBuilder.Entity<TicketActivity>()
            .HasQueryFilter(a => _orgContext.CurrentOrganizationId != null && a.OrganizationId == _orgContext.CurrentOrganizationId);

        modelBuilder.Entity<TicketAttachment>()
            .HasQueryFilter(a => _orgContext.CurrentOrganizationId != null && a.OrganizationId == _orgContext.CurrentOrganizationId);

        modelBuilder.Entity<TicketStatusDef>()
            .HasQueryFilter(s => _orgContext.CurrentOrganizationId != null && s.OrganizationId == _orgContext.CurrentOrganizationId);

        modelBuilder.Entity<GoogleChatSpace>()
            .HasQueryFilter(s => _orgContext.CurrentOrganizationId != null && s.OrganizationId == _orgContext.CurrentOrganizationId);
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
