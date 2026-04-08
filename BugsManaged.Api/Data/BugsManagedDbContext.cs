using BugsManaged.Api.Entities;
using Microsoft.EntityFrameworkCore;

namespace BugsManaged.Api.Data;

public class BugsManagedDbContext : DbContext
{
    public BugsManagedDbContext(DbContextOptions<BugsManagedDbContext> options) : base(options) { }

    public DbSet<Organization> Organizations => Set<Organization>();
    public DbSet<User> Users => Set<User>();
    public DbSet<Project> Projects => Set<Project>();
    public DbSet<Ticket> Tickets => Set<Ticket>();
    public DbSet<TicketNote> TicketNotes => Set<TicketNote>();

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

        modelBuilder.Entity<Ticket>()
            .HasIndex(t => t.ProjectId);

        modelBuilder.Entity<Ticket>()
            .HasIndex(t => new { t.ProjectId, t.Status });

        modelBuilder.Entity<TicketNote>()
            .HasIndex(n => n.TicketId);
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
        }
    }
}
