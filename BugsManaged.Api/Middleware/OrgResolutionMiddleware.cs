using System.Security.Claims;
using BugsManaged.Api.Data;
using BugsManaged.Api.Services;
using Microsoft.EntityFrameworkCore;

namespace BugsManaged.Api.Middleware;

// Resolves the caller's organization (and optionally the host project) before
// controllers or EF query filters run. Mirrors Comms Managed's
// TenantResolutionMiddleware.
//
// Order of precedence:
//   1. If the request carries X-BOM-API-Key, look up the Project and set
//      both the project and the org. This is the widget path — anonymous,
//      no JWT, but the project's API key tells us who's reporting.
//   2. Otherwise, if the request is JWT-authenticated and has an
//      "organizationId" claim, set the org from the claim. This is the
//      admin UI path.
//   3. Otherwise, let the request through with no org set. Controllers that
//      need auth still have [Authorize], and controllers that query org-
//      scoped tables will get an empty result set because the query filter
//      evaluates to `x.OrganizationId == null` (i.e., no match).
//
// Paths that bypass resolution (auth bootstrap, openapi, etc) are listed in
// BypassPaths so we don't block register/login.
public class OrgResolutionMiddleware
{
    private readonly RequestDelegate _next;

    private static readonly string[] BypassPaths = new[]
    {
        "/api/auth/register",
        "/api/auth/login",
        "/api/slack", // Slack webhook is anonymous; tenant resolved from bot token inside the handler
        "/openapi",
    };

    public OrgResolutionMiddleware(RequestDelegate next) => _next = next;

    public async Task InvokeAsync(HttpContext ctx, BugsManagedDbContext db, IOrgContext org)
    {
        var path = ctx.Request.Path.Value ?? "";

        if (BypassPaths.Any(b => path.StartsWith(b, StringComparison.OrdinalIgnoreCase)))
        {
            await _next(ctx);
            return;
        }

        if (!path.StartsWith("/api/", StringComparison.OrdinalIgnoreCase))
        {
            await _next(ctx);
            return;
        }

        // Widget path: API key in header -> look up Project and set both.
        var apiKey = ctx.Request.Headers["X-BOM-API-Key"].FirstOrDefault();
        if (!string.IsNullOrWhiteSpace(apiKey))
        {
            var project = await db.Projects.IgnoreQueryFilters()
                .FirstOrDefaultAsync(p => p.ApiKey == apiKey);
            if (project == null)
            {
                ctx.Response.StatusCode = 401;
                await ctx.Response.WriteAsJsonAsync(new { message = "Invalid API key" });
                return;
            }
            org.SetProject(project.Id, project.Name, project.OrganizationId);
            await _next(ctx);
            return;
        }

        // Admin path: JWT with organizationId claim.
        var orgIdClaim = ctx.User.FindFirstValue("organizationId");
        if (long.TryParse(orgIdClaim, out var orgId))
        {
            org.SetOrganization(orgId);
        }

        await _next(ctx);
    }
}
