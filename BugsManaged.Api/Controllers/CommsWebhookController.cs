using BugsManaged.Api.Data;
using BugsManaged.Api.Entities;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BugsManaged.Api.Controllers;

/// <summary>
/// Receives inbound Comms Managed webhook events and syncs them back into
/// Bug Out as TicketNotes so the dev team sees the full conversation in the
/// Bug Out dashboard — without having to switch to Comms.
///
/// Setup in Comms:
///   POST /api/v1/webhooks  { event: "message.received", url: "{BUG_OUT_URL}/api/webhooks/comms" }
///
/// The webhook fires when a reporter replies to a notification email.
/// Bug Out parses the entityRef ("ticket:42") to find the target ticket and
/// appends the reply body as a TicketNote with Source="EMAIL".
/// </summary>
[ApiController]
[Route("api/webhooks/comms")]
public class CommsWebhookController : ControllerBase
{
    private readonly BugsManagedDbContext _db;
    private readonly IConfiguration _config;
    private readonly ILogger<CommsWebhookController> _log;

    public CommsWebhookController(
        BugsManagedDbContext db,
        IConfiguration config,
        ILogger<CommsWebhookController> log)
    {
        _db = db;
        _config = config;
        _log = log;
    }

    [HttpPost]
    public async Task<IActionResult> Receive([FromBody] CommsWebhookPayload payload, CancellationToken ct)
    {
        // Optional shared secret validation — set CommsManaged:WebhookSecret in appsettings.
        var secret = _config["CommsManaged:WebhookSecret"];
        if (!string.IsNullOrWhiteSpace(secret))
        {
            var provided = Request.Headers["X-Comms-Signature"].FirstOrDefault();
            if (provided != secret)
            {
                _log.LogWarning("Comms webhook: invalid signature from {IP}", HttpContext.Connection.RemoteIpAddress);
                return Unauthorized();
            }
        }

        if (payload.Event != "message.received" || payload.Data == null)
            return Ok();

        var data = payload.Data;

        // Extract ticket id from entityRef "ticket:42"
        if (!TryParseTicketId(data.EntityRef, out var ticketId))
        {
            _log.LogDebug("Comms webhook: no ticket entityRef in message {Id}", data.MessageId);
            return Ok();
        }

        var ticket = await _db.Tickets.FirstOrDefaultAsync(t => t.Id == ticketId, ct);
        if (ticket == null)
        {
            _log.LogWarning("Comms webhook: ticket {Id} not found", ticketId);
            return Ok();
        }

        var note = new TicketNote
        {
            TicketId    = ticket.Id,
            AuthorEmail = data.SenderEmail ?? data.From ?? "reporter",
            AuthorName  = data.SenderName  ?? data.SenderEmail ?? "Reporter",
            Content     = data.Body ?? string.Empty,
            NoteType    = "COMMENT",
            Source      = "EMAIL",
            CreatedAt   = DateTime.UtcNow,
        };

        _db.TicketNotes.Add(note);
        await _db.SaveChangesAsync(ct);

        _log.LogInformation(
            "Comms webhook: added TicketNote {NoteId} to ticket {TicketId} from {Author}",
            note.Id, ticket.Id, note.AuthorEmail);

        return Ok();
    }

    private static bool TryParseTicketId(string? entityRef, out long id)
    {
        id = 0;
        if (string.IsNullOrWhiteSpace(entityRef)) return false;
        // Expected format: "ticket:42"
        var parts = entityRef.Split(':');
        return parts.Length == 2
            && parts[0].Equals("ticket", StringComparison.OrdinalIgnoreCase)
            && long.TryParse(parts[1], out id);
    }
}

// ---------------------------------------------------------------------------
// Webhook payload shapes — matches Comms Managed's message.received event
// ---------------------------------------------------------------------------
public class CommsWebhookPayload
{
    public string Event { get; set; } = string.Empty;
    public CommsWebhookData? Data { get; set; }
}

public class CommsWebhookData
{
    public string? MessageId   { get; set; }
    public string? ThreadId    { get; set; }
    public string? EntityRef   { get; set; }
    public string? EntityTitle { get; set; }
    public string? SenderEmail { get; set; }
    public string? SenderName  { get; set; }
    public string? From        { get; set; }
    public string? Body        { get; set; }
    public string? Channel     { get; set; }
    public string? SentAt      { get; set; }
}
