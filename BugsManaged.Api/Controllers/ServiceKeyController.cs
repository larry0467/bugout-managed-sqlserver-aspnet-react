using System.Security.Claims;
using BugsManaged.Api.Data;
using BugsManaged.Api.Entities;
using BugsManaged.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BugsManaged.Api.Controllers;

// Org admins mint and revoke the machine keys that Claude Code sessions use
// to log development orders. User JWT only - a service key can never create
// another service key.
[ApiController]
[Route("api/service-keys")]
[Authorize(Roles = "PLATFORM_OWNER,SUPER_ADMIN")]
public class ServiceKeyController : ControllerBase
{
    private readonly BugsManagedDbContext _db;
    private readonly IOrgContext _org;
    private readonly IAuditLogger _audit;

    public ServiceKeyController(BugsManagedDbContext db, IOrgContext org, IAuditLogger audit)
    {
        _db = db;
        _org = org;
        _audit = audit;
    }

    private string CallerEmail() =>
        User.FindFirstValue(ClaimTypes.Email) ?? User.FindFirstValue("email") ?? "unknown";

    public record ServiceKeyDto(
        long Id, string Name, string KeyPrefix, string[] Scopes, string? CreatedBy,
        DateTime CreatedAt, DateTime? LastUsedAt, DateTime? RevokedAt, string? RevokedBy);

    private static ServiceKeyDto ToDto(ServiceApiKey k) => new(
        k.Id, k.Name, k.KeyPrefix, ServiceKeys.ParseScopes(k.Scopes), k.CreatedBy,
        k.CreatedAt, k.LastUsedAt, k.RevokedAt, k.RevokedBy);

    [HttpGet]
    public async Task<IActionResult> List()
    {
        if (_org.CurrentOrganizationId == null) return Unauthorized(new { message = "No organization context" });

        var keys = await _db.ServiceApiKeys
            .OrderByDescending(k => k.CreatedAt)
            .ToListAsync();
        return Ok(keys.Select(ToDto));
    }

    public record CreateRequest(string Name, string[]? Scopes);

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateRequest body)
    {
        if (_org.CurrentOrganizationId == null) return Unauthorized(new { message = "No organization context" });
        if (body == null || string.IsNullOrWhiteSpace(body.Name))
            return BadRequest(new { message = "name is required" });
        var name = body.Name.Trim();
        if (name.Length > 100)
            return BadRequest(new { message = "name must be 100 characters or fewer" });

        var scopes = (body.Scopes == null || body.Scopes.Length == 0)
            ? new[] { ServiceKeys.ScopeDevelopmentWrite }
            : body.Scopes.Select(s => s.Trim().ToLowerInvariant()).Distinct().ToArray();
        var unknown = scopes.Where(s => !ServiceKeys.KnownScopes.Contains(s)).ToArray();
        if (unknown.Length > 0)
            return BadRequest(new { message = $"Unknown scope(s): {string.Join(", ", unknown)}. Valid: {string.Join(", ", ServiceKeys.KnownScopes)}" });

        var raw = ServiceKeys.Generate();
        var caller = CallerEmail();
        var key = new ServiceApiKey
        {
            OrganizationId = _org.CurrentOrganizationId.Value,
            Name = name,
            KeyHash = ServiceKeys.Hash(raw),
            KeyPrefix = ServiceKeys.DisplayPrefix(raw),
            Scopes = string.Join(",", scopes),
            CreatedBy = caller,
        };
        _db.ServiceApiKeys.Add(key);
        await _db.SaveChangesAsync();

        _audit.Record(
            action: "service-key.created",
            outcome: "success",
            actorEmail: caller,
            organizationId: key.OrganizationId,
            targetType: "ServiceApiKey",
            targetId: key.Id.ToString(),
            extra: new Dictionary<string, object?> { ["name"] = name, ["scopes"] = key.Scopes });

        // The only time the raw key leaves the server.
        return StatusCode(201, new
        {
            id = key.Id,
            name = key.Name,
            key = raw,
            keyPrefix = key.KeyPrefix,
            scopes,
            createdAt = key.CreatedAt,
            header = ServiceKeys.HeaderName,
            acceptedOn = "/api/development/*",
            note = "Store this key now. It is shown once and only its hash is kept.",
        });
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Revoke(long id)
    {
        var key = await _db.ServiceApiKeys.FirstOrDefaultAsync(k => k.Id == id);
        if (key == null) return NotFound(new { message = "Service key not found" });

        if (key.RevokedAt == null)
        {
            key.RevokedAt = DateTime.UtcNow;
            key.RevokedBy = CallerEmail();
            await _db.SaveChangesAsync();

            _audit.Record(
                action: "service-key.revoked",
                outcome: "success",
                actorEmail: key.RevokedBy,
                organizationId: key.OrganizationId,
                targetType: "ServiceApiKey",
                targetId: key.Id.ToString(),
                extra: new Dictionary<string, object?> { ["name"] = key.Name });
        }

        return NoContent();
    }
}
