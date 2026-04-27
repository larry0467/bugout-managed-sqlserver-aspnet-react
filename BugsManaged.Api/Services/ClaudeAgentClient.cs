using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace BugsManaged.Api.Services;

// HTTP contract with the Node Claude Agent sidecar. The sidecar is the only
// thing in this stack that talks to the Anthropic API directly — the C#
// backend never imports the Anthropic SDK. We just hand off a run request
// and persist whatever the sidecar returns.

public record ClaudeRunTicketDto
{
    [JsonPropertyName("id")] public long Id { get; init; }
    [JsonPropertyName("title")] public string Title { get; init; } = "";
    [JsonPropertyName("description")] public string? Description { get; init; }
    [JsonPropertyName("transcript")] public string? Transcript { get; init; }
    [JsonPropertyName("consoleErrors")] public string? ConsoleErrors { get; init; }
    [JsonPropertyName("currentPageUrl")] public string? CurrentPageUrl { get; init; }
    [JsonPropertyName("ticketType")] public string TicketType { get; init; } = "BUG";
}

public record ClaudeRunRepoDto
{
    [JsonPropertyName("path")] public string Path { get; init; } = "";
    [JsonPropertyName("subpath")] public string Subpath { get; init; } = "";
    [JsonPropertyName("devBranch")] public string DevBranch { get; init; } = "dev";
    [JsonPropertyName("githubOwner")] public string? GithubOwner { get; init; }
    [JsonPropertyName("githubRepo")] public string? GithubRepo { get; init; }
}

public record ClaudeRunRequestDto
{
    [JsonPropertyName("runId")] public long RunId { get; init; }
    [JsonPropertyName("model")] public string Model { get; init; } = "claude-sonnet-4-6";
    [JsonPropertyName("hardCostCapUsd")] public decimal HardCostCapUsd { get; init; } = 20.00m;
    [JsonPropertyName("ticket")] public ClaudeRunTicketDto Ticket { get; init; } = new();
    [JsonPropertyName("repo")] public ClaudeRunRepoDto Repo { get; init; } = new();
}

public record ClaudeRunResultDto
{
    [JsonPropertyName("status")] public string Status { get; init; } = "FAILED";
    [JsonPropertyName("analysisMarkdown")] public string? AnalysisMarkdown { get; init; }
    [JsonPropertyName("prUrl")] public string? PrUrl { get; init; }
    [JsonPropertyName("branchName")] public string? BranchName { get; init; }
    [JsonPropertyName("tokensIn")] public int? TokensIn { get; init; }
    [JsonPropertyName("tokensOut")] public int? TokensOut { get; init; }
    [JsonPropertyName("costUsd")] public decimal? CostUsd { get; init; }
    [JsonPropertyName("durationMs")] public int? DurationMs { get; init; }
    [JsonPropertyName("errorMessage")] public string? ErrorMessage { get; init; }
}

public interface IClaudeAgentClient
{
    Task<ClaudeRunResultDto> RunAsync(ClaudeRunRequestDto request, CancellationToken ct);
}

public class ClaudeAgentClient : IClaudeAgentClient
{
    private readonly HttpClient _http;
    private readonly ILogger<ClaudeAgentClient> _log;

    public ClaudeAgentClient(HttpClient http, IConfiguration config, ILogger<ClaudeAgentClient> log)
    {
        _http = http;
        _log = log;

        var baseUrl = config["BugsManaged:ClaudeAgentSidecar:Url"] ?? "http://localhost:7100";
        var apiKey = config["BugsManaged:ClaudeAgentSidecar:ApiKey"];

        _http.BaseAddress = new Uri(baseUrl.TrimEnd('/') + "/");
        // Generous: a real Claude run can run many minutes. The per-run hard
        // cap is enforced inside the sidecar; this is just the network read
        // timeout.
        _http.Timeout = TimeSpan.FromMinutes(30);
        _http.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        if (!string.IsNullOrEmpty(apiKey))
        {
            _http.DefaultRequestHeaders.Remove("X-Claude-Agent-Key");
            _http.DefaultRequestHeaders.Add("X-Claude-Agent-Key", apiKey);
        }
    }

    public async Task<ClaudeRunResultDto> RunAsync(ClaudeRunRequestDto request, CancellationToken ct)
    {
        try
        {
            var resp = await _http.PostAsJsonAsync("runs", request, ct);
            if (!resp.IsSuccessStatusCode)
            {
                var body = await resp.Content.ReadAsStringAsync(ct);
                _log.LogWarning("Sidecar returned {Status}: {Body}", resp.StatusCode, body);
                return new ClaudeRunResultDto
                {
                    Status = "FAILED",
                    ErrorMessage = $"Sidecar HTTP {(int)resp.StatusCode}: {body}",
                };
            }
            var result = await resp.Content.ReadFromJsonAsync<ClaudeRunResultDto>(cancellationToken: ct);
            return result ?? new ClaudeRunResultDto { Status = "FAILED", ErrorMessage = "Sidecar returned empty body" };
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "ClaudeAgentClient call failed for run {RunId}", request.RunId);
            return new ClaudeRunResultDto { Status = "FAILED", ErrorMessage = "Sidecar call exception: " + ex.Message };
        }
    }
}
