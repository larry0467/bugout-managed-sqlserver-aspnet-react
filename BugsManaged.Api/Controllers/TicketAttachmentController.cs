using System.Security.Claims;
using BugsManaged.Api.Data;
using BugsManaged.Api.Entities;
using BugsManaged.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Cors;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BugsManaged.Api.Controllers;

[ApiController]
[Route("api/tickets/{ticketId}/attachments")]
public class TicketAttachmentController : ControllerBase
{
    // Screenshot upload has two legitimate callers:
    //   1) Authorized dashboard user adding a screenshot to a ticket they
    //      have access to (admin chat / detail panel). Auth via JWT.
    //   2) The unauthenticated widget posting screenshots for an already
    //      created ticket (companion to /tickets/{id}/video). Auth via the
    //      X-BOM-API-Key header that already gates ticket create + video.
    // Both paths land in the same Upload action; route attributes pick
    // the right gate.

    private readonly BugsManagedDbContext _db;
    private readonly IScreenshotBlobService _blobs;
    private readonly ITicketActivityLogger _activity;
    private readonly IOrgContext _org;
    private readonly ILogger<TicketAttachmentController> _log;

    public TicketAttachmentController(BugsManagedDbContext db, IScreenshotBlobService blobs, ITicketActivityLogger activity, IOrgContext org, ILogger<TicketAttachmentController> log)
    {
        _db = db;
        _blobs = blobs;
        _activity = activity;
        _org = org;
        _log = log;
    }

    // Generic file attachments: 25 MB cap covers screenshots, .har dumps,
    // logs, CSVs, mock-ups. Bigger payloads should go through the video
    // upload path (which has its own 50 MB ceiling). Extension allow-list
    // blocks obvious executable/script types so a malicious upload can't
    // be served back as the wrong content type from the blob.
    private const long MaxFileBytes = 25L * 1024 * 1024;
    private static readonly HashSet<string> BlockedExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".exe", ".dll", ".bat", ".cmd", ".sh", ".ps1", ".msi", ".js", ".jar",
        ".com", ".scr", ".vbs", ".php", ".aspx", ".cgi",
    };

    [HttpPost("widget")]
    [AllowAnonymous]
    [EnableCors("WidgetPolicy")]
    public async Task<IActionResult> UploadFromWidget(long ticketId, IFormFile file, [FromQuery] long? noteId = null)
    {
        if (_org.CurrentProjectId == null || _org.CurrentOrganizationId == null)
            return Unauthorized(new { message = "Missing or invalid X-BOM-API-Key header" });

        var ticket = await _db.Tickets
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(t => t.Id == ticketId
                && t.ProjectId == _org.CurrentProjectId.Value
                && t.OrganizationId == _org.CurrentOrganizationId.Value);
        if (ticket == null) return NotFound(new { message = "Ticket not found" });

        return await StoreAsync(ticket, file, noteId, uploadedBy: ticket.SubmittedBy, actorName: null, fromWidget: true);
    }

    [HttpPost]
    [Authorize]
    public async Task<IActionResult> Upload(long ticketId, IFormFile file, [FromQuery] long? noteId = null)
    {
        var ticket = await _db.Tickets.FirstOrDefaultAsync(t => t.Id == ticketId);
        if (ticket == null) return NotFound(new { message = "Ticket not found" });

        var email = User.FindFirstValue(ClaimTypes.Email);
        var name = User.FindFirstValue("fullName");
        return await StoreAsync(ticket, file, noteId, uploadedBy: email, actorName: name, fromWidget: false);
    }

    [HttpGet]
    [Authorize]
    public async Task<IActionResult> List(long ticketId)
    {
        // Verify access via the query filter.
        var ticket = await _db.Tickets.FirstOrDefaultAsync(t => t.Id == ticketId);
        if (ticket == null) return NotFound(new { message = "Ticket not found" });

        var rows = await _db.TicketAttachments
            .Where(a => a.TicketId == ticketId)
            .OrderBy(a => a.CreatedAt)
            .ToListAsync();
        return Ok(rows);
    }

    [HttpGet("{attachmentId}/url")]
    [Authorize]
    public async Task<IActionResult> GetSasUrl(long ticketId, long attachmentId)
    {
        var att = await _db.TicketAttachments.FirstOrDefaultAsync(a => a.Id == attachmentId && a.TicketId == ticketId);
        if (att == null) return NotFound(new { message = "Attachment not found" });

        var sas = await _blobs.GenerateSasUriAsync(att.BlobUrl, TimeSpan.FromHours(1));
        return Ok(new { url = sas.ToString() });
    }

    private async Task<IActionResult> StoreAsync(Ticket ticket, IFormFile file, long? noteId, string? uploadedBy, string? actorName, bool fromWidget)
    {
        if (file == null || file.Length == 0)
            return BadRequest(new { message = "No file provided" });
        if (file.Length > MaxFileBytes)
            return BadRequest(new { message = $"File exceeds {MaxFileBytes / (1024 * 1024)} MB limit" });

        var extension = Path.GetExtension(file.FileName).ToLowerInvariant();
        if (BlockedExtensions.Contains(extension))
            return BadRequest(new { message = $"File type '{extension}' is not permitted" });
        if (string.IsNullOrEmpty(extension)) extension = ".bin";

        await using var stream = file.OpenReadStream();
        string blobUri;
        try
        {
            blobUri = await _blobs.UploadAsync(stream, extension, ticket.Id);
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "Screenshot upload failed for ticket {TicketId}", ticket.Id);
            return StatusCode(500, new { message = "Screenshot storage unavailable" });
        }

        var att = new TicketAttachment
        {
            OrganizationId = ticket.OrganizationId,
            TicketId = ticket.Id,
            NoteId = noteId,
            BlobUrl = blobUri,
            FileName = string.IsNullOrEmpty(file.FileName) ? $"screenshot{extension}" : file.FileName,
            ContentType = file.ContentType,
            SizeBytes = file.Length,
            UploadedBy = uploadedBy,
            CreatedAt = DateTime.UtcNow,
        };
        _db.TicketAttachments.Add(att);

        // Don't record activity for the widget's initial bug-report attachments —
        // they're effectively part of "ticket created", and a separate activity
        // entry for each would just be noise.
        if (!fromWidget)
        {
            _activity.Log(ticket,
                kind: noteId.HasValue ? "CHAT_SCREENSHOT_ADDED" : "SCREENSHOT_ADDED",
                message: $"{uploadedBy ?? "Someone"} attached {att.FileName}",
                actorEmail: uploadedBy,
                actorName: actorName,
                payload: new { attachmentId = att.Id, noteId, fileName = att.FileName });
        }

        await _db.SaveChangesAsync();

        return Ok(new
        {
            id = att.Id,
            fileName = att.FileName,
            sizeBytes = att.SizeBytes,
            noteId = att.NoteId,
        });
    }
}
