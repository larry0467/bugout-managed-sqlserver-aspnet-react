using System.Security.Claims;
using System.Text.Encodings.Web;
using BugsManaged.Api.Data;
using Microsoft.AspNetCore.Authentication;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace BugsManaged.Api.Services;

public class ServiceKeyAuthenticationOptions : AuthenticationSchemeOptions
{
}

// Authenticates the X-BOM-Service-Key header into a principal with role
// SERVICE and the key's organizationId claim. OrgResolutionMiddleware then
// scopes the request to that organization exactly as it does for a JWT.
//
// Registered as an additional scheme, not the default: a controller opts in
// with [Authorize(AuthenticationSchemes = ServiceKeys.DevelopmentSchemes)].
// The handler also refuses any path outside /api/development, so even a
// future controller that names the scheme by mistake cannot widen what a
// key can reach.
public class ServiceKeyAuthenticationHandler : AuthenticationHandler<ServiceKeyAuthenticationOptions>
{
    private readonly BugsManagedDbContext _db;

    public ServiceKeyAuthenticationHandler(
        IOptionsMonitor<ServiceKeyAuthenticationOptions> options,
        ILoggerFactory logger,
        UrlEncoder encoder,
        BugsManagedDbContext db)
        : base(options, logger, encoder)
    {
        _db = db;
    }

    protected override async Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        var raw = Request.Headers[ServiceKeys.HeaderName].FirstOrDefault();
        if (string.IsNullOrWhiteSpace(raw))
            return AuthenticateResult.NoResult();

        if (!ServiceKeys.IsAllowedPath(Request.Path))
        {
            Logger.LogWarning("Service key presented on {Path}; keys are accepted on /api/development only", Request.Path);
            return AuthenticateResult.Fail("Service keys are accepted only on /api/development endpoints");
        }

        raw = raw.Trim();
        if (!raw.StartsWith(ServiceKeys.Prefix, StringComparison.Ordinal))
            return AuthenticateResult.Fail("Invalid service key");

        var hash = ServiceKeys.Hash(raw);

        // No org context yet, so the global query filter would hide every row.
        var key = await _db.ServiceApiKeys.IgnoreQueryFilters()
            .FirstOrDefaultAsync(k => k.KeyHash == hash);

        if (key == null || !ServiceKeys.HashesMatch(key.KeyHash, hash))
        {
            Logger.LogWarning("Service key rejected: unknown key (prefix {Prefix})", ServiceKeys.DisplayPrefix(raw));
            return AuthenticateResult.Fail("Invalid service key");
        }

        if (key.RevokedAt != null)
        {
            Logger.LogWarning("Service key rejected: key {Id} ({Name}) was revoked at {RevokedAt:O}", key.Id, key.Name, key.RevokedAt);
            return AuthenticateResult.Fail("Service key has been revoked");
        }

        // LastUsedAt is informational; one write a minute per key is plenty
        // and keeps a busy session from issuing an UPDATE per request.
        var now = DateTime.UtcNow;
        if (key.LastUsedAt == null || now - key.LastUsedAt.Value > TimeSpan.FromMinutes(1))
        {
            key.LastUsedAt = now;
            try { await _db.SaveChangesAsync(); }
            catch (Exception ex) { Logger.LogWarning(ex, "Could not stamp LastUsedAt on service key {Id}", key.Id); }
        }

        var claims = new List<Claim>
        {
            new(ClaimTypes.Name, key.Name),
            new("fullName", key.Name),
            // CallerEmail() helpers across the API read the email claim; give
            // the key a stable, obviously-synthetic identity there.
            new(ClaimTypes.Email, $"service-key:{key.Id}"),
            new(ClaimTypes.Role, ServiceKeys.Role),
            new("organizationId", key.OrganizationId.ToString()),
            new(ServiceKeys.KeyIdClaim, key.Id.ToString()),
        };
        foreach (var scope in ServiceKeys.ParseScopes(key.Scopes))
            claims.Add(new Claim(ServiceKeys.ScopeClaim, scope));

        var identity = new ClaimsIdentity(claims, Scheme.Name);
        var ticket = new AuthenticationTicket(new ClaimsPrincipal(identity), Scheme.Name);
        return AuthenticateResult.Success(ticket);
    }
}
