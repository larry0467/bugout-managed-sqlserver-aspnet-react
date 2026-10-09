using System.Security.Cryptography;
using System.Text;

namespace BugsManaged.Api.Services;

// Helpers shared by the ServiceKeyController (which mints keys) and the
// ServiceKeyAuthenticationHandler (which checks them).
public static class ServiceKeys
{
    public const string HeaderName = "X-BOM-Service-Key";
    public const string Prefix = "bsk_";

    // Authentication scheme name, and the scheme list the development
    // controllers accept: a user JWT or a service key.
    public const string Scheme = "ServiceKey";
    public const string DevelopmentSchemes = "Bearer," + Scheme;

    // The role a service-key principal carries. Never granted to a user.
    public const string Role = "SERVICE";

    public const string ScopeClaim = "scope";
    public const string KeyIdClaim = "serviceKeyId";
    public const string ScopeDevelopmentRead = "development:read";
    public const string ScopeDevelopmentWrite = "development:write";
    public static readonly string[] KnownScopes = { ScopeDevelopmentRead, ScopeDevelopmentWrite };

    // Only these routes honour a service key. A key that leaks can log and
    // move development orders; it cannot read bug reports, manage users or
    // mint other keys.
    public static bool IsAllowedPath(PathString path) =>
        path.StartsWithSegments("/api/development", StringComparison.OrdinalIgnoreCase);

    // 32 random bytes, base64url, behind a recognisable prefix so a key in a
    // log line or a chat window is obviously a secret.
    public static string Generate()
    {
        var bytes = RandomNumberGenerator.GetBytes(32);
        var b64 = Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
        return Prefix + b64;
    }

    public static string Hash(string rawKey) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(rawKey))).ToLowerInvariant();

    public static string DisplayPrefix(string rawKey) =>
        rawKey.Length <= 12 ? rawKey : rawKey[..12];

    public static bool HashesMatch(string storedHash, string candidateHash)
    {
        var a = Encoding.ASCII.GetBytes(storedHash);
        var b = Encoding.ASCII.GetBytes(candidateHash);
        return a.Length == b.Length && CryptographicOperations.FixedTimeEquals(a, b);
    }

    public static string[] ParseScopes(string? csv) =>
        (csv ?? string.Empty)
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(s => s.ToLowerInvariant())
            .Distinct()
            .ToArray();
}
