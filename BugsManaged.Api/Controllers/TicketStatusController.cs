using BugsManaged.Api.Data;
using BugsManaged.Api.Entities;
using BugsManaged.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BugsManaged.Api.Controllers;

[ApiController]
[Route("api/statuses")]
[Authorize]
public class TicketStatusController : ControllerBase
{
    private readonly BugsManagedDbContext _db;
    private readonly IOrgContext _org;

    // Defaults seeded into every org the first time their status list is
    // read. Matches what was hardcoded before custom statuses existed so
    // pre-existing tickets render normally without a backfill.
    private static readonly (string Key, string Display, string Color, int SortOrder, bool IsClosed)[] Defaults =
    {
        ("OPEN",              "Open",              "#fbbf24", 0, false),
        ("IN_PROGRESS",       "In Progress",       "#3b82f6", 1, false),
        ("IN_REVIEW",         "In Review",         "#a855f7", 2, false),
        ("READY_FOR_TESTING", "Ready for Testing", "#06b6d4", 3, false),
        ("VERIFIED",          "Verified",          "#0ea5e9", 4, false),
        ("RESOLVED",          "Resolved",          "#22c55e", 5, true),
        ("CLOSED",            "Closed",            "#6b7280", 6, true),
    };

    public TicketStatusController(BugsManagedDbContext db, IOrgContext org)
    {
        _db = db;
        _org = org;
    }

    [HttpGet]
    public async Task<IActionResult> List()
    {
        if (_org.CurrentOrganizationId == null) return Unauthorized();
        await EnsureSeededAsync(_org.CurrentOrganizationId.Value);

        var rows = await _db.TicketStatusDefs
            .OrderBy(s => s.SortOrder)
            .ToListAsync();
        return Ok(rows);
    }

    public record CreateRequest(string Key, string DisplayName, string Color, bool IsClosedLike);

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateRequest body)
    {
        if (_org.CurrentOrganizationId == null) return Unauthorized();
        if (string.IsNullOrWhiteSpace(body.Key)) return BadRequest(new { message = "Key is required" });
        if (string.IsNullOrWhiteSpace(body.DisplayName)) return BadRequest(new { message = "DisplayName is required" });

        var key = body.Key.Trim().ToUpperInvariant().Replace(' ', '_');
        var existing = await _db.TicketStatusDefs.AnyAsync(s => s.Key == key);
        if (existing) return Conflict(new { message = "Status key already exists" });

        var maxOrder = await _db.TicketStatusDefs.Select(s => (int?)s.SortOrder).MaxAsync() ?? -1;
        var def = new TicketStatusDef
        {
            OrganizationId = _org.CurrentOrganizationId.Value,
            Key = key,
            DisplayName = body.DisplayName.Trim(),
            Color = string.IsNullOrWhiteSpace(body.Color) ? "#888888" : body.Color,
            SortOrder = maxOrder + 1,
            IsClosedLike = body.IsClosedLike,
        };
        _db.TicketStatusDefs.Add(def);
        await _db.SaveChangesAsync();
        return Ok(def);
    }

    public record UpdateRequest(string? DisplayName, string? Color, bool? IsClosedLike, int? SortOrder);

    [HttpPut("{id}")]
    public async Task<IActionResult> Update(long id, [FromBody] UpdateRequest body)
    {
        var def = await _db.TicketStatusDefs.FirstOrDefaultAsync(s => s.Id == id);
        if (def == null) return NotFound();

        if (!string.IsNullOrWhiteSpace(body.DisplayName)) def.DisplayName = body.DisplayName.Trim();
        if (!string.IsNullOrWhiteSpace(body.Color)) def.Color = body.Color;
        if (body.IsClosedLike.HasValue) def.IsClosedLike = body.IsClosedLike.Value;
        if (body.SortOrder.HasValue) def.SortOrder = body.SortOrder.Value;

        await _db.SaveChangesAsync();
        return Ok(def);
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(long id)
    {
        var def = await _db.TicketStatusDefs.FirstOrDefaultAsync(s => s.Id == id);
        if (def == null) return NoContent();

        // Block deletion if any ticket is still parked at this status — UI
        // can pick a replacement and PATCH those tickets first.
        var inUse = await _db.Tickets.AnyAsync(t => t.Status == def.Key);
        if (inUse) return Conflict(new { message = "Status is in use by one or more tickets; move them first." });

        _db.TicketStatusDefs.Remove(def);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    private async Task EnsureSeededAsync(long orgId)
    {
        var any = await _db.TicketStatusDefs.AnyAsync();
        if (any) return;

        foreach (var d in Defaults)
        {
            _db.TicketStatusDefs.Add(new TicketStatusDef
            {
                OrganizationId = orgId,
                Key = d.Key,
                DisplayName = d.Display,
                Color = d.Color,
                SortOrder = d.SortOrder,
                IsClosedLike = d.IsClosed,
            });
        }
        await _db.SaveChangesAsync();
    }
}
