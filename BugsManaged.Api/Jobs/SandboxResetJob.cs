using BugsManaged.Api.Services.Sandbox;
using Microsoft.Extensions.Options;

namespace BugsManaged.Api.Jobs;

// Hangfire recurring job: nightly midnight CT, wipes the Acme universe and
// re-seeds it. Hard-gated by Sandbox:Enabled — the job class is registered
// in DI in every environment so unit tests can resolve it, but the
// recurring schedule is only created when the flag is true (so dev/beta/
// prod stay untouched).
public class SandboxResetJob
{
    private readonly SandboxSeeder _seeder;
    private readonly IOptions<SandboxOptions> _options;
    private readonly ILogger<SandboxResetJob> _log;

    public SandboxResetJob(SandboxSeeder seeder, IOptions<SandboxOptions> options, ILogger<SandboxResetJob> log)
    {
        _seeder = seeder;
        _options = options;
        _log = log;
    }

    // Public + parameterless so Hangfire can serialize it as a job arg
    // (Hangfire builds an Expression from j => j.RunAsync()).
    public async Task RunAsync()
    {
        if (!_options.Value.Enabled)
        {
            // Belt-and-suspenders: even if a stale recurring entry survived
            // a config flip, the job no-ops in non-sandbox envs.
            _log.LogInformation("SandboxResetJob: skipped — Sandbox:Enabled is false");
            return;
        }

        var sw = System.Diagnostics.Stopwatch.StartNew();
        try
        {
            var result = await _seeder.ResetAsync(triggeredBy: "scheduler");
            _log.LogInformation(
                "SandboxResetJob: completed in {ElapsedMs}ms — {Bugs} bugs, {Users} users",
                sw.ElapsedMilliseconds, result.BugsInserted, result.UsersInserted);
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "SandboxResetJob: failed after {ElapsedMs}ms", sw.ElapsedMilliseconds);
            throw; // let Hangfire retry per its default policy
        }
    }
}

// Strongly-typed binding for the "Sandbox" config section.
public class SandboxOptions
{
    public bool Enabled { get; set; } = false;
    public string ResetCron { get; set; } = "0 0 * * *";
    public string TimeZone { get; set; } = "Central Standard Time";
}
