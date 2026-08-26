using Google.Apis.Auth;
using Microsoft.Extensions.Options;

namespace BugsManaged.Api.Services.GoogleChat;

/// <summary>
/// Task 4 item 1 — proves an inbound POST really came from Google Chat before we
/// trust a byte of the payload.
///
/// Chat apps built on the **add-ons framework** (the current shape, and what this
/// deployment uses) do not put a token in the Authorization header. They deliver
/// it inside the request body at <c>authorizationEventObject.systemIdToken</c>,
/// as a Google-signed ID token with these claims:
///
///   iss    https://accounts.google.com
///   aud    the exact HTTP endpoint URL configured in the Chat app
///   email  service-{PROJECT_NUMBER}@gcp-sa-gsuiteaddons.iam.gserviceaccount.com
///
/// All three are checked. The audience being the endpoint URL is what stops a
/// token issued for someone else's Chat app being replayed at ours, and the email
/// claim is what ties it to *our* Cloud project rather than any Google project.
///
/// The older Chat-app format — bearer token in the header, issued by
/// chat@system.gserviceaccount.com, audienced to the project number — is
/// deliberately not supported: it is signed with a service-account key set that
/// needs a different certificate endpoint, and no deployment here uses it. A
/// request carrying only that header is rejected, loudly, rather than half-
/// verified.
/// </summary>
public class GoogleChatRequestVerifier
{
    /// <summary>Issuer of the add-ons framework system ID token.</summary>
    public const string SystemTokenIssuer = "https://accounts.google.com";

    /// <summary>
    /// Google's service agent for Workspace add-ons, per Cloud project. The
    /// project number in the local part is what identifies the sending app.
    /// </summary>
    private const string ServiceAgentSuffix = "@gcp-sa-gsuiteaddons.iam.gserviceaccount.com";

    private readonly IGoogleChatAudienceSource _audiences;
    private readonly GoogleChatOptions _options;
    private readonly ILogger<GoogleChatRequestVerifier> _log;

    public GoogleChatRequestVerifier(
        IGoogleChatAudienceSource audiences,
        IOptions<GoogleChatOptions> options,
        ILogger<GoogleChatRequestVerifier> log)
    {
        _audiences = audiences;
        _options = options.Value;
        _log = log;
    }

    /// <param name="Sender">
    /// Which configured Cloud project the token came from, when that could be
    /// determined. Null means no project number is configured, so the sender is
    /// unidentified — the caller then cannot constrain which organization's Space
    /// the event may touch. A non-null Sender with a null OrganizationId is a
    /// shared credential: identified project, but legitimately serving every
    /// tenant.
    /// </param>
    public record VerificationResult(bool IsValid, string? Reason, GoogleChatSender? Sender = null);

    /// <summary>
    /// Verifies the system ID token carried in the event body.
    /// </summary>
    /// <param name="systemIdToken">
    /// authorizationEventObject.systemIdToken from the request body.
    /// </param>
    /// <param name="requestUrl">
    /// The absolute URL this request arrived on, used as the expected audience
    /// when GoogleChat:EventAudience is not configured. Behind a tunnel or proxy
    /// this must be the public URL Google was given, which is why the explicit
    /// setting exists as an override.
    /// </param>
    public async Task<VerificationResult> VerifyAsync(string? systemIdToken, string? requestUrl)
    {
        if (string.IsNullOrWhiteSpace(systemIdToken))
        {
            return new VerificationResult(false,
                "No authorizationEventObject.systemIdToken in the request body. Google Chat apps on " +
                "the add-ons framework always send one; a request without it is not from Google.");
        }

        var expectedAudience = !string.IsNullOrWhiteSpace(_options.EventAudience)
            ? _options.EventAudience.Trim()
            : requestUrl;

        if (string.IsNullOrWhiteSpace(expectedAudience))
        {
            return new VerificationResult(false,
                "Cannot determine this endpoint's own URL to check the token audience against. " +
                "Set GoogleChat:EventAudience to the exact HTTP endpoint URL configured in the " +
                "Chat app.");
        }

        try
        {
            // Signature and expiry against Google's rotating public keys. Issuer
            // and audience are asserted here; the email claim is checked below.
            // Typed as the Google payload rather than the base one so the email
            // claim — the thing that identifies the sending Cloud project — is
            // available without hand-parsing.
            var payload = await JsonWebSignature.VerifySignedTokenAsync<GoogleJsonWebSignature.Payload>(
                systemIdToken,
                new SignedTokenVerificationOptions
                {
                    TrustedIssuers = { SystemTokenIssuer, "accounts.google.com" },
                    TrustedAudiences = { expectedAudience },
                });

            // Identifies *which* Cloud project sent this. Without it, any
            // Google-signed add-on token audienced to this URL would pass — and
            // the caller would have no way to tell one tenant's Chat app from
            // another's, which is what allows a cross-tenant write.
            var senders = await _audiences.GetTrustedSendersAsync();
            if (senders.Count > 0)
            {
                var matched = senders.FirstOrDefault(s =>
                    string.Equals($"service-{s.ProjectNumber}{ServiceAgentSuffix}", payload.Email,
                        StringComparison.OrdinalIgnoreCase));

                if (matched == null)
                {
                    var expected = senders.Select(s => $"service-{s.ProjectNumber}{ServiceAgentSuffix}");
                    return new VerificationResult(false,
                        $"Token was issued for '{payload.Email}', which is not the service agent of any " +
                        $"configured project number. Expected one of: {string.Join(", ", expected)}.");
                }

                return new VerificationResult(true, null, matched);
            }

            // Signature, issuer and audience already passed, so this is not an
            // open door — but without a project number we cannot tell our own
            // Chat app from another one pointed at the same URL, and the caller
            // gets no sender to constrain the Space against. Worth naming.
            _log.LogWarning(
                "Accepting a Google Chat event without checking the sending project: no project " +
                "number configured. Set GoogleServiceAccounts.ProjectNumber (the all-digits value " +
                "from '{Email}') to close this.", payload.Email);

            return new VerificationResult(true, null);
        }
        catch (Exception ex)
        {
            // Detail to the log only; the caller gets a terse reason.
            _log.LogWarning(ex,
                "Google Chat system ID token verification failed (expected audience '{Audience}')",
                expectedAudience);

            return new VerificationResult(false,
                $"Token verification failed. The token's audience must equal '{expectedAudience}' — " +
                "if the Chat app is configured with a different endpoint URL, either fix it there or " +
                "set GoogleChat:EventAudience to match.");
        }
    }
}
