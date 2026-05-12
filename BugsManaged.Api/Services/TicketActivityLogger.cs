using System.Text.Json;
using BugsManaged.Api.Data;
using BugsManaged.Api.Entities;

namespace BugsManaged.Api.Services;

// Thin helper around the TicketActivity DbSet. Pre-bakes the common fields
// so callers just describe what happened in one line. Caller is responsible
// for SaveChangesAsync — we attach the entry into the same tracked unit of
// work as the mutation it describes, so a rollback unrolls both together.
public interface ITicketActivityLogger
{
    void Log(Ticket ticket, string kind, string message, string? actorEmail, string? actorName = null, object? payload = null);
}

public class TicketActivityLogger : ITicketActivityLogger
{
    private readonly BugsManagedDbContext _db;

    public TicketActivityLogger(BugsManagedDbContext db)
    {
        _db = db;
    }

    public void Log(Ticket ticket, string kind, string message, string? actorEmail, string? actorName = null, object? payload = null)
    {
        // Truncate to MaxLength rather than throwing — activity logging
        // must never break a real mutation.
        if (message.Length > 1000) message = message[..1000];

        _db.TicketActivities.Add(new TicketActivity
        {
            OrganizationId = ticket.OrganizationId,
            TicketId = ticket.Id,
            ActorEmail = actorEmail,
            ActorName = actorName,
            Kind = kind,
            Message = message,
            PayloadJson = payload != null ? JsonSerializer.Serialize(payload) : null,
            CreatedAt = DateTime.UtcNow,
        });
    }
}
