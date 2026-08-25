using System.Collections.Concurrent;
using System.Text.Json;
using System.Text.Json.Serialization;
using BugsManaged.Api.Data;
using Google.Apis.Auth.OAuth2;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace BugsManaged.Api.Services.GoogleChat;

/// <summary>
/// A bearer token for the Chat REST API, per organization.
///
/// The API client needs nothing more than this, so it depends on the narrow
/// interface rather than the credential machinery — which also means the wrapper
/// can be unit-tested against a stub token instead of reaching out to Google's
/// token endpoint.
/// </summary>
public interface IGoogleChatTokenSource
{
    /// <summary>
    /// A token carrying exactly <paramref name="scopes"/>, or null when no
    /// credential is configured for this organization.
    ///
    /// Scopes are per call rather than one set for the whole client: Chat rejects
    /// some app-auth scope combinations on a single token, so each operation asks
    /// only for what it needs.
    /// </summary>
    Task<string?> GetAccessTokenAsync(long? organizationId, string[] scopes, CancellationToken ct = default);

    Task<bool> IsConfiguredAsync(long? organizationId);
}

/// <summary>
/// The GCP project numbers an inbound Chat request may legitimately be audienced
/// to.
///
/// A set rather than one value, because at verification time we have not parsed
/// the payload yet and so do not know which organization the event belongs to —
/// that is only learned from the Space afterwards. So the audience is checked
/// against every project number this deployment knows about: the config-wide
/// fallback plus one per active service-account row.
/// </summary>
public interface IGoogleChatAudienceSource
{
    Task<IReadOnlyCollection<string>> GetTrustedAudiencesAsync(CancellationToken ct = default);
}

/// <summary>
/// Turns whatever credential source is available into a scoped
/// <see cref="ServiceAccountCredential"/> that can mint bearer tokens for the
/// Chat REST API.
///
/// Precedence, per Task 6 (key never in source control):
///   1. GoogleChatOptions.ServiceAccountJson  — inline, from Key Vault
///   2. GoogleChatOptions.ServiceAccountJsonPath — a mounted key file
///   3. the organization's GoogleServiceAccounts row, then the row with no
///      organization set as a shared default
///
/// Singleton, so it holds no DbContext: the DB lookup opens its own scope.
/// Credentials are cached per organization once they resolve, so the common path
/// costs nothing after the first call. A key rotated in place needs a restart;
/// a key *added* is picked up on the next call, because failures are not cached.
/// </summary>
public class GoogleChatCredentialProvider : IGoogleChatTokenSource, IGoogleChatAudienceSource
{
    private readonly IServiceScopeFactory _scopes;
    private readonly GoogleChatOptions _options;
    private readonly ServiceAccountDefaults _defaults;
    private readonly ILogger<GoogleChatCredentialProvider> _log;
    private readonly string? _staticJson;

    private readonly ConcurrentDictionary<string, ITokenAccess> _cache = new();

    public GoogleChatCredentialProvider(
        IServiceScopeFactory scopes,
        IOptions<GoogleChatOptions> options,
        IConfiguration config,
        ILogger<GoogleChatCredentialProvider> log)
    {
        _scopes = scopes;
        _options = options.Value;
        _log = log;

        _defaults = config.GetSection("GoogleServiceAccount").Get<ServiceAccountDefaults>()
                    ?? new ServiceAccountDefaults();

        if (!string.IsNullOrWhiteSpace(_options.ServiceAccountJson))
        {
            _staticJson = _options.ServiceAccountJson;
        }
        else if (!string.IsNullOrWhiteSpace(_options.ServiceAccountJsonPath))
        {
            try
            {
                _staticJson = File.ReadAllText(_options.ServiceAccountJsonPath);
            }
            catch (Exception ex)
            {
                // A misconfigured path is a startup problem, not a per-request
                // one: log it once and fall through to the DB lookup.
                _log.LogError(ex, "Could not read the Google Chat service account key from {Path}",
                    _options.ServiceAccountJsonPath);
            }
        }
    }

    /// <summary>
    /// A scoped token source for this organization, or null when no credential
    /// is configured. Callers treat null as "Chat is not available" and fall
    /// back to email.
    ///
    /// Returns <see cref="ITokenAccess"/> rather than the concrete credential
    /// because minting a bearer token is the only thing the REST client needs,
    /// and CreateScoped on a GoogleCredential is the supported way to apply
    /// scopes — rebuilding a ServiceAccountCredential by hand to re-scope it
    /// means round-tripping the private key, which is both fragile and
    /// needless.
    /// </summary>
    public async Task<ITokenAccess?> GetCredentialAsync(
        long? organizationId, string[] scopes)
    {
        if (!_options.Enabled) return null;

        // Cached per (organization, scope set): one credential per purpose, so a
        // spaces.create token never carries message scopes and vice versa.
        var key = $"{organizationId?.ToString() ?? "default"}|{string.Join(' ', scopes)}";
        if (_cache.TryGetValue(key, out var cached)) return cached;

        var json = await ResolveKeyJsonAsync(organizationId);
        if (json == null) return null;

        try
        {
            // CredentialFactory, not the deprecated GoogleCredential.FromJson:
            // it refuses to build anything but the credential type asked for, so
            // a malformed key cannot quietly become a different auth flow.
            var serviceAccount = CredentialFactory.FromJson<ServiceAccountCredential>(json)
                ?? throw new InvalidOperationException("Not a valid service account key.");

            var scoped = serviceAccount.ToGoogleCredential().CreateScoped(scopes);
            return _cache.GetOrAdd(key, scoped);
        }
        catch (Exception ex)
        {
            _log.LogError(ex,
                "Google Chat service account for organization {Org} could not be used — check the " +
                "private key and client email", organizationId);
            return null;
        }
    }

    /// <summary>
    /// Whether a usable credential exists for this organization. Used by the
    /// chat-status endpoint and by the notifier before it queues work. Asks for
    /// the message scope, since that is the one every deployment needs.
    /// </summary>
    public async Task<bool> IsConfiguredAsync(long? organizationId)
        => await GetCredentialAsync(organizationId, _options.MessageScopes) != null;

    /// <summary>
    /// Every project number an inbound Chat request may be audienced to: the
    /// config-wide fallback plus one per active service-account row.
    ///
    /// Not cached — it is read once per inbound event, which is cheap against an
    /// indexed table, and caching would mean a newly added tenant's replies were
    /// rejected until a restart.
    /// </summary>
    public async Task<IReadOnlyCollection<string>> GetTrustedAudiencesAsync(CancellationToken ct = default)
    {
        var audiences = new HashSet<string>(StringComparer.Ordinal);

        AddIfProjectNumber(audiences, _options.ProjectNumber, "GoogleChat:ProjectNumber");

        try
        {
            using var scope = _scopes.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<BugsManagedDbContext>();

            var fromDb = await db.GoogleServiceAccounts
                .Where(a => a.IsActive && a.ProjectNumber != null && a.ProjectNumber != "")
                .Select(a => new { a.Id, a.ProjectNumber })
                .ToListAsync(ct);

            foreach (var row in fromDb)
                AddIfProjectNumber(audiences, row.ProjectNumber, $"GoogleServiceAccounts.Id={row.Id}");
        }
        catch (Exception ex)
        {
            // A DB blip must not silently widen what we trust. The config value
            // (if any) still stands; with none, verification fails closed.
            _log.LogError(ex, "Could not read Google Chat project numbers from the database");
        }

        return audiences;
    }

    /// <summary>
    /// Accepts a project number only if it looks like one — all digits.
    ///
    /// The easy mistake is putting the project *id* here
    /// ("my-project-123456-ab") instead of the project *number* ("123456789012").
    /// Both are called "project" in the console and both fit the column, but only
    /// the number appears in Google's `aud` claim. Left unchecked, an id here
    /// means every inbound event is rejected while the log insists no project
    /// number is configured — technically true, and thoroughly misleading. So the
    /// bad value is dropped and named instead.
    /// </summary>
    private void AddIfProjectNumber(ISet<string> audiences, string? value, string source)
    {
        var candidate = value?.Trim();
        if (string.IsNullOrEmpty(candidate)) return;

        if (candidate.All(char.IsAsciiDigit))
        {
            audiences.Add(candidate);
            return;
        }

        _log.LogWarning(
            "Ignoring {Source} = '{Value}': a Google Cloud project *number* is all digits. This looks " +
            "like the project *id*. Find the number on the Cloud console project page, next to the id.",
            source, candidate);
    }

    /// <summary>
    /// Mints a bearer token carrying exactly the scopes asked for, or null when
    /// there is no credential. The token itself is cached and refreshed by the
    /// Google library, so calling this per request is cheap.
    /// </summary>
    public async Task<string?> GetAccessTokenAsync(
        long? organizationId, string[] scopes, CancellationToken ct = default)
    {
        var credential = await GetCredentialAsync(organizationId, scopes);
        if (credential == null) return null;

        try
        {
            return await credential.GetAccessTokenForRequestAsync(cancellationToken: ct);
        }
        catch (Exception ex)
        {
            // A valid-looking key that Google rejects (revoked, clock skew) lands
            // here. Logged rather than thrown, so a token problem degrades to
            // "Chat unavailable" instead of failing the background job with a
            // stack trace.
            _log.LogError(ex,
                "Could not obtain a Google Chat access token for organization {Org} with scopes {Scopes}",
                organizationId, string.Join(' ', scopes));
            return null;
        }
    }

    private async Task<string?> ResolveKeyJsonAsync(long? organizationId)
    {
        if (!string.IsNullOrWhiteSpace(_staticJson)) return _staticJson;

        var row = await LoadRowAsync(organizationId);
        if (row == null) return null;

        var key = new ServiceAccountKey
        {
            Type = _defaults.Type,
            AuthUri = _defaults.Auth_Uri,
            TokenUri = _defaults.Token_Uri,
            AuthProviderX509CertUrl = _defaults.Auth_Provider_X509_Cert_Url,
            UniverseDomain = _defaults.Universe_Domain,
            ProjectId = row.ProjectId,
            PrivateKeyId = row.PrivateKeyId,
            // The stored PEM usually carries literal \n escapes, as pasted from
            // the downloaded key. Un-escape so the serialized key has real
            // newlines — otherwise Google sees "\\n" and rejects the PEM.
            PrivateKey = row.PrivateKey.Replace("\\n", "\n"),
            ClientEmail = row.ClientEmail,
            ClientId = row.ClientId,
            ClientX509CertUrl = row.ClientX509CertUrl,
        };

        return JsonSerializer.Serialize(key, OmitNullJson);
    }

    private async Task<Entities.GoogleServiceAccount?> LoadRowAsync(long? organizationId)
    {
        try
        {
            // Own scope: this is a singleton with no ambient DbContext.
            using var scope = _scopes.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<BugsManagedDbContext>();

            return await db.GoogleServiceAccounts
                .Where(a => a.IsActive
                            && (a.OrganizationId == organizationId || a.OrganizationId == null))
                // An organization's own row beats the shared default.
                .OrderByDescending(a => a.OrganizationId != null)
                .ThenByDescending(a => a.Id)
                .FirstOrDefaultAsync();
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "Could not read the Google service account for organization {Org}",
                organizationId);
            return null;
        }
    }

    private static readonly JsonSerializerOptions OmitNullJson = new()
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    /// <summary>
    /// The fields of a service-account key that are the same for every Google
    /// project, from the "GoogleServiceAccount" config section. Property names
    /// mirror ServiceManaged's model so its config block copies over verbatim.
    /// </summary>
    private sealed class ServiceAccountDefaults
    {
        public string Type { get; set; } = "service_account";
        public string Auth_Uri { get; set; } = "https://accounts.google.com/o/oauth2/auth";
        public string Token_Uri { get; set; } = "https://oauth2.googleapis.com/token";
        public string Auth_Provider_X509_Cert_Url { get; set; } = "https://www.googleapis.com/oauth2/v1/certs";
        public string Universe_Domain { get; set; } = "googleapis.com";
    }

    // Serialized shape of a downloaded key. Names given explicitly so what we
    // emit is a byte-for-byte ordinary key file, rather than relying on Google's
    // parser matching "Private_Key" to "private_key" case-insensitively.
    private sealed class ServiceAccountKey
    {
        [JsonPropertyName("type")] public string? Type { get; set; }
        [JsonPropertyName("project_id")] public string? ProjectId { get; set; }
        [JsonPropertyName("private_key_id")] public string? PrivateKeyId { get; set; }
        [JsonPropertyName("private_key")] public string? PrivateKey { get; set; }
        [JsonPropertyName("client_email")] public string? ClientEmail { get; set; }
        [JsonPropertyName("client_id")] public string? ClientId { get; set; }
        [JsonPropertyName("auth_uri")] public string? AuthUri { get; set; }
        [JsonPropertyName("token_uri")] public string? TokenUri { get; set; }
        [JsonPropertyName("auth_provider_x509_cert_url")] public string? AuthProviderX509CertUrl { get; set; }
        [JsonPropertyName("client_x509_cert_url")] public string? ClientX509CertUrl { get; set; }
        [JsonPropertyName("universe_domain")] public string? UniverseDomain { get; set; }
    }
}
