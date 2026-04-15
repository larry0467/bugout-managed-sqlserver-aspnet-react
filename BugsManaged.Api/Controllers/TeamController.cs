using System.Security.Claims;
using BugsManaged.Api.Data;
using BugsManaged.Api.Entities;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BugsManaged.Api.Controllers;

[ApiController]
[Route("api/team")]
[Authorize]
public class TeamController : ControllerBase
{
    private readonly BugsManagedDbContext _db;

    public TeamController(BugsManagedDbContext db)
    {
        _db = db;
    }

    [HttpGet]
    public async Task<IActionResult> GetTeamMembers()
    {
        var orgId = long.Parse(User.FindFirstValue("organizationId")!);

        var members = await _db.Users
            .Where(u => u.OrganizationId == orgId)
            .OrderBy(u => u.FullName)
            .Select(u => new
            {
                u.Id,
                u.Email,
                u.FullName,
                u.Role,
                u.Specialty,
                u.CreatedAt
            })
            .ToListAsync();

        return Ok(members);
    }

    // Returns developers eligible to be assigned a ticket of the given category.
    // FULLSTACK devs always qualify; specialty devs only match their own category.
    // An empty category returns all developers (used for FULLSTACK tickets or manual triage).
    [HttpGet("developers")]
    public async Task<IActionResult> GetDevelopers([FromQuery] string? category)
    {
        var orgId = long.Parse(User.FindFirstValue("organizationId")!);

        var query = _db.Users.Where(u => u.OrganizationId == orgId && u.Role == "DEVELOPER");

        if (!string.IsNullOrEmpty(category) && category != "FULLSTACK")
            query = query.Where(u => u.Specialty == category || u.Specialty == "FULLSTACK");

        var devs = await query
            .OrderBy(u => u.FullName)
            .Select(u => new { u.Id, u.Email, u.FullName, u.Specialty })
            .ToListAsync();

        return Ok(devs);
    }

    [HttpPost("invite")]
    public async Task<IActionResult> InviteMember([FromBody] InviteRequest request)
    {
        var role = User.FindFirstValue(ClaimTypes.Role);
        if (role != "PLATFORM_ADMIN" && role != "PROJECT_ADMIN")
            return Forbid();

        if (await _db.Users.AnyAsync(u => u.Email == request.Email))
            return Conflict(new { message = "Email already registered" });

        var orgId = long.Parse(User.FindFirstValue("organizationId")!);

        var assignedRole = request.Role ?? "VIEWER";
        var user = new User
        {
            OrganizationId = orgId,
            Email = request.Email,
            Password = BCrypt.Net.BCrypt.HashPassword(request.Password),
            FullName = request.FullName,
            Role = assignedRole,
            Specialty = assignedRole == "DEVELOPER" ? request.Specialty : null
        };

        _db.Users.Add(user);
        await _db.SaveChangesAsync();

        return CreatedAtAction(nameof(GetTeamMembers), null, new
        {
            user.Id,
            user.Email,
            user.FullName,
            user.Role,
            user.Specialty,
            user.CreatedAt
        });
    }

    [HttpPut("{userId}/role")]
    public async Task<IActionResult> UpdateRole(long userId, [FromBody] UpdateRoleRequest request)
    {
        var role = User.FindFirstValue(ClaimTypes.Role);
        if (role != "PLATFORM_ADMIN" && role != "PROJECT_ADMIN")
            return Forbid();

        var orgId = long.Parse(User.FindFirstValue("organizationId")!);
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Id == userId && u.OrganizationId == orgId);
        if (user == null) return NotFound(new { message = "User not found" });

        user.Role = request.Role;
        if (request.Role == "DEVELOPER")
            user.Specialty = request.Specialty ?? user.Specialty;
        else
            user.Specialty = null;

        await _db.SaveChangesAsync();

        return Ok(new
        {
            user.Id,
            user.Email,
            user.FullName,
            user.Role,
            user.Specialty,
            user.CreatedAt
        });
    }

    [HttpDelete("{userId}")]
    public async Task<IActionResult> RemoveMember(long userId)
    {
        var role = User.FindFirstValue(ClaimTypes.Role);
        if (role != "PLATFORM_ADMIN" && role != "PROJECT_ADMIN")
            return Forbid();

        var currentUserId = long.Parse(User.FindFirstValue("userId")!);
        if (currentUserId == userId)
            return BadRequest(new { message = "Cannot remove yourself from the team" });

        var orgId = long.Parse(User.FindFirstValue("organizationId")!);
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Id == userId && u.OrganizationId == orgId);
        if (user == null) return NotFound(new { message = "User not found" });

        _db.Users.Remove(user);
        await _db.SaveChangesAsync();

        return NoContent();
    }

    public record InviteRequest(string Email, string FullName, string Password, string? Role, string? Specialty);
    public record UpdateRoleRequest(string Role, string? Specialty);
}
