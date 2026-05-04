using BugsManaged.Api.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BugsManaged.Api.Controllers;

[ApiController]
[Route("api/organizations")]
[Authorize(Roles = "PLATFORM_OWNER")]
public class OrganizationController : ControllerBase
{
    private readonly BugsManagedDbContext _db;

    public OrganizationController(BugsManagedDbContext db) => _db = db;

    [HttpPatch("{id}/billing-exempt")]
    public async Task<IActionResult> SetBillingExempt(long id, [FromBody] SetBillingExemptRequest request)
    {
        var org = await _db.Organizations.IgnoreQueryFilters().FirstOrDefaultAsync(o => o.Id == id);
        if (org == null) return NotFound(new { message = "Organization not found" });

        org.IsBillingExempt = request.Exempt;
        org.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        return Ok(new { org.Id, org.Name, org.Plan, org.IsBillingExempt });
    }

    [HttpPatch("{id}/plan")]
    public async Task<IActionResult> SetPlan(long id, [FromBody] SetPlanRequest request)
    {
        var validPlans = new[] { "FREE", "PRO", "ENTERPRISE" };
        if (!validPlans.Contains(request.Plan))
            return BadRequest(new { message = $"Plan must be one of: {string.Join(", ", validPlans)}" });

        var org = await _db.Organizations.IgnoreQueryFilters().FirstOrDefaultAsync(o => o.Id == id);
        if (org == null) return NotFound(new { message = "Organization not found" });

        org.Plan = request.Plan;
        org.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        return Ok(new { org.Id, org.Name, org.Plan, org.IsBillingExempt });
    }

    public record SetBillingExemptRequest(bool Exempt);
    public record SetPlanRequest(string Plan);
}
