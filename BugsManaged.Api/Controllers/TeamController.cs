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
            .Include(u => u.ProjectAssignments)
            .OrderBy(u => u.FullName)
            .Select(u => new
            {
                u.Id,
                u.Email,
                u.FullName,
                u.Role,
                u.Specialty,
                u.CreatedAt,
                projectIds = u.ProjectAssignments.Select(a => a.ProjectId).ToList()
            })
            .ToListAsync();

        return Ok(members);
    }

    // Returns developers eligible to be assigned a ticket of the given category
    // and/or project. FULLSTACK devs always qualify for any category; specialty
    // devs only match their own category. Devs with no project assignments
    // qualify for all projects; those with assignments must include the given
    // projectId. An empty category returns all developers.
    [HttpGet("developers")]
    public async Task<IActionResult> GetDevelopers([FromQuery] string? category, [FromQuery] long? projectId)
    {
        // PLATFORM_OWNER users can also develop — include them, treating a null
        // Specialty as FULLSTACK (they qualify for any category).
        var query = _db.Users
            .Include(u => u.ProjectAssignments)
            .Where(u => u.Role == "DEVELOPER" || u.Role == "PLATFORM_OWNER");

        if (!string.IsNullOrEmpty(category) && category != "FULLSTACK")
            query = query.Where(u =>
                u.Specialty == category ||
                u.Specialty == "FULLSTACK" ||
                u.Specialty == null);  // PLATFORM_OWNER with no specialty → qualifies for all

        // No project rows = assigned to all projects; otherwise must include this project.
        if (projectId.HasValue)
            query = query.Where(u =>
                !u.ProjectAssignments.Any() ||
                u.ProjectAssignments.Any(a => a.ProjectId == projectId.Value));

        var devs = await query
            .OrderBy(u => u.FullName)
            .Select(u => new
            {
                u.Id,
                u.Email,
                u.FullName,
                u.Specialty,
                projectIds = u.ProjectAssignments.Select(a => a.ProjectId).ToList()
            })
            .ToListAsync();

        return Ok(devs);
    }

    // GET /api/team/{userId}/projects — returns assigned project IDs (empty = All)
    [HttpGet("{userId}/projects")]
    public async Task<IActionResult> GetUserProjects(long userId)
    {
        var role = User.FindFirstValue(ClaimTypes.Role);
        if (role != "PLATFORM_OWNER" && role != "SUPER_ADMIN") return Forbid();
        var ids = await _db.UserProjectAssignments
            .Where(a => a.UserId == userId)
            .Select(a => a.ProjectId)
            .ToListAsync();
        return Ok(ids);
    }

    // PUT /api/team/{userId}/projects — replace all assignments. Empty array = All.
    [HttpPut("{userId}/projects")]
    public async Task<IActionResult> SetUserProjects(long userId, [FromBody] List<long> projectIds)
    {
        var role = User.FindFirstValue(ClaimTypes.Role);
        if (role != "PLATFORM_OWNER" && role != "SUPER_ADMIN") return Forbid();

        var existing = await _db.UserProjectAssignments
            .Where(a => a.UserId == userId).ToListAsync();
        _db.UserProjectAssignments.RemoveRange(existing);

        foreach (var pid in projectIds.Distinct())
            _db.UserProjectAssignments.Add(new UserProjectAssignment { UserId = userId, ProjectId = pid });

        await _db.SaveChangesAsync();
        return NoContent();
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
        if (request.Role == "DEVELOPER" || request.Role == "PLATFORM_OWNER")
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
