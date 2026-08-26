using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Options;

namespace BugsManaged.Api.Services.GoogleChat;

/// <summary>
/// Task 2 — the wrapper around the Google Chat REST API, using app
/// authentication (a service account), never user OAuth.
///
/// REST over a typed HttpClient rather than the generated client library: every
/// other outbound integration in this codebase is a typed HttpClient
/// (NotificationService, TicketClassifierService, ClaudeAgentClient), the three
/// endpoints we need are trivial, and it avoids pulling the gRPC dependency tree
/// into the API for what amounts to three POSTs.
///
/// Nothing here throws for an ordinary failure. Every method returns null/false
/// and logs, because the callers are background jobs whose contract is "a Chat
/// hiccup must never affect the ticket".
/// </summary>
public class GoogleChatApiClient
{
    private readonly HttpClient _http;
    private readonly IGoogleChatTokenSource _tokens;
    private readonly GoogleChatOptions _options;
    private readonly ILogger<GoogleChatApiClient> _log;

    private static readonly JsonSerializerOptions Json = new()
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    public GoogleChatApiClient(
        HttpClient http,
        IGoogleChatTokenSource tokens,
        IOptions<GoogleChatOptions> options,
        ILogger<GoogleChatApiClient> log)
    {
        _http = http;
        _tokens = tokens;
        _options = options.Value;
        _log = log;

        if (_http.BaseAddress == null)
            _http.BaseAddress = new Uri(_options.ApiBaseUrl);
    }

    public Task<bool> IsConfiguredAsync(long? organizationId) =>
        _tokens.IsConfiguredAsync(organizationId);

    /// <summary>
    /// Creates a Space for one client and puts both the client and (implicitly,
    /// as its creator) our app in it. Returns the Space resource name
    /// ("spaces/AAAAxxxxxxx"), or null if the Space could not be created.
    ///
    /// The membership call failing does NOT fail the whole operation: a Space we
    /// could not add the client to is still a usable Space, and the caller
    /// records that the invite is outstanding so the next send retries it. That
    /// is the common real-world failure — a Workspace policy blocking external
    /// members — and losing the Space over it would mean creating a duplicate
    /// on the next ticket.
    /// </summary>
    public async Task<CreatedSpace?> CreateSpaceForClientAsync(
        long? organizationId, string clientEmail, string displayName, CancellationToken ct = default)
    {
        var body = new
        {
            spaceType = "SPACE",
            displayName,
            externalUserAllowed = _options.ExternalUserAllowed,
            customer = _options.Customer,
        };

        var created = await SendAsync<SpaceResponse>(
            organizationId, _options.SpaceCreateScopes, HttpMethod.Post, "spaces", body, ct);

        if (created?.Name == null)
        {
            _log.LogError("Google Chat space creation for {Client} returned no resource name", clientEmail);
            return null;
        }

        var invited = await AddMemberAsync(organizationId, created.Name, clientEmail, ct);

        _log.LogInformation("Created Google Chat space {Space} for {Client} (invite sent: {Invited})",
            created.Name, clientEmail, invited);

        return new CreatedSpace(created.Name, created.SpaceUri, created.DisplayName ?? displayName, invited);
    }

    /// <summary>
    /// Invites a human to a Space by email. Treats "already a member" as success
    /// so re-inviting is harmless and idempotent.
    /// </summary>
    public async Task<bool> AddMemberAsync(
        long? organizationId, string spaceName, string email, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(spaceName) || string.IsNullOrWhiteSpace(email)) return false;

        var body = new { member = new { name = $"users/{email}", type = "HUMAN" } };

        var result = await SendRawAsync(
            organizationId, _options.MembershipScopes, HttpMethod.Post, $"{spaceName}/members", body, ct);

        if (result.Success) return true;

        // ALREADY_EXISTS is the expected outcome of re-inviting someone.
        if (result.StatusCode == HttpStatusCode.Conflict ||
            (result.Body?.Contains("ALREADY_EXISTS", StringComparison.OrdinalIgnoreCase) ?? false))
            return true;

        _log.LogWarning(
            "Could not add {Email} to Google Chat space {Space} ({Status}): {Body}. If this is an " +
            "external address, check that the Workspace allows external members in spaces.",
            email, spaceName, result.StatusCode, result.Body);

        return false;
    }

    /// <summary>
    /// Posts a message to a Space. <paramref name="text"/> is the plain body;
    /// <paramref name="card"/> is the hook for a richer cardsV2 payload (ticket
    /// number, summary, a Reopen button) without changing this signature.
    ///
    /// threadKey groups everything we send about one ticket into a single Chat
    /// thread. The returned thread resource name is what inbound events carry, so
    /// the caller persists it to match a reply back to the ticket.
    /// </summary>
    public async Task<SentMessage?> PostMessageAsync(
        long? organizationId,
        string spaceName,
        string text,
        object? card = null,
        string? threadKey = null,
        string? threadName = null,
        CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(spaceName)) return null;

        var path = $"{spaceName}/messages";
        if (!string.IsNullOrWhiteSpace(threadKey) || !string.IsNullOrWhiteSpace(threadName))
            path += "?messageReplyOption=REPLY_MESSAGE_FALLBACK_TO_NEW_THREAD";

        var body = new Dictionary<string, object?> { ["text"] = text };
        if (card != null) body["cardsV2"] = new[] { card };

        // A thread resource name is exact; a threadKey lets Google create the
        // thread the first time and reuse it after.
        if (!string.IsNullOrWhiteSpace(threadName))
            body["thread"] = new { name = threadName };
        else if (!string.IsNullOrWhiteSpace(threadKey))
            body["thread"] = new { threadKey };

        var sent = await SendAsync<MessageResponse>(
            organizationId, _options.MessageScopes, HttpMethod.Post, path, body, ct);

        // A Space with in-line (unthreaded) replies rejects thread/reply options
        // outright. The message itself is still worth delivering, so retry plain.
        if (sent == null && body.ContainsKey("thread"))
        {
            body.Remove("thread");
            _log.LogInformation("Retrying Google Chat message to {Space} without threading", spaceName);
            sent = await SendAsync<MessageResponse>(
                organizationId, _options.MessageScopes, HttpMethod.Post, $"{spaceName}/messages", body, ct);
        }

        return sent?.Name == null ? null : new SentMessage(sent.Name, sent.Thread?.Name);
    }

    // ───────────────────────── transport ─────────────────────────

    private async Task<T?> SendAsync<T>(
        long? organizationId, string[] scopes, HttpMethod method, string path, object? body, CancellationToken ct)
        where T : class
    {
        var result = await SendRawAsync(organizationId, scopes, method, path, body, ct);
        if (!result.Success || string.IsNullOrWhiteSpace(result.Body)) return null;

        try
        {
            return JsonSerializer.Deserialize<T>(result.Body, Json);
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "Could not parse the Google Chat response for {Path}: {Body}", path, result.Body);
            return null;
        }
    }

    /// <summary>
    /// One authenticated call, retried with exponential backoff on 429 and 5xx.
    /// 4xx other than 429 is not retried — a malformed card or a revoked
    /// membership will fail identically every time, and retrying only delays the
    /// log line that explains it.
    /// </summary>
    private async Task<HttpResult> SendRawAsync(
        long? organizationId, string[] scopes, HttpMethod method, string path, object? body, CancellationToken ct)
    {
        var token = await _tokens.GetAccessTokenAsync(organizationId, scopes, ct);
        if (token == null)
        {
            _log.LogDebug("Google Chat call to {Path} skipped — no credential for organization {Org}",
                path, organizationId);
            return new HttpResult(false, null, null);
        }

        var attempts = Math.Max(1, _options.MaxAttempts);

        for (var attempt = 1; ; attempt++)
        {
            try
            {
                using var request = new HttpRequestMessage(method, path);
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

                if (body != null)
                {
                    request.Content = new StringContent(
                        JsonSerializer.Serialize(body, Json), Encoding.UTF8, "application/json");
                }

                using var response = await _http.SendAsync(request, ct);
                var responseBody = await response.Content.ReadAsStringAsync(ct);

                if (response.IsSuccessStatusCode)
                    return new HttpResult(true, response.StatusCode, responseBody);

                var retryable = response.StatusCode == HttpStatusCode.TooManyRequests
                                || (int)response.StatusCode >= 500;

                if (!retryable || attempt >= attempts)
                {
                    // Chat's error body names exactly what it rejected. Logging
                    // only the status code turns every one of these into a
                    // silent no-send, which is the costliest thing to debug.
                    _log.LogError("Google Chat {Method} {Path} failed with {Status}: {Body}",
                        method, path, response.StatusCode, responseBody);
                    return new HttpResult(false, response.StatusCode, responseBody);
                }

                await DelayAsync(attempt, ct);
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                throw;
            }
            catch (Exception ex)
            {
                if (attempt >= attempts)
                {
                    _log.LogError(ex, "Google Chat {Method} {Path} failed after {Attempts} attempts",
                        method, path, attempt);
                    return new HttpResult(false, null, null);
                }

                await DelayAsync(attempt, ct);
            }
        }
    }

    private Task DelayAsync(int attempt, CancellationToken ct)
    {
        // 400ms, 800ms, 1600ms… with a little jitter so concurrent retries after
        // a shared 429 don't line up and hit the same wall together.
        var baseDelay = _options.RetryBaseDelayMs * Math.Pow(2, attempt - 1);
        var jitter = Random.Shared.Next(0, _options.RetryBaseDelayMs);
        return Task.Delay(TimeSpan.FromMilliseconds(baseDelay + jitter), ct);
    }

    private record HttpResult(bool Success, HttpStatusCode? StatusCode, string? Body);

    public record CreatedSpace(string SpaceName, string? SpaceUri, string? DisplayName, bool InviteSent);

    public record SentMessage(string MessageName, string? ThreadName);

    private sealed class SpaceResponse
    {
        [JsonPropertyName("name")] public string? Name { get; set; }
        [JsonPropertyName("displayName")] public string? DisplayName { get; set; }
        [JsonPropertyName("spaceUri")] public string? SpaceUri { get; set; }
    }

    private sealed class MessageResponse
    {
        [JsonPropertyName("name")] public string? Name { get; set; }
        [JsonPropertyName("thread")] public ThreadRef? Thread { get; set; }

        internal sealed class ThreadRef
        {
            [JsonPropertyName("name")] public string? Name { get; set; }
        }
    }
}
