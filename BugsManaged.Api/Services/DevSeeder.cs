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
            })
            .ToList();

        if (toAdd.Count > 0)
        {
            _db.Projects.AddRange(toAdd);
            await _db.SaveChangesAsync();
            _log.LogInformation("DevSeeder: created {Count} dev projects: {Names}",
                toAdd.Count, string.Join(", ", toAdd.Select(p => p.Name)));
        }
    }
}
