using BugsManaged.Api.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BugsManaged.Api.Controllers;

[ApiController]
[Route("api/tickets/{ticketId}/activity")]
[Authorize]
public class TicketActivityController : ControllerBase
{
    private readonly BugsManagedDbContext _db;

    public TicketActivityController(BugsManagedDbContext db)
    {
        _db = db;
    }

    [HttpGet]
    public async Task<IActionResult> List(long ticketId)
    {
        // Org-scoped via global filter; cross-tenant ids surface as 404.
        var ticket = await _db.Tickets.FirstOrDefaultAsync(t => t.Id == ticketId);
        if (ticket == null) return NotFound(new { message = "Ticket not found" });

        var items = await _db.TicketActivities
            .Where(a => a.TicketId == ticketId)
            .OrderByDescending(a => a.CreatedAt)
            .Take(200)
            .ToListAsync();
        return Ok(items);
    }
}
