using BugsManaged.Api.Data;
using BugsManaged.Api.Entities;
using Microsoft.EntityFrameworkCore;

namespace BugsManaged.Api.Services;

// Idempotent development seeder. Creates a demo organization and several
// sample projects, each with a fixed dev API key so a developer can flip
// X-BOM-API-Key between apps and see the right host app in the admin UI.
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
        ("bug-out-managed",     "Bug Out Managed",     "dev-bugout-key"),
        ("my-web-app",          "My Web App",          "dev-webapp-key"),
        ("mobile-app",          "Mobile App",          "dev-mobile-key"),
        ("marketing-site",      "Marketing Site",      "dev-marketing-key"),
        ("customer-portal",     "Customer Portal",     "dev-portal-key"),
        ("internal-tools",      "Internal Tools",      "dev-tools-key"),
        // Dev sandbox alias — handy for quick local testing
        ("dev-sandbox",         "Dev Sandbox",         "dev-sandbox-key"),
    };

    // The "bug-out-managed" project doubles as the dogfooding repo target —
    // assign-to-claude on a Bug Out self-bug points the agent at this very
    // repo. Other apps fill in their own RepoPath later via UI.
    private const string DogfoodSlug = "bug-out-managed";
    private const string DogfoodRepoPath = "";   // set via UI or env after cloning
    private const string DogfoodRepoSubpath = "BugsManaged.Api";
    private const string DogfoodGithubOwner = "";  // set via UI or env after cloning
    private const string DogfoodGithubRepo = "bugout-managed-sqlserver-aspnet-react";

    public async Task SeedAsync()
    {
        // Seeder runs at startup before any request has populated an org
        // context, so query filters would block everything. Use
        // IgnoreQueryFilters on every read.

        var org = await _db.Organizations.IgnoreQueryFilters()
            .FirstOrDefaultAsync(o => o.Slug == "acme-corp-dev");
        if (org == null)
        {
            org = new Organization
            {
                Name = "Acme Corp (Dev)",
                Slug = "acme-corp-dev",
                Plan = "ENTERPRISE",
                IsBillingExempt = true,
            };
            _db.Organizations.Add(org);
            await _db.SaveChangesAsync();
            _log.LogInformation("DevSeeder: created dev org {OrgId}", org.Id);
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
        var ownerEmail = "owner@acme-corp.example";
        var adminEmail = "admin@acme-corp.example";

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
