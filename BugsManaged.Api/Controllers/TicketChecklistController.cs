using System.Security.Claims;
using BugsManaged.Api.Data;
using BugsManaged.Api.Entities;
using BugsManaged.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BugsManaged.Api.Controllers;

[ApiController]
[Route("api/tickets/{ticketId}/checklist")]
[Authorize]
public class TicketChecklistController : ControllerBase
{
    private readonly BugsManagedDbContext _db;
    private readonly ITicketActivityLogger _activity;

    public TicketChecklistController(BugsManagedDbContext db, ITicketActivityLogger activity)
    {
        _db = db;
        _activity = activity;
    }

    [HttpGet]
    public async Task<IActionResult> List(long ticketId)
    {
        var ticket = await _db.Tickets.FirstOrDefaultAsync(t => t.Id == ticketId);
        if (ticket == null) return NotFound(new { message = "Ticket not found" });

        var items = await _db.TicketChecklistItems
            .Where(c => c.TicketId == ticketId)
            .OrderBy(c => c.SortOrder)
            .ToListAsync();
        return Ok(items);
    }

    public record CreateItemRequest(string Text);

    [HttpPost]
    public async Task<IActionResult> Add(long ticketId, [FromBody] CreateItemRequest body)
    {
        if (string.IsNullOrWhiteSpace(body.Text)) return BadRequest(new { message = "Text is required" });
        var ticket = await _db.Tickets.FirstOrDefaultAsync(t => t.Id == ticketId);
        if (ticket == null) return NotFound(new { message = "Ticket not found" });

        var email = User.FindFirstValue(ClaimTypes.Email);
        var name = User.FindFirstValue("fullName");
        var maxOrder = await _db.TicketChecklistItems
            .Where(c => c.TicketId == ticketId)
            .Select(c => (int?)c.SortOrder)
            .MaxAsync() ?? -1;

        var item = new TicketChecklistItem
        {
            OrganizationId = ticket.OrganizationId,
            TicketId = ticketId,
            Text = body.Text.Trim(),
            SortOrder = maxOrder + 1,
            CreatedBy = email,
            CreatedAt = DateTime.UtcNow,
        };
        _db.TicketChecklistItems.Add(item);
        _activity.Log(ticket, "CHECKLIST_ADDED", $"{name ?? email ?? "Someone"} added a checklist item: \"{item.Text}\"", email, name,
            payload: new { itemId = item.Id, text = item.Text });
        await _db.SaveChangesAsync();
        return Ok(item);
    }

    public record UpdateItemRequest(string? Text, bool? IsDone);

    [HttpPut("{itemId}")]
    public async Task<IActionResult> Update(long ticketId, long itemId, [FromBody] UpdateItemRequest body)
    {
        var item = await _db.TicketChecklistItems.FirstOrDefaultAsync(c => c.Id == itemId && c.TicketId == ticketId);
        if (item == null) return NotFound();

        var ticket = await _db.Tickets.FirstOrDefaultAsync(t => t.Id == ticketId);
        if (ticket == null) return NotFound();

        var email = User.FindFirstValue(ClaimTypes.Email);
        var name = User.FindFirstValue("fullName");

        if (!string.IsNullOrWhiteSpace(body.Text)) item.Text = body.Text.Trim();
        if (body.IsDone.HasValue && body.IsDone.Value != item.IsDone)
        {
            item.IsDone = body.IsDone.Value;
            if (item.IsDone)
            {
                item.DoneBy = email;
                item.DoneAt = DateTime.UtcNow;
                _activity.Log(ticket, "CHECKLIST_COMPLETED", $"{name ?? email ?? "Someone"} checked off: \"{item.Text}\"", email, name,
                    payload: new { itemId = item.Id, text = item.Text });
            }
            else
            {
                item.DoneBy = null;
                item.DoneAt = null;
            }
        }

        await _db.SaveChangesAsync();
        return Ok(item);
    }

    [HttpDelete("{itemId}")]
    public async Task<IActionResult> Delete(long ticketId, long itemId)
    {
        var item = await _db.TicketChecklistItems.FirstOrDefaultAsync(c => c.Id == itemId && c.TicketId == ticketId);
        if (item == null) return NoContent();
        _db.TicketChecklistItems.Remove(item);
        await _db.SaveChangesAsync();
        return NoContent();
    }
}
