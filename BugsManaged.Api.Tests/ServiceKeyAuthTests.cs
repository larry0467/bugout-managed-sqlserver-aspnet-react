using System.Security.Claims;
using System.Text.Encodings.Web;
using BugsManaged.Api.Entities;
using BugsManaged.Api.Services;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace BugsManaged.Api.Tests;

// The X-BOM-Service-Key scheme: a valid key becomes a SERVICE principal
// carrying the key's organization, and it only works on /api/development.
public class ServiceKeyAuthTests
{
    private const long OrgId = 42;

    private static async Task<(ServiceKeyAuthenticationHandler handler, DefaultHttpContext ctx, string raw, ServiceApiKey key)> Build(
        string path, string? scopes = "development:write", bool revoked = false, string? headerOverride = null)
    {
        var org = new TestDoubles.TestOrgContext(); // no org resolved yet, as in the real pipeline
        var db = TestDoubles.NewInMemoryDb(org);

        var raw = ServiceKeys.Generate();
        var key = new ServiceApiKey
        {
            OrganizationId = OrgId,
            Name = "Claude Code - test",
            KeyHash = ServiceKeys.Hash(raw),
            KeyPrefix = ServiceKeys.DisplayPrefix(raw),
            Scopes = scopes ?? string.Empty,
            RevokedAt = revoked ? DateTime.UtcNow.AddMinutes(-1) : null,
        };
        db.ServiceApiKeys.Add(key);
        db.SaveChanges();

        var handler = new ServiceKeyAuthenticationHandler(
            new StaticOptionsMonitor(new ServiceKeyAuthenticationOptions()),
            NullLoggerFactory.Instance,
            UrlEncoder.Default,
            db);

        var ctx = new DefaultHttpContext();
        ctx.Request.Path = path;
        ctx.Request.Headers[ServiceKeys.HeaderName] = headerOverride ?? raw;

        await handler.InitializeAsync(
            new AuthenticationScheme(ServiceKeys.Scheme, null, typeof(ServiceKeyAuthenticationHandler)), ctx);

        return (handler, ctx, raw, key);
    }

    [Fact]
    public async Task ValidKey_OnDevelopmentPath_AuthenticatesAsServiceForTheKeysOrg()
    {
        var (handler, _, _, key) = await Build("/api/development/orders");

        var result = await handler.AuthenticateAsync();

        Assert.True(result.Succeeded, result.Failure?.Message);
        var principal = result.Principal!;
        Assert.True(principal.IsInRole(ServiceKeys.Role));
        Assert.Equal(OrgId.ToString(), principal.FindFirstValue("organizationId"));
        Assert.Equal("Claude Code - test", principal.FindFirstValue(ClaimTypes.Name));
        Assert.Equal("Claude Code - test", principal.FindFirstValue("fullName"));
        Assert.True(principal.HasClaim(ServiceKeys.ScopeClaim, ServiceKeys.ScopeDevelopmentWrite));
        Assert.Equal(key.Id.ToString(), principal.FindFirstValue(ServiceKeys.KeyIdClaim));
    }

    [Fact]
    public async Task ValidKey_OutsideDevelopmentPath_IsRefused()
    {
        var (handler, _, _, _) = await Build("/api/tickets");

        var result = await handler.AuthenticateAsync();

        Assert.False(result.Succeeded);
        Assert.NotNull(result.Failure);
        Assert.Contains("/api/development", result.Failure!.Message);
    }

    [Fact]
    public async Task ValidKey_OnServiceKeyManagement_IsRefused()
    {
        // A leaked key must not be able to mint more keys.
        var (handler, _, _, _) = await Build("/api/service-keys");
        var result = await handler.AuthenticateAsync();
        Assert.False(result.Succeeded);
    }

    [Fact]
    public async Task RevokedKey_IsRefused()
    {
        var (handler, _, _, _) = await Build("/api/development/orders", revoked: true);
        var result = await handler.AuthenticateAsync();
        Assert.False(result.Succeeded);
        Assert.Contains("revoked", result.Failure!.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task UnknownKey_IsRefused()
    {
        var (handler, _, _, _) = await Build("/api/development/orders", headerOverride: ServiceKeys.Generate());
        var result = await handler.AuthenticateAsync();
        Assert.False(result.Succeeded);
    }

    [Fact]
    public async Task NoHeader_IsNoResult_SoBearerStillWorks()
    {
        var (handler, ctx, _, _) = await Build("/api/development/orders");
        ctx.Request.Headers.Remove(ServiceKeys.HeaderName);

        var result = await handler.AuthenticateAsync();

        Assert.False(result.Succeeded);
        Assert.True(result.None);
    }

    [Fact]
    public async Task SuccessfulAuth_StampsLastUsedAt()
    {
        var (handler, _, _, key) = await Build("/api/development/orders");
        Assert.Null(key.LastUsedAt);

        await handler.AuthenticateAsync();

        Assert.NotNull(key.LastUsedAt);
    }

    [Fact]
    public void Generate_ProducesPrefixedUrlSafeKeys_AndStableHashes()
    {
        var a = ServiceKeys.Generate();
        var b = ServiceKeys.Generate();

        Assert.StartsWith(ServiceKeys.Prefix, a);
        Assert.NotEqual(a, b);
        Assert.DoesNotContain("+", a);
        Assert.DoesNotContain("/", a);
        Assert.DoesNotContain("=", a);
        Assert.Equal(64, ServiceKeys.Hash(a).Length);
        Assert.Equal(ServiceKeys.Hash(a), ServiceKeys.Hash(a));
        Assert.True(ServiceKeys.HashesMatch(ServiceKeys.Hash(a), ServiceKeys.Hash(a)));
        Assert.False(ServiceKeys.HashesMatch(ServiceKeys.Hash(a), ServiceKeys.Hash(b)));
    }

    private sealed class StaticOptionsMonitor : IOptionsMonitor<ServiceKeyAuthenticationOptions>
    {
        private readonly ServiceKeyAuthenticationOptions _value;
        public StaticOptionsMonitor(ServiceKeyAuthenticationOptions value) => _value = value;
        public ServiceKeyAuthenticationOptions CurrentValue => _value;
        public ServiceKeyAuthenticationOptions Get(string? name) => _value;
        public IDisposable? OnChange(Action<ServiceKeyAuthenticationOptions, string?> listener) => null;
    }
}
