using System.Text;
using System.Text.Json;

namespace BugsManaged.Api.Services;

public record ClassifierResult(string? Category, double Confidence, string? Reasoning);

public class TicketClassifierService
{
    private readonly HttpClient _http;
    private readonly ILogger<TicketClassifierService> _log;
    private readonly string? _apiKey;
    private readonly string _model;
    private readonly double _confidenceThreshold;

    public TicketClassifierService(HttpClient http, IConfiguration config, ILogger<TicketClassifierService> log)
    {
        _http = http;
        _log = log;
        _apiKey = config["BugOutManaged:Anthropic:ApiKey"];
        _model = config["BugOutManaged:Anthropic:Model"] ?? "claude-haiku-4-5-20251001";
        _confidenceThreshold = double.TryParse(config["BugOutManaged:Anthropic:ConfidenceThreshold"], out var t) ? t : 0.7;

        if (!_http.DefaultRequestHeaders.Contains("anthropic-version"))
        {
            _http.DefaultRequestHeaders.Add("anthropic-version", "2023-06-01");
        }
    }

    public double ConfidenceThreshold => _confidenceThreshold;

    // Classifies a ticket into FRONTEND / BACKEND / FULLSTACK based on its content.
    // Returns null category when the API key is missing, Claude is unreachable, or
    // confidence is below threshold — the caller leaves the ticket uncategorized
    // for manual triage rather than routing it wrong.
    public async Task<ClassifierResult> ClassifyAsync(string title, string? description, string? consoleErrors, string? currentPageUrl)
    {
        if (string.IsNullOrEmpty(_apiKey))
        {
            _log.LogInformation("Classifier skipped: BugOutManaged:Anthropic:ApiKey not configured");
            return new ClassifierResult(null, 0, "API key not configured");
        }

        var userContent = new StringBuilder();
        userContent.AppendLine($"Title: {title}");
        if (!string.IsNullOrEmpty(description)) userContent.AppendLine($"Description: {description}");
        if (!string.IsNullOrEmpty(currentPageUrl)) userContent.AppendLine($"Page URL: {currentPageUrl}");
        if (!string.IsNullOrEmpty(consoleErrors)) userContent.AppendLine($"Console errors: {consoleErrors}");

        var systemPrompt = "You are classifying bug reports for a software team. Decide whether the bug is most likely a FRONTEND issue (UI rendering, client-side JS, CSS, browser behavior), a BACKEND issue (API, database, server logic, auth), or FULLSTACK (genuinely touches both, or unclear which side is at fault). Respond ONLY with a JSON object of the form {\"category\":\"FRONTEND|BACKEND|FULLSTACK\",\"confidence\":0.0-1.0,\"reasoning\":\"one short sentence\"}. No prose outside the JSON.";

        var payload = new
        {
            model = _model,
            max_tokens = 200,
            system = systemPrompt,
            messages = new[]
            {
                new { role = "user", content = userContent.ToString() }
            }
        };

        try
        {
            using var req = new HttpRequestMessage(HttpMethod.Post, "https://api.anthropic.com/v1/messages");
            req.Headers.Add("x-api-key", _apiKey);
            req.Content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");

            using var resp = await _http.SendAsync(req);
            if (!resp.IsSuccessStatusCode)
            {
                var err = await resp.Content.ReadAsStringAsync();
                _log.LogWarning("Classifier API returned {Status}: {Body}", resp.StatusCode, err);
                return new ClassifierResult(null, 0, $"API error {resp.StatusCode}");
            }

            var body = await resp.Content.ReadAsStringAsync();
            using var doc = JsonDocument.Parse(body);
            var text = doc.RootElement
                .GetProperty("content")[0]
                .GetProperty("text")
                .GetString() ?? "";

            return ParseClassifierResponse(text);
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "Classifier call failed");
            return new ClassifierResult(null, 0, "Exception: " + ex.Message);
        }
    }

    private ClassifierResult ParseClassifierResponse(string text)
    {
        var jsonStart = text.IndexOf('{');
        var jsonEnd = text.LastIndexOf('}');
        if (jsonStart < 0 || jsonEnd <= jsonStart)
            return new ClassifierResult(null, 0, "Model returned non-JSON");

        var json = text[jsonStart..(jsonEnd + 1)];
        try
        {
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;
            var category = root.TryGetProperty("category", out var catEl) ? catEl.GetString() : null;
            var confidence = root.TryGetProperty("confidence", out var confEl) && confEl.TryGetDouble(out var c) ? c : 0;
            var reasoning = root.TryGetProperty("reasoning", out var rEl) ? rEl.GetString() : null;

            if (category != "FRONTEND" && category != "BACKEND" && category != "FULLSTACK")
                return new ClassifierResult(null, confidence, "Invalid category: " + category);

            if (confidence < _confidenceThreshold)
                return new ClassifierResult(null, confidence, $"Confidence {confidence:F2} below threshold {_confidenceThreshold:F2}");

            return new ClassifierResult(category, confidence, reasoning);
        }
        catch (Exception ex)
        {
            return new ClassifierResult(null, 0, "Parse error: " + ex.Message);
        }
    }
}
