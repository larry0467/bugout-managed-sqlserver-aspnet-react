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

    // ===== Initiatives (an order holding numbered phases) =====

    public Task<bool> HasPhasesAsync(long orderId, CancellationToken ct = default) =>
        _db.Tickets.AnyAsync(t => t.ParentOrderId == orderId && t.IsDevelopmentOrder, ct);

    // An initiative's stage is its least-advanced phase: it reaches beta only
    // when every phase has. Reads the phases as SAVED, so call it after
    // SaveChanges; the caller saves again. Returns the initiatives that moved.
    public async Task<List<Ticket>> RollUpInitiativesAsync(IEnumerable<long?> initiativeIds, string actorEmail, string actorName,
        DateTime now, CancellationToken ct = default)
    {
        var moved = new List<Ticket>();
        var ids = initiativeIds.Where(i => i.HasValue).Select(i => i!.Value).Distinct().ToList();
        if (ids.Count == 0) return moved;

        var parents = await _db.Tickets.Where(t => ids.Contains(t.Id) && t.IsDevelopmentOrder).ToListAsync(ct);
        var phases = await _db.Tickets
            .Where(t => t.IsDevelopmentOrder && t.ParentOrderId != null && ids.Contains(t.ParentOrderId.Value))
            .Select(t => new { Parent = t.ParentOrderId!.Value, t.DevelopmentStage })
            .ToListAsync(ct);

        HashSet<string>? keys = null;
        foreach (var parent in parents)
        {
            var stages = phases.Where(p => p.Parent == parent.Id).Select(p => p.DevelopmentStage ?? DevelopmentStages.Ordered).ToList();
            if (stages.Count == 0) continue;
            var lowest = stages.OrderBy(DevelopmentStages.OrderOf).First();
            if (parent.DevelopmentStage == lowest) continue;
            keys ??= await StatusKeysAsync();
            MoveStage(parent, lowest, actorEmail, actorName, now, keys, "follows its phases");
            moved.Add(parent);
        }
        return moved;
    }

    // Puts the order under `initiative` at `position` (1-based; null = last), or
    // makes it standalone when `initiative` is null, and renumbers the phases
    // of the old and the new initiative so they stay 1..N. Returns an error
    // message instead when the move breaks the one-level rule. Saves.
    public async Task<string?> PlaceAsync(Ticket order, Ticket? initiative, int? position, string actorEmail, string actorName,
        CancellationToken ct = default)
    {
        if (initiative != null)
        {
            if (initiative.Id == order.Id) return "An order cannot be a phase of itself";
            if (initiative.ParentOrderId != null)
                return $"#{initiative.Id} is itself a phase of #{initiative.ParentOrderId}; phases cannot hold phases";
            if (await HasPhasesAsync(order.Id, ct))
                return $"#{order.Id} holds phases of its own; an initiative cannot become a phase";
        }

        var oldParentId = order.ParentOrderId;
        var oldPhase = order.PhaseNumber;
        var now = DateTime.UtcNow;

        if (initiative == null)
        {
            order.ParentOrderId = null;
            order.PhaseNumber = null;
        }
        else
        {
            var siblings = await _db.Tickets
                .Where(t => t.ParentOrderId == initiative.Id && t.Id != order.Id && t.IsDevelopmentOrder)
                .ToListAsync(ct);
            var ordered = siblings.OrderBy(t => t.PhaseNumber ?? int.MaxValue).ThenBy(t => t.CreatedAt).ThenBy(t => t.Id).ToList();
            var index = position.HasValue ? Math.Clamp(position.Value - 1, 0, ordered.Count) : ordered.Count;
            ordered.Insert(index, order);
            order.ParentOrderId = initiative.Id;
            Renumber(ordered, now);
        }
        order.UpdatedAt = now;

        if (oldParentId != null && oldParentId != initiative?.Id)
        {
            var left = await _db.Tickets
                .Where(t => t.ParentOrderId == oldParentId && t.Id != order.Id && t.IsDevelopmentOrder)
                .ToListAsync(ct);
            Renumber(left.OrderBy(t => t.PhaseNumber ?? int.MaxValue).ThenBy(t => t.CreatedAt).ThenBy(t => t.Id).ToList(), now);
        }

        if (oldParentId != order.ParentOrderId || oldPhase != order.PhaseNumber)
        {
            var text = initiative == null
                ? $"{actorName} took this order out of initiative #{oldParentId}"
                : $"{actorName} placed this order in initiative #{initiative.Id} as phase {order.PhaseNumber}";
            _activity.Log(order, "DEV_PHASE_PLACED", text, actorEmail, actorName,
                payload: new { initiativeId = initiative?.Id, fromInitiativeId = oldParentId, phase = order.PhaseNumber });
        }

        await _db.SaveChangesAsync(ct);
        return null;
    }

    private static void Renumber(List<Ticket> phases, DateTime now)
    {
        for (var i = 0; i < phases.Count; i++)
        {
            if (phases[i].PhaseNumber == i + 1) continue;
            phases[i].PhaseNumber = i + 1;
            phases[i].UpdatedAt = now;
        }
    }

    // "Builds on" must name another development order and must not loop back
    // to this one through the chain. Returns an error message or null.
    public async Task<string?> ValidateDependencyAsync(long orderId, long? baseId, CancellationToken ct = default)
    {
        if (baseId == null) return null;
        if (baseId == orderId) return "An order cannot build on itself";

        var seen = new HashSet<long> { orderId };
        long? cursor = baseId;
        for (var hop = 0; cursor != null && hop < 100; hop++)
        {
            if (!seen.Add(cursor.Value))
                return $"#{baseId} already builds on #{orderId} (directly or through other orders); that would be a loop";
            var next = await _db.Tickets
                .Where(t => t.Id == cursor.Value && t.IsDevelopmentOrder)
                .Select(t => new { t.DependsOnOrderId })
                .FirstOrDefaultAsync(ct);
            if (next == null)
                return hop == 0 ? $"#{baseId} is not a development order" : null;
            cursor = next.DependsOnOrderId;
        }
        return null;
    }
}
