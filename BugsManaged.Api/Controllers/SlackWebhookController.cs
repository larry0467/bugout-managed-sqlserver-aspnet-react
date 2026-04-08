using System.Text.Json;
using System.Text.RegularExpressions;
using BugsManaged.Api.Data;
using BugsManaged.Api.Entities;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BugsManaged.Api.Controllers;

[ApiController]
[Route("api/slack")]
[AllowAnonymous]
public class SlackWebhookController : ControllerBase
{
    private readonly BugsManagedDbContext _db;
    private static readonly Regex TicketIdPattern = new(@"(?:#|ticket:)(\d+)", RegexOptions.Compiled);

    public SlackWebhookController(BugsManagedDbContext db)
    {
        _db = db;
    }

    [HttpPost("events")]
    public async Task<IActionResult> HandleEvent([FromBody] JsonElement payload)
    {
        // Handle Slack URL verification challenge
        if (payload.TryGetProperty("type", out var type) && type.GetString() == "url_verification")
        {
            var challenge = payload.GetProperty("challenge").GetString();
            return Ok(new { challenge });
        }

        // Handle event callbacks
        if (payload.TryGetProperty("event", out var eventData))
        {
            var eventType = eventData.TryGetProperty("type", out var et) ? et.GetString() : null;
            if (eventType == "message" || eventType == "app_mention")
            {
                var text = eventData.TryGetProperty("text", out var t) ? t.GetString() : null;
                var slackUser = eventData.TryGetProperty("user", out var u) ? u.GetString() : "slack-user";
                var threadTs = eventData.TryGetProperty("thread_ts", out var ts) ? ts.GetString()
                    : eventData.TryGetProperty("ts", out var msgTs) ? msgTs.GetString() : null;

                if (!string.IsNullOrEmpty(text))
                {
                    var match = TicketIdPattern.Match(text);
                    if (match.Success && long.TryParse(match.Groups[1].Value, out var ticketId))
                    {
                        var ticket = await _db.Tickets.FindAsync(ticketId);
                        if (ticket != null)
                        {
                            // Strip the ticket reference from the message to get the note content
                            var content = TicketIdPattern.Replace(text, "").Trim();
                            if (!string.IsNullOrEmpty(content))
                            {
                                var note = new TicketNote
                                {
                                    TicketId = ticketId,
                                    AuthorEmail = $"{slackUser}@slack",
                                    AuthorName = slackUser,
                                    Content = content,
                                    NoteType = "COMMENT",
                                    Source = "SLACK",
                                    SlackThreadTs = threadTs
                                };

                                _db.TicketNotes.Add(note);
                                await _db.SaveChangesAsync();
                            }
                        }
                    }
                }
            }
        }

        return Ok();
    }

    [HttpPost("command")]
    public async Task<IActionResult> HandleCommand([FromForm] SlackCommandRequest request)
    {
        // Expected format: /bug-chat [ticket-id] [message]
        var text = request.Text?.Trim() ?? string.Empty;
        var parts = text.Split(' ', 2, StringSplitOptions.RemoveEmptyEntries);

        if (parts.Length < 2 || !long.TryParse(parts[0], out var ticketId))
        {
            return Ok(new
            {
                response_type = "ephemeral",
                text = "Usage: /bug-chat [ticket-id] [message]\nExample: /bug-chat 123 This is my comment"
            });
        }

        var message = parts[1];
        var ticket = await _db.Tickets.FindAsync(ticketId);
        if (ticket == null)
        {
            return Ok(new
            {
                response_type = "ephemeral",
                text = $"Ticket #{ticketId} not found."
            });
        }

        var note = new TicketNote
        {
            TicketId = ticketId,
            AuthorEmail = $"{request.UserId}@slack",
            AuthorName = request.UserName ?? request.UserId ?? "slack-user",
            Content = message,
            NoteType = "COMMENT",
            Source = "SLACK"
        };

        _db.TicketNotes.Add(note);
        await _db.SaveChangesAsync();

        return Ok(new
        {
            response_type = "in_channel",
            text = $"Comment added to ticket #{ticketId}: {message}"
        });
    }

    public class SlackCommandRequest
    {
        [FromForm(Name = "command")]
        public string? Command { get; set; }

        [FromForm(Name = "text")]
        public string? Text { get; set; }

        [FromForm(Name = "user_id")]
        public string? UserId { get; set; }

        [FromForm(Name = "user_name")]
        public string? UserName { get; set; }

        [FromForm(Name = "channel_id")]
        public string? ChannelId { get; set; }

        [FromForm(Name = "channel_name")]
        public string? ChannelName { get; set; }

        [FromForm(Name = "team_id")]
        public string? TeamId { get; set; }

        [FromForm(Name = "response_url")]
        public string? ResponseUrl { get; set; }

        [FromForm(Name = "trigger_id")]
        public string? TriggerId { get; set; }
    }
}
