namespace BugsManaged.Api.Services;

// The development-order pipeline. Ordered: a later stage has a higher index,
// which the board uses to sort and the digest uses to decide what "reached
// production" means. Plain strings on the ticket (Ticket.DevelopmentStage),
// same convention as Ticket.Status and Ticket.EscalationStage.
public static class DevelopmentStages
{
    public const string Ordered = "ORDERED";
    public const string InProgress = "IN_PROGRESS";
    public const string LocalDemo = "LOCAL_DEMO";
    public const string PrOpen = "PR_OPEN";
    public const string MergedDev = "MERGED_DEV";
    public const string Beta = "BETA";
    public const string Production = "PRODUCTION";
    public const string Announced = "ANNOUNCED";

    public static readonly string[] All =
    {
        Ordered, InProgress, LocalDemo, PrOpen, MergedDev, Beta, Production, Announced,
    };

    public static readonly IReadOnlyDictionary<string, string> Labels = new Dictionary<string, string>
    {
        [Ordered] = "Ordered",
        [InProgress] = "In progress",
        [LocalDemo] = "Local demo",
        [PrOpen] = "PR open",
        [MergedDev] = "Merged to dev",
        [Beta] = "Beta",
        [Production] = "Production",
        [Announced] = "Announced",
    };

    public static bool IsValid(string? stage) =>
        stage != null && Array.IndexOf(All, stage) >= 0;

    public static string? Normalize(string? stage)
    {
        if (string.IsNullOrWhiteSpace(stage)) return null;
        var key = stage.Trim().ToUpperInvariant().Replace(' ', '_').Replace('-', '_');
        return IsValid(key) ? key : null;
    }

    public static int OrderOf(string? stage)
    {
        var i = stage == null ? -1 : Array.IndexOf(All, stage);
        return i < 0 ? 0 : i;
    }

    public static bool IsAtOrPast(string? stage, string threshold) =>
        IsValid(stage) && OrderOf(stage) >= OrderOf(threshold);

    // The ticket Status the bug board should show for an order at a given
    // stage. Applied only when the org's status dictionary has that key, so
    // a renamed or deleted status never breaks a stage move.
    public static string? StatusFor(string stage) => stage switch
    {
        Ordered => "OPEN",
        InProgress or LocalDemo => "IN_PROGRESS",
        PrOpen or MergedDev => "IN_REVIEW",
        Beta => "READY_FOR_TESTING",
        Production or Announced => "RESOLVED",
        _ => null,
    };
}

// Lifecycle of a drafted fix (Ticket.FixStatus). The dispatcher on the devbox
// moves REQUESTED -> CLAIMED -> READY_TO_TEST | FAILED; a human moves
// READY_TO_TEST -> APPROVED | REJECTED (and REJECTED may go back to REQUESTED).
public static class FixStatuses
{
    public const string Requested = "REQUESTED";
    public const string Claimed = "CLAIMED";
    public const string ReadyToTest = "READY_TO_TEST";
    public const string Failed = "FAILED";
    public const string Approved = "APPROVED";
    public const string Rejected = "REJECTED";

    public static readonly string[] All = { Requested, Claimed, ReadyToTest, Failed, Approved, Rejected };

    public static readonly IReadOnlyDictionary<string, string> Labels = new Dictionary<string, string>
    {
        [Requested] = "Fix requested",
        [Claimed] = "Claude is working on it",
        [ReadyToTest] = "Fix ready to test",
        [Failed] = "Fix attempt failed",
        [Approved] = "Fix approved",
        [Rejected] = "Fix rejected",
    };

    public static string? Normalize(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var key = value.Trim().ToUpperInvariant().Replace(' ', '_').Replace('-', '_');
        return Array.IndexOf(All, key) >= 0 ? key : null;
    }
}

// Bound from the "DevelopmentTracker" configuration section. Every setting
// has a default so an unconfigured environment still runs the board; only
// the digest recipients need a real value (and they fall back to the org's
// PLATFORM_OWNER users when empty).
public class DevelopmentTrackerOptions
{
    public const string SectionName = "DevelopmentTracker";

    // Local hour (0-23) after which the day's production digest goes out.
    public int DigestHourLocal { get; set; } = 17;

    // Windows or IANA id. Resolved with a fallback chain, see ResolveTimeZone.
    public string TimeZone { get; set; } = "Central Standard Time";

    // Comma-separated emails. Empty = every PLATFORM_OWNER in the org.
    public string DigestRecipients { get; set; } = string.Empty;

    public bool DigestEnabled { get; set; } = true;

    public int DigestPollMinutes { get; set; } = 10;

    // Where the board lives, for the links in the digest email. Falls back to
    // BugsManaged:DashboardBaseUrl at startup when empty.
    public string BoardBaseUrl { get; set; } = string.Empty;

    // ----- Azure DevOps webhook (POST /api/development/webhooks/azure-devops) -----

    // Repository name -> application slug, for PRs the webhook sees before any
    // session logged an order ("the team's own work"). Repos not listed here are
    // still matched when an existing order already links that repo.
    public Dictionary<string, string> RepoProjects { get; set; } = new(StringComparer.OrdinalIgnoreCase)
    {
        ["ServiceManagerUI"] = "service-managed",
        ["ServiceManagedWeb"] = "service-managed",
    };

    // Target branch of a completed PR -> stage the order moves to.
    public Dictionary<string, string> BranchStages { get; set; } = new(StringComparer.OrdinalIgnoreCase)
    {
        ["dev"] = DevelopmentStages.MergedDev,
        ["develop"] = DevelopmentStages.MergedDev,
        ["beta"] = DevelopmentStages.Beta,
        ["staging"] = DevelopmentStages.Beta,
        ["demo"] = DevelopmentStages.Beta,
        ["master"] = DevelopmentStages.Production,
        ["main"] = DevelopmentStages.Production,
        ["prod"] = DevelopmentStages.Production,
        ["production"] = DevelopmentStages.Production,
    };

    // Keyword in a release environment / pipeline stage name -> stage reached
    // by every order of that application that was waiting for it.
    public Dictionary<string, string> DeployEnvironments { get; set; } = new(StringComparer.OrdinalIgnoreCase)
    {
        ["beta"] = DevelopmentStages.Beta,
        ["demo"] = DevelopmentStages.Beta,
        ["staging"] = DevelopmentStages.Beta,
        ["qa"] = DevelopmentStages.Beta,
        ["prod"] = DevelopmentStages.Production,
        ["production"] = DevelopmentStages.Production,
        ["live"] = DevelopmentStages.Production,
    };

    // Keyword in a release definition / pipeline name -> application slug, for
    // deployments whose payload does not name a repository.
    public Dictionary<string, string> PipelineProjects { get; set; } = new(StringComparer.OrdinalIgnoreCase)
    {
        ["ServiceManager"] = "service-managed",
        ["ServiceManaged"] = "service-managed",
    };

    public TimeZoneInfo ResolveTimeZone() => ResolveTimeZone(TimeZone);

    public static TimeZoneInfo ResolveTimeZone(string? id)
    {
        foreach (var candidate in Candidates(id))
        {
            try { return TimeZoneInfo.FindSystemTimeZoneById(candidate); }
            catch (TimeZoneNotFoundException) { }
            catch (InvalidTimeZoneException) { }
        }
        return TimeZoneInfo.Utc;
    }

    private static IEnumerable<string> Candidates(string? id)
    {
        if (!string.IsNullOrWhiteSpace(id))
        {
            yield return id;
            // The container runs on Linux (IANA ids) and the devbox on Windows;
            // try the other naming so one config value works in both places.
            if (TimeZoneInfo.TryConvertWindowsIdToIanaId(id, out var iana)) yield return iana;
            if (TimeZoneInfo.TryConvertIanaIdToWindowsId(id, out var windows)) yield return windows;
        }
        yield return "America/Chicago";
        yield return "Central Standard Time";
    }
}
