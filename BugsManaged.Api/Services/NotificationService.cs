using System.Text;
using Microsoft.Extensions.Logging;

namespace BugsManaged.Api.Services;

public class NotificationService
{
    private readonly HttpClient _httpClient;
    private readonly ILogger<NotificationService> _logger;

    public NotificationService(HttpClient httpClient, ILogger<NotificationService> logger)
    {
        _httpClient = httpClient;
        _logger = logger;
    }

    public async Task SendEmailAsync(string? to, string subject, string body)
    {
        if (string.IsNullOrWhiteSpace(to))
        {
            _logger.LogWarning("SendEmail called with null/empty recipient. Subject: {Subject}", subject);
            return;
        }

        // TODO: Integrate real email provider (SendGrid, SES, etc.)
        _logger.LogInformation("EMAIL to={To} subject={Subject} body={Body}", to, subject, body);
    }

    public async Task SendSlackAsync(string? webhookUrl, string payload)
    {
        if (string.IsNullOrWhiteSpace(webhookUrl))
        {
            _logger.LogWarning("SendSlack called with null/empty webhookUrl");
            return;
        }

        try
        {
            var content = new StringContent(payload, Encoding.UTF8, "application/json");
            var response = await _httpClient.PostAsync(webhookUrl, content);
            _logger.LogInformation("Slack webhook response: {StatusCode}", response.StatusCode);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send Slack notification to {Url}", webhookUrl);
        }
    }

    public async Task SendWebhookAsync(string? url, string jsonPayload)
    {
        if (string.IsNullOrWhiteSpace(url))
        {
            _logger.LogWarning("SendWebhook called with null/empty URL");
            return;
        }

        try
        {
            var content = new StringContent(jsonPayload, Encoding.UTF8, "application/json");
            var response = await _httpClient.PostAsync(url, content);
            _logger.LogInformation("Webhook response from {Url}: {StatusCode}", url, response.StatusCode);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send webhook to {Url}", url);
        }
    }
}
