using System.Security.Claims;
using BugsManaged.Api.Data;
using BugsManaged.Api.Entities;
using BugsManaged.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BugsManaged.Api.Controllers;

// Two surfaces:
//   1) /api/labels           — org-level label dictionary CRUD
//   2) /api/tickets/{id}/labels — attach/detach a label to a ticket
[ApiController]
[Authorize]
public class TicketLabelController : ControllerBase
{
    private readonly BugsManagedDbContext _db;
    private readonly ITicketActivityLogger _activity;
    private readonly IOrgContext _org;

    public TicketLabelController(BugsManagedDbContext db, ITicketActivityLogger activity, IOrgContext org)
    {
        _db = db;
        _activity = activity;
        _org = org;
    }

    [HttpGet("/api/labels")]
    public async Task<IActionResult> ListLabels()
    {
        var labels = await _db.TicketLabels.OrderBy(l => l.Name).ToListAsync();
        return Ok(labels);
    }

    public record CreateLabelRequest(string Name, string Color);

    [HttpPost("/api/labels")]
    public async Task<IActionResult> CreateLabel([FromBody] CreateLabelRequest body)
    {
        if (_org.CurrentOrganizationId == null) return Unauthorized();
        if (string.IsNullOrWhiteSpace(body.Name)) return BadRequest(new { message = "Name is required" });
        if (string.IsNullOrWhiteSpace(body.Color) || !body.Color.StartsWith('#') || body.Color.Length != 7)
            return BadRequest(new { message = "Color must be 7-char hex like #ff9800" });

        var name = body.Name.Trim();
        var existing = await _db.TicketLabels.FirstOrDefaultAsync(l => l.Name == name);
        if (existing != null) return Conflict(new { message = "Label name already in use" });

        var label = new TicketLabel
        {
            OrganizationId = _org.CurrentOrganizationId.Value,
            Name = name,
            Color = body.Color,
        };
        _db.TicketLabels.Add(label);
        await _db.SaveChangesAsync();
        return Ok(label);
    }

    public record UpdateLabelRequest(string? Name, string? Color);

    [HttpPut("/api/labels/{id}")]
    public async Task<IActionResult> UpdateLabel(long id, [FromBody] UpdateLabelRequest body)
    {
        var label = await _db.TicketLabels.FirstOrDefaultAsync(l => l.Id == id);
        if (label == null) return NotFound();

        if (!string.IsNullOrWhiteSpace(body.Name)) label.Name = body.Name.Trim();
        if (!string.IsNullOrWhiteSpace(body.Color)) label.Color = body.Color;
        await _db.SaveChangesAsync();
        return Ok(label);
    }

    [HttpDelete("/api/labels/{id}")]
    public async Task<IActionResult> DeleteLabel(long id)
    {
        var label = await _db.TicketLabels.FirstOrDefaultAsync(l => l.Id == id);
        if (label == null) return NotFound();

        // Cascade clean-up of assignments first so we don't leave orphans.
        var assignments = await _db.TicketLabelAssignments.Where(a => a.LabelId == id).ToListAsync();
        _db.TicketLabelAssignments.RemoveRange(assignments);
        _db.TicketLabels.Remove(label);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    // ===== Ticket ↔ label assignment =====

    [HttpGet("/api/tickets/{ticketId}/labels")]
    public async Task<IActionResult> ListTicketLabels(long ticketId)
    {
        var ticket = await _db.Tickets.FirstOrDefaultAsync(t => t.Id == ticketId);
        if (ticket == null) return NotFound(new { message = "Ticket not found" });

        var labels = await (from a in _db.TicketLabelAssignments
                            join l in _db.TicketLabels on a.LabelId equals l.Id
                            where a.TicketId == ticketId
                            select l)
                            .ToListAsync();
        return Ok(labels);
    }

    public record AttachLabelRequest(long LabelId);

    [HttpPost("/api/tickets/{ticketId}/labels")]
    public async Task<IActionResult> AttachLabel(long ticketId, [FromBody] AttachLabelRequest body)
    {
        var ticket = await _db.Tickets.FirstOrDefaultAsync(t => t.Id == ticketId);
        if (ticket == null) return NotFound(new { message = "Ticket not found" });

        var label = await _db.TicketLabels.FirstOrDefaultAsync(l => l.Id == body.LabelId);
        if (label == null) return NotFound(new { message = "Label not found" });

        var exists = await _db.TicketLabelAssignments.AnyAsync(a => a.TicketId == ticketId && a.LabelId == body.LabelId);
        if (exists) return Ok(new { ok = true });

        _db.TicketLabelAssignments.Add(new TicketLabelAssignment
        {
            OrganizationId = ticket.OrganizationId,
            TicketId = ticketId,
            LabelId = body.LabelId,
        });
        var email = User.FindFirstValue(ClaimTypes.Email);
        var name = User.FindFirstValue("fullName");
        _activity.Log(ticket, "LABEL_ADDED", $"{name ?? email ?? "Someone"} added label '{label.Name}'", email, name,
            payload: new { labelId = label.Id, name = label.Name, color = label.Color });
        await _db.SaveChangesAsync();
        return Ok(new { ok = true });
    }

    [HttpDelete("/api/tickets/{ticketId}/labels/{labelId}")]
    public async Task<IActionResult> DetachLabel(long ticketId, long labelId)
    {
        var ticket = await _db.Tickets.FirstOrDefaultAsync(t => t.Id == ticketId);
        if (ticket == null) return NotFound(new { message = "Ticket not found" });

        var assignment = await _db.TicketLabelAssignments.FirstOrDefaultAsync(a => a.TicketId == ticketId && a.LabelId == labelId);
        if (assignment == null) return NoContent();

        var label = await _db.TicketLabels.FirstOrDefaultAsync(l => l.Id == labelId);
        _db.TicketLabelAssignments.Remove(assignment);
        var email = User.FindFirstValue(ClaimTypes.Email);
        var name = User.FindFirstValue("fullName");
        _activity.Log(ticket, "LABEL_REMOVED", $"{name ?? email ?? "Someone"} removed label '{label?.Name ?? labelId.ToString()}'", email, name,
            payload: new { labelId, name = label?.Name });
        await _db.SaveChangesAsync();
        return NoContent();
    }
}
