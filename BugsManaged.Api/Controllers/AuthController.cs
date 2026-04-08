using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using BugsManaged.Api.Data;
using BugsManaged.Api.Entities;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

namespace BugsManaged.Api.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private readonly BugsManagedDbContext _db;
    private readonly IConfiguration _config;

    public AuthController(BugsManagedDbContext db, IConfiguration config)
    {
        _db = db;
        _config = config;
    }

    [HttpPost("register")]
    [AllowAnonymous]
    public async Task<IActionResult> Register([FromBody] RegisterRequest request)
    {
        if (await _db.Users.AnyAsync(u => u.Email == request.Email))
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

        var token = GenerateJwtToken(user);

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
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Email == request.Email);
        if (user == null || !BCrypt.Net.BCrypt.Verify(request.Password, user.Password))
            return Unauthorized(new { message = "Invalid email or password" });

        var organization = await _db.Organizations.FindAsync(user.OrganizationId);
        var token = GenerateJwtToken(user);

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

    private string GenerateJwtToken(User user)
    {
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(
            _config["Jwt:Key"] ?? "default-secret-key-change-in-production-32chars!"));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var claims = new[]
        {
            new Claim(ClaimTypes.Email, user.Email),
            new Claim("organizationId", user.OrganizationId.ToString()),
            new Claim(ClaimTypes.Role, user.Role),
            new Claim("userId", user.Id.ToString()),
            new Claim("fullName", user.FullName)
        };

        var token = new JwtSecurityToken(
            issuer: _config["Jwt:Issuer"] ?? "BugOutManaged",
            audience: _config["Jwt:Audience"] ?? "BugOutManaged",
            claims: claims,
            expires: DateTime.UtcNow.AddHours(24),
            signingCredentials: creds);

        return new JwtSecurityTokenHandler().WriteToken(token);
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
