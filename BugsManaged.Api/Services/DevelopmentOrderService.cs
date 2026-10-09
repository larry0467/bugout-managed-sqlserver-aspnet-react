using System.Security.Claims;
using BugsManaged.Api.Data;
using BugsManaged.Api.Entities;
using Microsoft.EntityFrameworkCore;

namespace BugsManaged.Api.Services;

// The rules that every writer of development orders shares: the API
// controller (sessions and the admin UI) and the Azure DevOps webhook. Stage
// moves, their timestamps, the bug-board Status that follows a stage, the
// audit rows, and link construction all live here so the two paths cannot
// drift apart.
public class DevelopmentOrderService
{
    private readonly BugsManagedDbContext _db;
    private readonly ITicketActivityLogger _activity;

    public DevelopmentOrderService(BugsManagedDbContext db, ITicketActivityLogger activity)
    {
        _db = db;
        _activity = activity;
    }

    public static readonly string[] WriterRoles = { "PLATFORM_OWNER", "SUPER_ADMIN", "DEVELOPER" };
    public static readonly string[] LinkKinds = { "BRANCH", "PR", "COMMIT", "DOC", "VIDEO" };

    // Mirrors TicketStatusController.Defaults for orgs that have never opened
    // the Statuses page (the dictionary is seeded lazily on first read).
    public static readonly string[] DefaultStatusKeys =
        { "OPEN", "IN_PROGRESS", "IN_REVIEW", "READY_FOR_TESTING", "VERIFIED", "RESOLVED", "CLOSED" };

    // VIEWER users and read-only keys can look at the board; everyone else
    // in the org, and keys with development:write, can change it.
    public static bool CanWrite(ClaimsPrincipal user)
    {
        if (user.IsInRole(ServiceKeys.Role))
            return user.HasClaim(ServiceKeys.ScopeClaim, ServiceKeys.ScopeDevelopmentWrite);
        return WriterRoles.Any(user.IsInRole);
    }

    public Task<Ticket?> FindOrderAsync(long id) =>
        // Org-scoped by the global query filter; another org's id is a 404.
        _db.Tickets.FirstOrDefaultAsync(t => t.Id == id && t.IsDevelopmentOrder);

    public async Task<HashSet<string>> StatusKeysAsync()
    {
        var keys = await _db.TicketStatusDefs.Select(s => s.Key).ToListAsync();
        return new HashSet<string>(keys.Count > 0 ? keys : DefaultStatusKeys, StringComparer.Ordinal);
    }

    public static string OpenStatus(HashSet<string> statusKeys) =>
        statusKeys.Contains("OPEN") ? "OPEN" : statusKeys.First();

    // Moves the stage and records it in both audit streams. Caller saves.
    public void MoveStage(Ticket ticket, string toStage, string actorEmail, string actorName, DateTime now,
        HashSet<string> statusKeys, string? note)
    {
        var from = ticket.DevelopmentStage;
        ticket.DevelopmentStage = toStage;
        ticket.UpdatedAt = now;
        ApplyStageSideEffects(ticket, from, toStage, now, statusKeys);
        RecordStage(ticket, from, toStage, actorEmail, now, note);

        var fromLabel = from != null && DevelopmentStages.Labels.TryGetValue(from, out var fl) ? fl : (from ?? "none");
        _activity.Log(ticket, "DEV_STAGE_CHANGED",
            $"{actorName} moved stage {fromLabel} → {DevelopmentStages.Labels[toStage]}" + (note != null ? $" — {note}" : ""),
            actorEmail, actorName, payload: new { fromStage = from, toStage, note });
    }

    // Timestamps and the bug-board Status that follow a stage. Shared by
    // create, promote and move so the rules live in one place.
    public static void ApplyStageSideEffects(Ticket ticket, string? from, string to, DateTime now, HashSet<string> statusKeys)
    {
        var reachedProduction = DevelopmentStages.IsAtOrPast(to, DevelopmentStages.Production);

        if (reachedProduction)
        {
            ticket.ProductionAt ??= now;
            if (to == DevelopmentStages.Announced) ticket.AnnouncedAt ??= now;
            else ticket.AnnouncedAt = null;
        }
        else
        {
            // Rolled back below production: the item has to ship again, and
            // the digest should announce it again when it does.
            ticket.ProductionAt = null;
            ticket.AnnouncedAt = null;
            ticket.DigestSentAt = null;
        }

        var status = DevelopmentStages.StatusFor(to);
        if (status != null && statusKeys.Contains(status))
        {
            ticket.Status = status;
            if (status == "RESOLVED" || status == "CLOSED") ticket.ResolvedAt ??= now;
            else ticket.ResolvedAt = null;
        }
    }

    public void RecordStage(Ticket ticket, string? from, string to, string changedBy, DateTime at, string? note)
    {
        _db.TicketStageHistory.Add(new TicketStageHistory
        {
            TicketId = ticket.Id,
            OrganizationId = ticket.OrganizationId,
            FromStage = from,
            ToStage = to,
            ChangedBy = changedBy,
            ChangedAt = at,
            Note = note,
        });
    }

    public static TicketDevelopmentLink NewLink(Ticket ticket, string kind, string? repo, string name, string? url, string? note, string createdBy) => new()
    {
        TicketId = ticket.Id,
        OrganizationId = ticket.OrganizationId,
        Kind = kind.Trim().ToUpperInvariant(),
        Repo = Clean(repo),
        Name = name.Trim(),
        Url = Clean(url),
        Note = Clean(note),
        CreatedBy = createdBy,
    };

    public static string? Clean(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
