using System.Security.Claims;
using BugsManaged.Api.Data;
using BugsManaged.Api.Entities;
using BugsManaged.Api.Services;
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
    private readonly IOrgContext _org;

    public TeamController(BugsManagedDbContext db, IOrgContext org)
    {
        _db = db;
        _org = org;
    }

    [HttpGet]
    public async Task<IActionResult> GetTeamMembers()
    {
        // Global query filter already scopes to the current org — no
        // manual .Where needed.
        var members = await _db.Users
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
        // PLATFORM_OWNER users can also develop — include them, treating a null
        // Specialty as FULLSTACK (they qualify for any category).
        var query = _db.Users.Where(u => u.Role == "DEVELOPER" || u.Role == "PLATFORM_OWNER");

        if (!string.IsNullOrEmpty(category) && category != "FULLSTACK")
            query = query.Where(u =>
                u.Specialty == category ||
                u.Specialty == "FULLSTACK" ||
                u.Specialty == null);  // PLATFORM_OWNER with no specialty → qualifies for all

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
        if (role != "PLATFORM_OWNER" && role != "SUPER_ADMIN")
            return Forbid();

        if (_org.CurrentOrganizationId == null)
            return Unauthorized();

        // Email uniqueness is global, not org-scoped, so bypass the filter.
        if (await _db.Users.IgnoreQueryFilters().AnyAsync(u => u.Email == request.Email))
            return Conflict(new { message = "Email already registered" });

        var assignedRole = request.Role ?? "VIEWER";
        var user = new User
        {
            OrganizationId = _org.CurrentOrganizationId.Value,
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
        if (role != "PLATFORM_OWNER" && role != "SUPER_ADMIN")
            return Forbid();

        var user = await _db.Users.FirstOrDefaultAsync(u => u.Id == userId);
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
        if (role != "PLATFORM_OWNER" && role != "SUPER_ADMIN")
            return Forbid();

        var currentUserIdClaim = User.FindFirstValue("userId");
        if (long.TryParse(currentUserIdClaim, out var currentUserId) && currentUserId == userId)
            return BadRequest(new { message = "Cannot remove yourself from the team" });

        var user = await _db.Users.FirstOrDefaultAsync(u => u.Id == userId);
        if (user == null) return NotFound(new { message = "User not found" });

        _db.Users.Remove(user);
        await _db.SaveChangesAsync();

        return NoContent();
    }

    public record InviteRequest(string Email, string FullName, string Password, string? Role, string? Specialty);
    public record UpdateRoleRequest(string Role, string? Specialty);
}
