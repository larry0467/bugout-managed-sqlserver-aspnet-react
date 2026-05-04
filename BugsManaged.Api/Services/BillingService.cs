using BugsManaged.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace BugsManaged.Api.Services;

public class BillingService
{
    private readonly BugsManagedDbContext _db;

    private static readonly Dictionary<string, (int Projects, int MonthlyTickets)> PlanLimits = new()
    {
        ["FREE"]       = (1,   100),
        ["PRO"]        = (10, 2000),
        ["ENTERPRISE"] = (-1,   -1),  // -1 = unlimited
    };

    public BillingService(BugsManagedDbContext db) => _db = db;

    public async Task<(bool Allowed, string? Reason)> CheckProjectLimitAsync(long orgId)
    {
        var org = await _db.Organizations.IgnoreQueryFilters().FirstOrDefaultAsync(o => o.Id == orgId);
        if (org == null) return (false, "Organization not found");
        if (org.IsBillingExempt) return (true, null);

        var (maxProjects, _) = GetLimits(org.Plan);
        if (maxProjects == -1) return (true, null);

        var count = await _db.Projects.CountAsync(p => p.OrganizationId == orgId);
        return count >= maxProjects
            ? (false, $"Your {org.Plan} plan allows {maxProjects} project(s). Upgrade to add more.")
            : (true, null);
    }

    public async Task<(bool Allowed, string? Reason)> CheckTicketLimitAsync(long orgId)
    {
        var org = await _db.Organizations.IgnoreQueryFilters().FirstOrDefaultAsync(o => o.Id == orgId);
        if (org == null) return (false, "Organization not found");
        if (org.IsBillingExempt) return (true, null);

        var (_, monthlyLimit) = GetLimits(org.Plan);
        if (monthlyLimit == -1) return (true, null);

        var start = new DateTime(DateTime.UtcNow.Year, DateTime.UtcNow.Month, 1, 0, 0, 0, DateTimeKind.Utc);
        var count = await _db.Tickets.IgnoreQueryFilters()
            .CountAsync(t => t.OrganizationId == orgId && t.CreatedAt >= start);

        return count >= monthlyLimit
            ? (false, $"Your {org.Plan} plan allows {monthlyLimit} tickets/month. Upgrade to continue.")
            : (true, null);
    }

    private static (int Projects, int MonthlyTickets) GetLimits(string plan) =>
        PlanLimits.TryGetValue(plan, out var limits) ? limits : PlanLimits["FREE"];
}
