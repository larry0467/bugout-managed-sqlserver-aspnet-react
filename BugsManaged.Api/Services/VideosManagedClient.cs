using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Options;

namespace BugsManaged.Api.Services;

public record VideosManagedRecording(string ShareUrl, string? Title, int? DurationSeconds, string? CaptionsVtt, string? TranscriptText);

// What Bug Out asks Videos Managed for when the widget wants to record.
public record VideosManagedCaptureRequest(
    string Title, string Source, string? ExternalRef, string? ReturnOrigin, int? MaxDurationSeconds, int? ExpiresInMinutes);

// What comes back: the one-time capture link to open in a window, and the
// share link the finished recording will have.
public record VideosManagedCaptureSession(Guid SessionId, Guid RecordingId, string CaptureUrl, string ShareUrl, DateTime ExpiresAt);

public interface IVideosManagedClient
{
    // Null when the url is not a Videos Managed share link or the recording
    // cannot be read. Never throws: a missing transcript must not block triage.
    Task<VideosManagedRecording?> TryGetRecordingAsync(string shareUrl, CancellationToken ct = default);

    // Creates a guest capture session in the workspace the API key belongs to.
    // Null when Videos Managed refuses or is unreachable; the widget then falls
    // back to recording in the page. The key is sent, never logged.
    Task<VideosManagedCaptureSession?> TryCreateCaptureSessionAsync(string apiKey, VideosManagedCaptureRequest request, CancellationToken ct = default);
}

// Talks to Videos Managed:
//   share link  https://videos-dev.managedplatform.com/<account>/r/<slug>
//   -> JSON     https://videos-api-dev.managedplatform.com/public/<account>/r/<slug>
//      (title, durationSeconds, captionsVtt = the transcript)
//   capture     POST https://videos-api-dev.managedplatform.com/api/v1/capture/sessions
//      with the workspace's API key.
public class VideosManagedClient : IVideosManagedClient
{
    private static readonly Regex ShareLink = new(@"^https?://(?<host>[^/]+)/(?<account>[^/]+)/r/(?<slug>[^/?#]+)", RegexOptions.IgnoreCase | RegexOptions.Compiled);
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    private readonly HttpClient _http;
    private readonly DevelopmentTrackerOptions _opts;
    private readonly ILogger<VideosManagedClient> _log;

    public VideosManagedClient(HttpClient http, IOptions<DevelopmentTrackerOptions> opts, ILogger<VideosManagedClient> log)
    {
        _http = http;
        _opts = opts.Value;
        _log = log;
    }

    public static bool LooksLikeShareLink(string? url) => !string.IsNullOrWhiteSpace(url) && ShareLink.IsMatch(url.Trim());

    // A share link on our own Videos Managed host. Tickets accept a VideoUrl
    // from the widget only when it passes this, because the admin UI embeds it.
    public static bool IsTrustedShareLink(string? url, DevelopmentTrackerOptions opts)
    {
        if (string.IsNullOrWhiteSpace(url)) return false;
        var m = ShareLink.Match(url.Trim());
        if (!m.Success) return false;
        var host = m.Groups["host"].Value;
        if (host.Contains(':')) host = host[..host.IndexOf(':')];
        if (host.EndsWith(".managedplatform.com", StringComparison.OrdinalIgnoreCase)) return true;
        return Uri.TryCreate(opts.VideosWebBase, UriKind.Absolute, out var web)
            && string.Equals(web.Host, host, StringComparison.OrdinalIgnoreCase);
    }

    public async Task<VideosManagedRecording?> TryGetRecordingAsync(string shareUrl, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(shareUrl)) return null;
        var m = ShareLink.Match(shareUrl.Trim());
        if (!m.Success) return null;

        var api = $"{_opts.VideosApiBase.TrimEnd('/')}/public/{Uri.EscapeDataString(m.Groups["account"].Value)}/r/{Uri.EscapeDataString(m.Groups["slug"].Value)}";
        try
        {
            using var resp = await _http.GetAsync(api, ct);
            if (!resp.IsSuccessStatusCode)
            {
                // 404 is the normal answer while the recording is still processing.
                if (resp.StatusCode != System.Net.HttpStatusCode.NotFound)
                    _log.LogWarning("VideosManaged: {Api} returned {Status}", api, (int)resp.StatusCode);
                return null;
            }
            using var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync(ct));
            var root = doc.RootElement;
            string? title = root.TryGetProperty("title", out var t) && t.ValueKind == JsonValueKind.String ? t.GetString() : null;
            int? duration = root.TryGetProperty("durationSeconds", out var d) && d.TryGetInt32(out var di) ? di : null;
            string? vtt = root.TryGetProperty("captionsVtt", out var c) && c.ValueKind == JsonValueKind.String ? c.GetString() : null;
            return new VideosManagedRecording(shareUrl.Trim(), title, duration, vtt, VttToText(vtt));
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "VideosManaged: could not read {Api}", api);
            return null;
        }
    }

    public async Task<VideosManagedCaptureSession?> TryCreateCaptureSessionAsync(string apiKey, VideosManagedCaptureRequest request, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(apiKey)) return null;
        var api = $"{_opts.VideosApiBase.TrimEnd('/')}/api/v1/capture/sessions";
        try
        {
            // Per-request header: the typed HttpClient is shared by every app's key.
            using var req = new HttpRequestMessage(HttpMethod.Post, api);
            req.Headers.Authorization = new AuthenticationHeaderValue("ApiKey", apiKey.Trim());
            req.Content = new StringContent(JsonSerializer.Serialize(new
            {
                title = request.Title,
                source = request.Source,
                externalRef = request.ExternalRef,
                returnOrigin = request.ReturnOrigin,
                maxDurationSeconds = request.MaxDurationSeconds,
                expiresInMinutes = request.ExpiresInMinutes,
            }, Json), Encoding.UTF8, "application/json");

            using var resp = await _http.SendAsync(req, ct);
            var body = await resp.Content.ReadAsStringAsync(ct);
            if (!resp.IsSuccessStatusCode)
            {
                _log.LogWarning("VideosManaged: capture session refused with {Status}: {Body}", (int)resp.StatusCode, Truncate(body, 300));
                return null;
            }

            using var doc = JsonDocument.Parse(body);
            var root = doc.RootElement;
            if (!root.TryGetProperty("sessionId", out var sid) || !Guid.TryParse(sid.GetString(), out var sessionId)) return null;
            if (!root.TryGetProperty("recordingId", out var rid) || !Guid.TryParse(rid.GetString(), out var recordingId)) return null;
            var captureUrl = root.TryGetProperty("captureUrl", out var cu) ? cu.GetString() : null;
            var shareUrl = root.TryGetProperty("shareUrl", out var su) ? su.GetString() : null;
            var expires = root.TryGetProperty("expiresAt", out var ex) && ex.TryGetDateTime(out var exAt) ? exAt : DateTime.UtcNow.AddMinutes(request.ExpiresInMinutes ?? 120);
            if (string.IsNullOrWhiteSpace(captureUrl) || string.IsNullOrWhiteSpace(shareUrl)) return null;

            return new VideosManagedCaptureSession(sessionId, recordingId, captureUrl, shareUrl, expires);
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "VideosManaged: could not create a capture session at {Api}", api);
            return null;
        }
    }

    private static string Truncate(string s, int max) => s.Length <= max ? s : s[..max] + "…";

    // Strips WEBVTT headers, cue ids and timings; collapses repeated lines.
    public static string? VttToText(string? vtt)
    {
        if (string.IsNullOrWhiteSpace(vtt)) return null;
        var sb = new StringBuilder();
        string? last = null;
        foreach (var raw in vtt.Split('\n'))
        {
            var line = raw.Trim('\r', ' ', '\t');
            if (line.Length == 0 || line == "WEBVTT" || line.Contains("-->") || Regex.IsMatch(line, @"^\d+$")
                || line.StartsWith("NOTE", StringComparison.Ordinal) || line.StartsWith("STYLE", StringComparison.Ordinal) || line.StartsWith("REGION", StringComparison.Ordinal))
                continue;
            line = Regex.Replace(line, "<[^>]+>", "");
            if (line == last) continue;
            if (sb.Length > 0) sb.Append(' ');
            sb.Append(line);
            last = line;
        }
        return sb.Length == 0 ? null : sb.ToString();
    }
}
