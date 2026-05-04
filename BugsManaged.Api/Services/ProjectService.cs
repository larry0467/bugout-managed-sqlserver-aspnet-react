using System.Text.RegularExpressions;
using BugsManaged.Api.Data;
using BugsManaged.Api.Entities;
using Microsoft.EntityFrameworkCore;

namespace BugsManaged.Api.Services;

public class ProjectService
{
    private readonly BugsManagedDbContext _db;

    public ProjectService(BugsManagedDbContext db)
    {
        _db = db;
    }

    public async Task<Project> CreateProjectAsync(string name, long orgId)
    {
        var slug = GenerateSlug(name);
        slug = await EnsureUniqueSlugAsync(slug);

        var project = new Project
        {
            Name = name,
            Slug = slug,
            OrganizationId = orgId
        };

        _db.Projects.Add(project);
        await _db.SaveChangesAsync();
        return project;
    }

    public async Task<Project?> GetByApiKeyAsync(string apiKey)
    {
        return await _db.Projects.FirstOrDefaultAsync(p => p.ApiKey == apiKey);
    }

    public async Task<Project?> GetByIdAsync(long id)
    {
        return await _db.Projects.FindAsync(id);
    }

    public async Task<Project?> UpdateWebhooksAsync(long id, string? webhookUrl, string? slackUrl, string? email)
    {
        var project = await _db.Projects.FindAsync(id);
        if (project == null) return null;

        project.WebhookUrl = webhookUrl;
        project.SlackWebhookUrl = slackUrl;
        project.NotificationEmail = email;
        await _db.SaveChangesAsync();
        return project;
    }

    public async Task<Project?> UpdateSlackConfigAsync(long id, string? slackWebhookUrl, string? slackChannel, string? slackBotToken)
    {
        var project = await _db.Projects.FindAsync(id);
        if (project == null) return null;

        project.SlackWebhookUrl = slackWebhookUrl;
        project.SlackChannel = slackChannel;
        project.SlackBotToken = slackBotToken;
        await _db.SaveChangesAsync();
        return project;
    }

    public async Task<List<Project>> ListProjectsAsync()
    {
        return await _db.Projects.OrderBy(p => p.Name).ToListAsync();
    }

    public async Task<List<Project>> ListByOrganizationAsync(long orgId)
    {
        return await _db.Projects
            .Where(p => p.OrganizationId == orgId)
            .OrderBy(p => p.Name)
            .ToListAsync();
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

        while (await _db.Projects.AnyAsync(p => p.Slug == slug))
        {
            slug = $"{baseSlug}-{counter}";
            counter++;
        }

        return slug;
    }
}
