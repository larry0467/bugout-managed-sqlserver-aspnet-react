using BugsManaged.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BugsManaged.Api.Controllers;

// Performance dashboard endpoint. Scores every actor in the escalation
// chain, including the platform owner himself — this was an explicit ask
// from the platform owner so accountability runs both ways.
//
// Tenant-scoped via the existing IOrgContext / global query filter pattern;
// the PerformanceService just calls into the supplied DbContext.
[ApiController]
[Route("api/dashboard")]
[Authorize]
public class DashboardController : ControllerBase
{
    private readonly PerformanceService _service;

    public DashboardController(PerformanceService service)
    {
        _service = service;
    }

    [HttpGet("performance")]
    public async Task<IActionResult> GetPerformance(
        [FromQuery] long? projectId,
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to,
        [FromQuery] string? priority,
        CancellationToken ct)
    {
        var payload = await _service.BuildAsync(projectId, from, to, priority, ct);
        return Ok(payload);
    }
}
