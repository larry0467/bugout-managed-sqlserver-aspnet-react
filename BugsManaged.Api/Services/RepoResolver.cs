using BugsManaged.Api.Entities;

namespace BugsManaged.Api.Services;

// ---------------------------------------------------------------------------
// Resolves the (path, subpath, devBranch, githubOwner, githubRepo) bundle
// that the Claude sidecar needs to clone & PR against the right repo for
// a ticket.
//
// When multiple apps share one Bug Out project (using a single API key
// distinguished by tenantId), routing Claude to the right repo can't rely
// on project.GithubOwner/GithubRepo alone — those fields belong to one
// app. We look up by tenantId first via TenantRepoMap, then fall back to
// whatever the project itself has configured via the dashboard.
//
// Adding a tenant: insert a new row in TenantRepoMap below.
// ---------------------------------------------------------------------------

public sealed record RepoTarget(
    string Path,
    string Subpath,
    string DevBranch,
    string? GithubOwner,
    string? GithubRepo,
    // Prod-deploy wiring used by Approve & ship. When AutoPromoteOnApprove
    // is true, the API will call the sidecar's /promote endpoint to merge
    // DevBranch -> ProdBranch (and optionally tag the merge tip) the
    // moment the platform owner approves a Claude-completed ticket. Apps
    // with a real dev/beta tier (Service Managed et al.) leave this off
    // and rely on a separate promote-through-environments flow.
    string ProdBranch = "main",
    bool TagOnPromote = false,
    bool AutoPromoteOnApprove = false);

public static class RepoResolver
{
    // Default dev branch that Claude branches from and PRs into.
    private const string DefaultDevBranch = "dev";

    private static readonly Dictionary<string, RepoTarget> TenantRepoMap = new(StringComparer.OrdinalIgnoreCase)
    {
        // Example entry — replace with your actual tenantId + repo details.
        // ["my-app"] = new(
        //     Path: "https://github.com/your-org/my-app.git",
        //     Subpath: "",
        //     DevBranch: DefaultDevBranch,
        //     GithubOwner: "your-org",
        //     GithubRepo: "my-app"),
    };

    /// <summary>
    /// Resolve the repo target for a ticket. Looks up by tenantId first,
    /// then falls back to whatever's set on the project itself. Returns
    /// null when no source can produce a non-empty path — caller should
    /// 400 with a clear error.
    /// </summary>
    public static RepoTarget? Resolve(string? tenantId, Project project)
    {
        if (!string.IsNullOrWhiteSpace(tenantId)
            && TenantRepoMap.TryGetValue(tenantId, out var mapped))
        {
            return mapped;
        }

        if (string.IsNullOrWhiteSpace(project.RepoPath))
        {
            return null;
        }

        return new RepoTarget(
            Path: project.RepoPath,
            Subpath: project.RepoSubpath ?? "",
            DevBranch: string.IsNullOrEmpty(project.DevBranch) ? DefaultDevBranch : project.DevBranch,
            GithubOwner: project.GithubOwner,
            GithubRepo: project.GithubRepo);
    }
}
