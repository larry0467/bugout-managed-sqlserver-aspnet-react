using System.Text.RegularExpressions;
using BugsManaged.Api.Data;
using BugsManaged.Api.Entities;
using Microsoft.EntityFrameworkCore;

namespace BugsManaged.Api.Services;

public class OrganizationService
{
    private readonly BugsManagedDbContext _db;

    public OrganizationService(BugsManagedDbContext db)
    {
        _db = db;
    }

    public async Task<Organization> CreateAsync(string name)
    {
        var slug = GenerateSlug(name);
        slug = await EnsureUniqueSlugAsync(slug);

        var org = new Organization
        {
            Name = name,
            Slug = slug
        };

        _db.Organizations.Add(org);
        await _db.SaveChangesAsync();
        return org;
    }

    public async Task<Organization?> GetByIdAsync(long id)
    {
        return await _db.Organizations.FindAsync(id);
    }

    public async Task<List<Organization>> ListAllAsync()
    {
        return await _db.Organizations.OrderBy(o => o.Name).ToListAsync();
    }

    public async Task<Organization?> UpdatePlanAsync(long id, string plan)
    {
        var org = await _db.Organizations.FindAsync(id);
        if (org == null) return null;

        org.Plan = plan;
        await _db.SaveChangesAsync();
        return org;
    }

    private static string GenerateSlug(string name)
    {
        var slug = name.ToLowerInvariant().Trim();
        slug = Regex.Replace(slug, @"[^a-z0-9\s-]", "");
        slug = Regex.Replace(slug, @"[\s]+", "-");
        slug = Regex.Replace(slug, @"-+", "-");
        slug = slug.Trim('-');
        return slug;
    }

    private async Task<string> EnsureUniqueSlugAsync(string slug)
    {
        var baseSlug = slug;
        var counter = 1;

        while (await _db.Organizations.AnyAsync(o => o.Slug == slug))
        {
            slug = $"{baseSlug}-{counter}";
            counter++;
        }

        return slug;
    }
}
