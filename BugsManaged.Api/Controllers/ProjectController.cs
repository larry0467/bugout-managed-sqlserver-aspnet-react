using System.Security.Claims;
using BugsManaged.Api.Data;
using BugsManaged.Api.Entities;
using BugsManaged.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BugsManaged.Api.Controllers;

[ApiController]
[Route("api/projects")]
[Authorize]
public class ProjectController : ControllerBase
{
    private readonly BugsManagedDbContext _db;
    private readonly IOrgContext _org;
    private readonly BillingService _billing;

    public ProjectController(BugsManagedDbContext db, IOrgContext org, BillingService billing)
    {
        _db = db;
        _org = org;
        _billing = billing;
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateProjectRequest request)
    {
        if (_org.CurrentOrganizationId == null)
            return Unauthorized();

        var (allowed, reason) = await _billing.CheckProjectLimitAsync(_org.CurrentOrganizationId.Value);
        if (!allowed)
            return StatusCode(402, new { message = reason });

        var slug = request.Name.ToLower().Replace(" ", "-");
        var project = new Project
        {
            OrganizationId = _org.CurrentOrganizationId.Value,
            Name = request.Name,
            Slug = slug
        };

        _db.Projects.Add(project);
        await _db.SaveChangesAsync();

        return CreatedAtAction(nameof(GetById), new { id = project.Id }, project);
    }

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var role = User.FindFirstValue(ClaimTypes.Role);

        // PLATFORM_OWNER sees every project across every org — bypass the
        // filter. Everyone else gets the default filtered view.
        var query = role == "PLATFORM_OWNER"
            ? _db.Projects.IgnoreQueryFilters().AsQueryable()
            : _db.Projects.AsQueryable();

        var projects = await query
            .OrderByDescending(p => p.CreatedAt)
            .ToListAsync();

        return Ok(projects);
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> GetById(long id)
    {
        var project = await _db.Projects.FirstOrDefaultAsync(p => p.Id == id);
        if (project == null) return NotFound(new { message = "Project not found" });

        return Ok(project);
    }

    [HttpPut("{id}/webhooks")]
    public async Task<IActionResult> UpdateWebhooks(long id, [FromBody] UpdateWebhooksRequest request)
    {
        var project = await _db.Projects.FirstOrDefaultAsync(p => p.Id == id);
        if (project == null) return NotFound(new { message = "Project not found" });

        if (request.WebhookUrl != null) project.WebhookUrl = request.WebhookUrl;
        if (request.SlackWebhookUrl != null) project.SlackWebhookUrl = request.SlackWebhookUrl;
        if (request.GoogleChatWebhookUrl != null) project.GoogleChatWebhookUrl = request.GoogleChatWebhookUrl;
        if (request.NotificationEmail != null) project.NotificationEmail = request.NotificationEmail;

        await _db.SaveChangesAsync();
        return Ok(project);
    }

    [HttpPut("{id}/slack")]
    public async Task<IActionResult> UpdateSlack(long id, [FromBody] UpdateSlackRequest request)
    {
        var project = await _db.Projects.FirstOrDefaultAsync(p => p.Id == id);
        if (project == null) return NotFound(new { message = "Project not found" });

        if (request.SlackWebhookUrl != null) project.SlackWebhookUrl = request.SlackWebhookUrl;
        if (request.SlackChannel != null) project.SlackChannel = request.SlackChannel;
        if (request.SlackBotToken != null) project.SlackBotToken = request.SlackBotToken;

        await _db.SaveChangesAsync();
        return Ok(project);
    }

    public record CreateProjectRequest(string Name);
    public record UpdateWebhooksRequest(string? WebhookUrl, string? SlackWebhookUrl, string? GoogleChatWebhookUrl, string? NotificationEmail);
    public record UpdateSlackRequest(string? SlackWebhookUrl, string? SlackChannel, string? SlackBotToken);
}
