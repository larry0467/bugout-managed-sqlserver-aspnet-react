using BugsManaged.Api.Data;
using BugsManaged.Api.Entities;
using Microsoft.EntityFrameworkCore;

namespace BugsManaged.Api.Services;

// Idempotent development seeder. Creates a "Managed Platform" dev
// organization and one Project per portfolio app, each with a fixed dev
// API key matching the set Comms Managed uses. This lets a developer flip
// X-BOM-API-Key between dev-signatures-key, dev-hancock-key, etc. and see
// the right host app in the admin UI, matching the Comms Managed smoke
// test experience.
//
// Only runs in Development. Production uses real customer-registered
// projects with generated API keys.
public class DevSeeder
{
    private readonly BugsManagedDbContext _db;
    private readonly ILogger<DevSeeder> _log;

    public DevSeeder(BugsManagedDbContext db, ILogger<DevSeeder> log)
    {
        _db = db;
        _log = log;
    }

    private static readonly (string Slug, string Name, string Key)[] DevProjects = new[]
    {
        ("signatures-managed",  "Signatures Managed",  "dev-signatures-key"),
        ("bug-out-managed",     "Bug Out Managed",     "dev-bugout-key"),
        ("service-managed",     "Service Managed",     "dev-service-key"),
        ("hancock",             "Hancock",             "dev-hancock-key"),
        ("voices-managed",      "Voices Managed",      "dev-voices-key"),
        ("videos-managed",      "Videos Managed",      "dev-videos-key"),
        ("formmaster",          "FormMaster",          "dev-formmaster-key"),
        ("rx-managed",          "Rx Managed",          "dev-rx-key"),
        ("facilities-managed",  "Facilities Managed",  "dev-facilities-key"),
        // Backward-compat alias for the legacy localStorage key from the
        // pre-split Managed Platform sandbox. Resolves to the same org but
        // lands in a "Dev Sandbox" project so legacy tickets are findable.
        ("dev-sandbox",         "Dev Sandbox",         "dev-local-managed-platform-key"),
    };

    // The "bug-out-managed" project doubles as the dogfooding repo target —
    // assign-to-claude on a Bugs Managed self-bug points the agent at this
    // very repo. Other apps fill in their own RepoPath later via UI.
    private const string DogfoodSlug = "bug-out-managed";
    private const string DogfoodRepoPath = "C:/Users/larry/bugs-managed-sqlserver-aspnet-react";
    private const string DogfoodRepoSubpath = "BugsManaged.Api";
    private const string DogfoodGithubOwner = "larry0467";
    private const string DogfoodGithubRepo = "bugout-managed-sqlserver-aspnet-react";

    public async Task SeedAsync()
    {
        // Seeder runs at startup before any request has populated an org
        // context, so query filters would block everything. Use
        // IgnoreQueryFilters on every read.

        var org = await _db.Organizations.IgnoreQueryFilters()
            .FirstOrDefaultAsync(o => o.Slug == "managed-platform-dev");
        if (org == null)
        {
            org = new Organization
            {
                Name = "Managed Platform (Dev)",
                Slug = "managed-platform-dev",
                Plan = "ENTERPRISE",
            };
            _db.Organizations.Add(org);
            await _db.SaveChangesAsync();
            _log.LogInformation("DevSeeder: created Managed Platform dev org {OrgId}", org.Id);
        }

        var existingKeys = await _db.Projects.IgnoreQueryFilters()
            .Where(p => DevProjects.Select(d => d.Key).Contains(p.ApiKey))
            .Select(p => p.ApiKey)
            .ToListAsync();

        var toAdd = DevProjects
            .Where(d => !existingKeys.Contains(d.Key))
            .Select(d => new Project
            {
                Name = d.Name,
                Slug = d.Slug,
                ApiKey = d.Key,
                OrganizationId = org.Id,
                DevBranch = "dev",
                RepoPath = d.Slug == DogfoodSlug ? DogfoodRepoPath : null,
                RepoSubpath = d.Slug == DogfoodSlug ? DogfoodRepoSubpath : null,
                GithubOwner = d.Slug == DogfoodSlug ? DogfoodGithubOwner : null,
                GithubRepo = d.Slug == DogfoodSlug ? DogfoodGithubRepo : null,
            })
            .ToList();

        if (toAdd.Count > 0)
        {
            _db.Projects.AddRange(toAdd);
            await _db.SaveChangesAsync();
            _log.LogInformation("DevSeeder: created {Count} dev projects: {Names}",
                toAdd.Count, string.Join(", ", toAdd.Select(p => p.Name)));
        }

        // Backfill repo metadata on the dogfood project for existing devs whose
        // database was seeded before these columns existed.
        var dogfood = await _db.Projects.IgnoreQueryFilters()
            .FirstOrDefaultAsync(p => p.Slug == DogfoodSlug && p.OrganizationId == org.Id);
        if (dogfood != null && string.IsNullOrEmpty(dogfood.RepoPath))
        {
            dogfood.RepoPath = DogfoodRepoPath;
            dogfood.RepoSubpath = DogfoodRepoSubpath;
            dogfood.GithubOwner = DogfoodGithubOwner;
            dogfood.GithubRepo = DogfoodGithubRepo;
            if (string.IsNullOrEmpty(dogfood.DevBranch)) dogfood.DevBranch = "dev";
            await _db.SaveChangesAsync();
            _log.LogInformation("DevSeeder: backfilled repo metadata on dogfood project {Id}", dogfood.Id);
        }

        // Seed at least one PLATFORM_OWNER and one SUPER_ADMIN for the dev org
        // so role-gated endpoints are exercisable in local development.
        var ownerEmail = "owner@managedplatform.com";
        var adminEmail = "admin@managedplatform.com";

        if (!await _db.Users.IgnoreQueryFilters().AnyAsync(u => u.Email == ownerEmail))
        {
            _db.Users.Add(new User
            {
                Email = ownerEmail,
                FullName = "Dev Platform Owner",
                Password = BCrypt.Net.BCrypt.HashPassword("ChangeMe!Dev1"),
                Role = "PLATFORM_OWNER",
                OrganizationId = org.Id,
            });
        }
        if (!await _db.Users.IgnoreQueryFilters().AnyAsync(u => u.Email == adminEmail))
        {
            _db.Users.Add(new User
            {
                Email = adminEmail,
                FullName = "Dev Super Admin",
                Password = BCrypt.Net.BCrypt.HashPassword("ChangeMe!Dev1"),
                Role = "SUPER_ADMIN",
                OrganizationId = org.Id,
            });
        }
        await _db.SaveChangesAsync();
    }
}
