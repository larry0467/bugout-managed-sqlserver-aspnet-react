using System.Security.Claims;
using System.Text.Json;
using BugsManaged.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BugsManaged.Api.Controllers;

// Inbound service hooks that move development orders without a session.
// Lives under /api/development so a service key (sent by Azure DevOps as a
// custom header) is accepted; the key needs development:write.
//
// Azure DevOps marks any non-2xx response as a failed delivery and retries,
// so events we do not act on return 202 with the reason rather than 4xx.
[ApiController]
[Route("api/development/webhooks")]
[Authorize(AuthenticationSchemes = ServiceKeys.DevelopmentSchemes)]
public class DevelopmentWebhookController : ControllerBase
{
    private readonly AzureDevOpsWebhookService _azureDevOps;
    private readonly IOrgContext _org;
    private readonly ILogger<DevelopmentWebhookController> _log;

    public DevelopmentWebhookController(AzureDevOpsWebhookService azureDevOps, IOrgContext org, ILogger<DevelopmentWebhookController> log)
    {
        _azureDevOps = azureDevOps;
        _org = org;
        _log = log;
    }

    private string CallerEmail() =>
        User.FindFirstValue(ClaimTypes.Email) ?? User.FindFirstValue("email") ?? "unknown";

    private string CallerName() =>
        User.FindFirstValue("fullName") ?? User.FindFirstValue(ClaimTypes.Name) ?? CallerEmail();

    // Subscribe in Azure DevOps (Project settings -> Service hooks -> Web Hooks):
    //   Pull request created / updated  (filter: target branch dev, or none)
    //   Release deployment completed  or  Run stage state changed
    // URL: https://bugout-api.managedplatform.com/api/development/webhooks/azure-devops
    // HTTP header: X-BOM-Service-Key: bsk_...
    [HttpPost("azure-devops")]
    [RequestSizeLimit(2 * 1024 * 1024)]
    public async Task<IActionResult> AzureDevOps([FromBody] JsonElement payload, CancellationToken ct)
    {
        if (_org.CurrentOrganizationId == null) return Unauthorized(new { message = "No organization context" });
        if (!DevelopmentOrderService.CanWrite(User))
            return StatusCode(403, new { message = $"This key lacks the {ServiceKeys.ScopeDevelopmentWrite} scope" });
        if (payload.ValueKind != JsonValueKind.Object)
            return BadRequest(new { message = "Expected a JSON object (Azure DevOps service hook payload)" });

        var outcome = await _azureDevOps.HandleAsync(payload, CallerEmail(), CallerName(), ct);
        _log.LogInformation("AzureDevOps webhook: {Action} {Detail}", outcome.Action, outcome.Detail);

        return outcome.Handled ? Ok(outcome) : Accepted(outcome);
    }
}
