using System.Text.Json;
using BugsManaged.Api.Services.GoogleChat;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BugsManaged.Api.Controllers;

/// <summary>
/// Task 4 — where Google Chat delivers events for our Chat app: a client's reply
/// in their Space, and the app being added to or removed from one.
///
/// Configure this URL as the Chat app's HTTP endpoint (Cloud console → Google
/// Chat API → Configuration → Triggers).
///
/// The payload is the **add-ons framework** shape, which nests everything under
/// `chat` and names the event by which payload object is present, rather than the
/// older format's top-level `type` string:
///
///   { "commonEventObject": { "hostApp": "CHAT" },
///     "authorizationEventObject": { "systemIdToken": "…" },
///     "chat": { "user": {…}, "messagePayload": { "message": {…}, "space": {…} } } }
///
/// The older `{ "type": "MESSAGE", … }` form is deliberately NOT read. That
/// format carries its token in the Authorization header, signed by a different
/// issuer, which GoogleChatRequestVerifier rejects — so a classic-format request
/// never gets as far as the body. Parsing it here would have been unreachable
/// code implying support that doesn't exist.
///
/// AllowAnonymous because Google posts here directly with no session of ours.
/// Authenticity comes from the signed token in the body — see
/// <see cref="GoogleChatRequestVerifier"/>. Nothing is trusted until it verifies.
/// </summary>
[ApiController]
[Route("api/google-chat")]
[AllowAnonymous]
public class GoogleChatWebhookController : ControllerBase
{
    private readonly GoogleChatRequestVerifier _verifier;
    private readonly GoogleChatNotifier _notifier;
    private readonly ILogger<GoogleChatWebhookController> _log;

    public GoogleChatWebhookController(
        GoogleChatRequestVerifier verifier,
        GoogleChatNotifier notifier,
        ILogger<GoogleChatWebhookController> log)
    {
        _verifier = verifier;
        _notifier = notifier;
        _log = log;
    }

    [HttpPost("events")]
    public async Task<IActionResult> HandleEvent([FromBody] JsonElement payload)
    {
       var token = Str(Obj(payload, "authorizationEventObject"), "systemIdToken");

        var verification = await _verifier.VerifyAsync(token, AbsoluteUrl());
        if (!verification.IsValid)
        {
            _log.LogWarning("Rejected a Google Chat event: {Reason}", verification.Reason);
            return Unauthorized(new { message = "Request could not be verified as coming from Google Chat" });
        }

        // Add-ons framework: the event kind is whichever *Payload object is set.
        var chat = Obj(payload, "chat");

        if (Obj(chat, "messagePayload") is { ValueKind: JsonValueKind.Object } messagePayload)
            return await HandleMessageAsync(messagePayload, verification.Sender?.OrganizationId);

        if (Obj(chat, "addedToSpacePayload") is { ValueKind: JsonValueKind.Object } added)
        {
            // Logged rather than acted on, which is what's wanted during rollout:
            // "the client says they never got the invite" is usually answered by
            // whether these ever arrived.
            _log.LogInformation("Added to Google Chat space {Space} ({Name})",
                Str(Obj(added, "space"), "name"), Str(Obj(added, "space"), "displayName"));
            return Ok(new { text = "👋 Thanks — reply here any time and it lands on your ticket." });
        }

        if (Obj(chat, "removedFromSpacePayload") is { ValueKind: JsonValueKind.Object } removed)
        {
            _log.LogInformation("Removed from Google Chat space {Space}",
                Str(Obj(removed, "space"), "name"));
            return Ok();
        }

        // CARD_CLICKED, APP_COMMAND and anything Google adds later. Acknowledge so
        // Chat doesn't retry an event we will never act on.
        _log.LogDebug("Ignoring Google Chat event with no handled payload");
        return Ok();
    }

    /// <summary>
    /// Handles both shapes: <paramref name="container"/> is either the add-ons
    /// `messagePayload` (message under `message`, space alongside it) or the older
    /// top-level event (same layout, so one reader serves both).
    /// </summary>
    private async Task<IActionResult> HandleMessageAsync(
        JsonElement container, long? senderOrganizationId)
    {
        var messageData = Obj(container, "message");
        if (messageData.ValueKind != JsonValueKind.Object)
            return Ok();

        var sender = Obj(messageData, "sender");

        // argumentText is the body minus the app's own @-mention, which is what
        // the client actually typed when addressing the app directly. Plain
        // messages carry no argumentText, so fall back to text.
        var text = Str(messageData, "argumentText") ?? Str(messageData, "text");

        // The space appears on the message and again beside it in the payload;
        // read the message's copy first and fall back.
        var spaceName = Str(Obj(messageData, "space"), "name")
                        ?? Str(Obj(container, "space"), "name");

        var inbound = new GoogleChatNotifier.InboundMessage(
            MessageName: Str(messageData, "name"),
            SpaceName: spaceName,
            ThreadName: Str(Obj(messageData, "thread"), "name"),
            Text: text,
            SenderEmail: Str(sender, "email"),
            SenderDisplayName: Str(sender, "displayName") ?? Str(sender, "email"),
            // Loop prevention: our own posts come back with an app author and must
            // never be re-recorded as client comments.
            SenderIsBot: string.Equals(Str(sender, "type"), "BOT", StringComparison.OrdinalIgnoreCase));

        try
        {
            var outcome = await _notifier.HandleInboundMessageAsync(inbound, senderOrganizationId);

            // Silence on the ordinary outcomes keeps the Space readable; an
            // unmatched message gets a nudge rather than vanishing unexplained.
            return outcome switch
            {
                GoogleChatNotifier.InboundOutcome.UnknownSpace => Ok(new
                {
                    text = "I couldn't tell which ticket that's about. Reply inside a ticket's own " +
                           "thread, or start your message with the ticket number (e.g. `#42`) — a " +
                           "plain message here goes to your most recent ticket, which may be for a " +
                           "different app."
                }),

                // Deliberately opaque to the sender: telling a caller that the
                // Space exists but belongs to someone else confirms the resource
                // name is real. The detail is in our log instead.
                GoogleChatNotifier.InboundOutcome.SpaceNotOwnedBySender => Ok(),

                _ => Ok(),
            };
        }
        catch (Exception ex)
        {
            // 200 on an unexpected failure is deliberate: a 500 makes Chat retry
            // the same event, and if the failure is deterministic that is a retry
            // loop rather than a recovery. Logged instead, for knowing replay.
            _log.LogError(ex, "Failed to handle Google Chat message {Name} from space {Space}",
                inbound.MessageName, inbound.SpaceName);
            return Ok(new { text = "Something went wrong on our side saving that message." });
        }
    }

    /// <summary>
    /// The URL this request arrived on, which Google audiences the token to.
    /// Honours X-Forwarded-* so a tunnel or reverse proxy still produces the
    /// public URL rather than Kestrel's local one.
    /// </summary>
    private string AbsoluteUrl()
    {
        var scheme = Request.Headers["X-Forwarded-Proto"].FirstOrDefault() ?? Request.Scheme;
        var host = Request.Headers["X-Forwarded-Host"].FirstOrDefault() ?? Request.Host.Value;
        return $"{scheme}://{host}{Request.Path}";
    }

    private static JsonElement Obj(JsonElement element, string property) =>
        element.ValueKind == JsonValueKind.Object && element.TryGetProperty(property, out var value)
            ? value
            : default;

    private static string? Str(JsonElement element, string property) =>
        element.ValueKind == JsonValueKind.Object
        && element.TryGetProperty(property, out var value)
        && value.ValueKind == JsonValueKind.String
            ? value.GetString()
            : null;
}
