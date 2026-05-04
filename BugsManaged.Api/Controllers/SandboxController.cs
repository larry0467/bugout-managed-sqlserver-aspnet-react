using System.Security.Claims;
using BugsManaged.Api.Data;
using BugsManaged.Api.Jobs;
using BugsManaged.Api.Services.Sandbox;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace BugsManaged.Api.Controllers;

// Sandbox admin + capabilities endpoints.
//
//   POST /api/admin/sandbox/reset   PLATFORM_OWNER, calls SandboxSeeder
//   GET  /api/admin/sandbox/status  PLATFORM_OWNER, banner data
//   GET  /api/system/capabilities   anonymous, drives the SANDBOX banner +
//                                   future feature flag rendering
//
// Capabilities is intentionally anonymous + always-on so the React shell
// can render the banner before the user has logged in. Returns false in
// every non-sandbox env, so dev/beta/prod just paint nothing.
[ApiController]
public class SandboxController : ControllerBase
{
    private readonly BugsManagedDbContext _db;
    private readonly SandboxSeeder _seeder;
    private readonly IOptions<SandboxOptions> _options;
    private readonly IConfiguration _config;

    public SandboxController(
        BugsManagedDbContext db,
        SandboxSeeder seeder,
        IOptions<SandboxOptions> options,
        IConfiguration config)
    {
        _db = db;
        _seeder = seeder;
        _options = options;
        _config = config;
    }

    [HttpPost("api/admin/sandbox/reset")]
    [Authorize(Roles = "PLATFORM_OWNER")]
    public async Task<IActionResult> Reset(CancellationToken ct)
    {
        if (!_options.Value.Enabled)
            return BadRequest(new { message = "Sandbox mode is not enabled in this environment." });

        var caller = User.FindFirstValue(ClaimTypes.Email) ?? "unknown";
        var log = await _seeder.ResetAsync(triggeredBy: caller, ct);

        return Ok(new
        {
            resetAt = log.OccurredAtUtc,
            bugsInserted = log.BugsInserted,
            usersInserted = log.UsersInserted,
        });
    }

    [HttpGet("api/admin/sandbox/status")]
    [Authorize(Roles = "PLATFORM_OWNER")]
    public async Task<IActionResult> Status()
    {
        var last = await _db.SandboxResetLogs
            .IgnoreQueryFilters()
            .OrderByDescending(l => l.OccurredAtUtc)
            .FirstOrDefaultAsync();

        return Ok(new
        {
            enabled = _options.Value.Enabled,
            lastResetAt = last?.OccurredAtUtc,
            lastResetBy = last?.TriggeredBy,
            nextScheduledResetAt = ComputeNextMidnightCt(),
        });
    }

    [HttpGet("api/system/capabilities")]
    [AllowAnonymous]
    public IActionResult Capabilities()
    {
        // anthropicEnabled is true when either the in-process key is
        // populated (legacy v1 path) or the sidecar URL is configured
        // (current path). Sandbox tier deliberately leaves both empty
        // so the demo never emits real Anthropic spend — see the
        // separate "Anthropic:Mode = Real" wiring task.
        var anthropicKey = _config["BugOutManaged:Anthropic:ApiKey"];
        var sidecarUrl = _config["BugsManaged:ClaudeAgentSidecar:Url"];
        var sidecarKey = _config["BugsManaged:ClaudeAgentSidecar:ApiKey"];
        var anthropicEnabled =
            !string.IsNullOrWhiteSpace(anthropicKey)
            || (!string.IsNullOrWhiteSpace(sidecarUrl) && !string.IsNullOrWhiteSpace(sidecarKey));

        return Ok(new
        {
            sandboxMode = _options.Value.Enabled,
            anthropicEnabled,
        });
    }

    // Returns the next midnight in the configured TimeZone, expressed in UTC,
    // so the UI can render a single ISO timestamp without doing TZ math.
    private DateTime ComputeNextMidnightCt()
    {
        TimeZoneInfo tz;
        try { tz = TimeZoneInfo.FindSystemTimeZoneById(_options.Value.TimeZone); }
        catch (TimeZoneNotFoundException) { tz = TimeZoneInfo.Utc; }
        catch (InvalidTimeZoneException) { tz = TimeZoneInfo.Utc; }

        var nowLocal = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, tz);
        var nextMidnightLocal = nowLocal.Date.AddDays(1);
        return TimeZoneInfo.ConvertTimeToUtc(nextMidnightLocal, tz);
    }
}
