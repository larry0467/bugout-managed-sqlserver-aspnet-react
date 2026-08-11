using System.Text.Json;
using System.Text.RegularExpressions;
using BugsManaged.Api.Data;
using BugsManaged.Api.Entities;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BugsManaged.Api.Controllers;

[ApiController]
[Route("api/google-chat")]
[AllowAnonymous]
public class GoogleChatWebhookController : ControllerBase
{
    private readonly BugsManagedDbContext _db;
    private readonly ILogger<GoogleChatWebhookController> _logger;
    private readonly string? _verificationToken;
    private static readonly Regex TicketIdPattern = new(@"(?:#|ticket:)(\d+)", RegexOptions.Compiled);

    public GoogleChatWebhookController(BugsManagedDbContext db, IConfiguration config, ILogger<GoogleChatWebhookController> logger)
    {
        _db = db;
        _logger = logger;
        _verificationToken = config["GoogleChat:VerificationToken"];
    }

    [HttpPost("events")]
    public async Task<IActionResult> HandleEvent([FromBody] JsonElement payload)
    {
        // Shared-secret check: the Google Chat app config carries a
        // verification token that gets echoed back in every event payload.
        // Without a configured token we can't tell a real Google Chat event
        // from a forged POST to this (AllowAnonymous) endpoint, so we log
        // and allow through — but a token should be configured in
        // production. See appsettings.json "GoogleChat:VerificationToken".
        if (!string.IsNullOrEmpty(_verificationToken))
        {
            var incomingToken = payload.TryGetProperty("token", out var tokenEl) ? tokenEl.GetString() : null;
            if (incomingToken != _verificationToken)
            {
                _logger.LogWarning("Google Chat webhook rejected: verification token mismatch");
                return Unauthorized(new { message = "Invalid verification token" });
            }
        }
        else
        {
            _logger.LogWarning("Google Chat webhook has no VerificationToken configured — accepting unverified events");
        }

        if (payload.TryGetProperty("type", out var type))
        {
            var eventType = type.GetString();

            // Handle standard message
            if (eventType == "MESSAGE")
            {
                if (payload.TryGetProperty("message", out var messageData))
                {
                    var text = messageData.TryGetProperty("text", out var t) ? t.GetString() : null;
                    var senderData = messageData.TryGetProperty("sender", out var s) ? s : default;
                    var senderEmail = senderData.ValueKind != JsonValueKind.Undefined && senderData.TryGetProperty("email", out var e) ? e.GetString() : "google-chat-user";
                    var senderName = senderData.ValueKind != JsonValueKind.Undefined && senderData.TryGetProperty("displayName", out var dn) ? dn.GetString() : senderEmail;
                    var threadName = messageData.TryGetProperty("thread", out var th) && th.TryGetProperty("name", out var tn) ? tn.GetString() : null;

                    if (!string.IsNullOrEmpty(text) || !string.IsNullOrEmpty(threadName))
                    {
                        Ticket? ticket = null;

                        // Prefer thread correlation — it works for any reply
                        // in the ticket's Chat thread, not just ones where
                        // the human typed "#123".
                        if (!string.IsNullOrEmpty(threadName))
                        {
                            ticket = await _db.Tickets.IgnoreQueryFilters().FirstOrDefaultAsync(t => t.GoogleChatThreadName == threadName);
                        }

                        if (ticket == null && !string.IsNullOrEmpty(text))
                        {
                            var match = TicketIdPattern.Match(text);
                            if (match.Success && long.TryParse(match.Groups[1].Value, out var ticketId))
                            {
                                ticket = await _db.Tickets.IgnoreQueryFilters().FirstOrDefaultAsync(t => t.Id == ticketId);
                            }
                        }

                        if (ticket != null && !string.IsNullOrEmpty(text))
                        {
                            var note = new TicketNote
                            {
                                TicketId = ticket.Id,
                                OrganizationId = ticket.OrganizationId,
                                AuthorEmail = senderEmail ?? "unknown",
                                AuthorName = senderName,
                                Content = text.Trim(),
                                NoteType = "COMMENT",
                                Source = "GOOGLE_CHAT"
                            };

                            _db.TicketNotes.Add(note);
                            await _db.SaveChangesAsync();
                        }
                    }
                }
            }

            // Acknowledge the event
            return Ok(new { text = "Message received." });
        }

        return BadRequest(new { message = "Invalid payload" });
    }
}
