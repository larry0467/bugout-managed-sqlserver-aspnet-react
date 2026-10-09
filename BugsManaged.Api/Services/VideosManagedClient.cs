using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Options;

namespace BugsManaged.Api.Services;

public record VideosManagedRecording(string ShareUrl, string? Title, int? DurationSeconds, string? CaptionsVtt, string? TranscriptText);

public interface IVideosManagedClient
{
    // Null when the url is not a Videos Managed share link or the recording
    // cannot be read. Never throws: a missing transcript must not block triage.
    Task<VideosManagedRecording?> TryGetRecordingAsync(string shareUrl, CancellationToken ct = default);
}

// Reads a Videos Managed recording through its public API:
//   https://videos-dev.managedplatform.com/<account>/r/<slug>
//   -> https://videos-api-dev.managedplatform.com/public/<account>/r/<slug>
// The JSON carries title, durationSeconds and captionsVtt (the transcript).
public class VideosManagedClient : IVideosManagedClient
{
    private static readonly Regex ShareLink = new(@"^https?://[^/]+/(?<account>[^/]+)/r/(?<slug>[^/?#]+)", RegexOptions.IgnoreCase | RegexOptions.Compiled);

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
