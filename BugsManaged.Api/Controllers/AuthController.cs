using System.Security.Claims;
using BugsManaged.Api.Data;
using BugsManaged.Api.Entities;
using BugsManaged.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;

namespace BugsManaged.Api.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private readonly BugsManagedDbContext _db;
    private readonly JwtService _jwt;
    private readonly IAuditLogger _audit;

    public AuthController(BugsManagedDbContext db, JwtService jwt, IAuditLogger audit)
    {
        _db = db;
        _jwt = jwt;
        _audit = audit;
    }

    /// <summary>
    /// Provision a new tenant (Organization + initial SUPER_ADMIN user).
    /// PLATFORM_OWNER-only.
    /// </summary>
    /// <remarks>
    /// Until 2026-04-28 this endpoint was [AllowAnonymous] — any caller
    /// could create an Organization. That's the wrong posture for a multi-
    /// tenant API hosting customer data, and was flagged during SOC 2
    /// readiness. Now requires an existing PLATFORM_OWNER's JWT.
    ///
    /// New tenant onboarding flow (manual, audited):
    ///   1. Sales/CS confirms the customer's contract is signed.
    ///   2. A PLATFORM_OWNER calls POST /api/auth/register with the
    ///      customer's admin email + a strong temp password.
    ///   3. Customer logs in, changes password on first login.
    ///
    /// For genuine self-signup (e.g. free-tier marketing flow) a separate
    /// invite-token endpoint should be added with an out-of-band approval
    /// step — explicitly out of scope here.
    /// </remarks>
    [HttpPost("register")]
    [Authorize(Roles = "PLATFORM_OWNER")]
    public async Task<IActionResult> Register([FromBody] RegisterRequest request)
    {
        // Bypass the global query filter — at registration time there is
        // no org context yet, and the filter would hide every user and
        // make the uniqueness check a no-op.
        if (await _db.Users.IgnoreQueryFilters().AnyAsync(u => u.Email == request.Email))
            return Conflict(new { message = "Email already registered" });

        var slug = request.OrganizationName.ToLower().Replace(" ", "-");
        var organization = new Organization
        {
            Name = request.OrganizationName,
            Slug = slug,
            Plan = "FREE"
        };
        _db.Organizations.Add(organization);
        await _db.SaveChangesAsync();

        var user = new User
        {
            OrganizationId = organization.Id,
            Email = request.Email,
            Password = BCrypt.Net.BCrypt.HashPassword(request.Password),
            FullName = request.FullName,
            Role = "SUPER_ADMIN"
        };
        _db.Users.Add(user);
        await _db.SaveChangesAsync();

        var token = _jwt.GenerateToken(user);

        _audit.Record(
            action: "tenant.create",
            outcome: "success",
            actorEmail: User.FindFirstValue(System.Security.Claims.ClaimTypes.Email),
            organizationId: organization.Id,
            targetType: "Organization",
            targetId: organization.Id.ToString());

        return Ok(new
        {
            token,
            user = MapUser(user),
            organization = new { organization.Id, organization.Name, organization.Slug, organization.Plan }
        });
    }

    [HttpPost("login")]
    [AllowAnonymous]
    [EnableRateLimiting("anon-tight")]
    public async Task<IActionResult> Login([FromBody] LoginRequest request)
    {
        // Login runs before any org context exists, so everything here
        // bypasses the global filter. The JWT we return carries the
        // organizationId that subsequent requests will resolve from.
        var user = await _db.Users.IgnoreQueryFilters()
            .FirstOrDefaultAsync(u => u.Email == request.Email);
        if (user == null || !BCrypt.Net.BCrypt.Verify(request.Password, user.Password))
        {
            _audit.Record(
                action: "auth.login",
                outcome: "failure",
                actorEmail: request.Email,
                targetType: "User",
                targetId: user?.Id.ToString(),
                extra: new Dictionary<string, object?> { ["reason"] = user == null ? "user_not_found" : "bad_password" });
            return Unauthorized(new { message = "Invalid email or password" });
        }

        var organization = await _db.Organizations.IgnoreQueryFilters()
            .FirstOrDefaultAsync(o => o.Id == user.OrganizationId);
        var token = _jwt.GenerateToken(user);

        _audit.Record(
            action: "auth.login",
            outcome: "success",
            actorEmail: user.Email,
            actorUserId: user.Id,
            organizationId: user.OrganizationId);

        return Ok(new
        {
            token,
            user = MapUser(user),
            organization = organization != null
                ? new { organization.Id, organization.Name, organization.Slug, organization.Plan }
                : null
        });
    }

    [HttpGet("me")]
    [Authorize]
    public async Task<IActionResult> Me()
    {
        var email = User.FindFirstValue(ClaimTypes.Email);
        if (email == null) return Unauthorized();

        var user = await _db.Users.FirstOrDefaultAsync(u => u.Email == email);
        if (user == null) return NotFound(new { message = "User not found" });

        var organization = await _db.Organizations.FindAsync(user.OrganizationId);

        return Ok(new
        {
            user = MapUser(user),
            organization = organization != null
                ? new { organization.Id, organization.Name, organization.Slug, organization.Plan }
                : null
        });
    }

    private static object MapUser(User user) => new
    {
        user.Id,
        user.Email,
        user.FullName,
        user.Role,
        user.OrganizationId,
        user.CreatedAt
    };

    public record RegisterRequest(string Email, string Password, string FullName, string OrganizationName);
    public record LoginRequest(string Email, string Password);
}
