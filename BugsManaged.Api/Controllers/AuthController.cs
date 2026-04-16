using System.Security.Claims;
using BugsManaged.Api.Data;
using BugsManaged.Api.Entities;
using BugsManaged.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BugsManaged.Api.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private readonly BugsManagedDbContext _db;
    private readonly JwtService _jwt;

    public AuthController(BugsManagedDbContext db, JwtService jwt)
    {
        _db = db;
        _jwt = jwt;
    }

    [HttpPost("register")]
    [AllowAnonymous]
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
            Role = "PROJECT_ADMIN"
        };
        _db.Users.Add(user);
        await _db.SaveChangesAsync();

        var token = _jwt.GenerateToken(user);

        return Ok(new
        {
            token,
            user = MapUser(user),
            organization = new { organization.Id, organization.Name, organization.Slug, organization.Plan }
        });
    }

    [HttpPost("login")]
    [AllowAnonymous]
    public async Task<IActionResult> Login([FromBody] LoginRequest request)
    {
        // Login runs before any org context exists, so everything here
        // bypasses the global filter. The JWT we return carries the
        // organizationId that subsequent requests will resolve from.
        var user = await _db.Users.IgnoreQueryFilters()
            .FirstOrDefaultAsync(u => u.Email == request.Email);
        if (user == null || !BCrypt.Net.BCrypt.Verify(request.Password, user.Password))
            return Unauthorized(new { message = "Invalid email or password" });

        var organization = await _db.Organizations.IgnoreQueryFilters()
            .FirstOrDefaultAsync(o => o.Id == user.OrganizationId);
        var token = _jwt.GenerateToken(user);

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
