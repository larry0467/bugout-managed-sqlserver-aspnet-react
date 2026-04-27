using BugsManaged.Api.Data;
using BugsManaged.Api.Entities;
using Microsoft.EntityFrameworkCore;

namespace BugsManaged.Api.Services.Sandbox;

// Wipes the business tables and re-seeds the "Acme Plumbing" demo universe.
// Used by:
//   - SandboxResetJob (Hangfire recurring, midnight CT)
//   - POST /api/admin/sandbox/reset (owner button in the SANDBOX banner)
//
// Preserves: Organizations, Users with PLATFORM_OWNER/SUPER_ADMIN roles
// (so an operator can still log in after a reset), TicketStageHistory
// (audit), and SandboxResetLogs (this seeder writes a row to it).
//
// Truncates: Tickets, TicketNotes, ClaudeRuns, all DEVELOPER/VIEWER and
// "acme-plumbing" personas. Then rebuilds the Acme universe from scratch.
//
// Time-anchored: every CreatedAt is `UtcNow.AddDays(-(rand 1..60))` so the
// data feels current after every nightly run instead of getting stale.
//
// Fake-only data:
//   - Phone numbers in the IETF-reserved 555-0100..555-0199 range
//   - Emails on @acme-plumbing.example (RFC 2606 reserved)
//   - No SSN, no card numbers, no real PII anywhere
public class SandboxSeeder
{
    private readonly BugsManagedDbContext _db;
    private readonly ILogger<SandboxSeeder> _log;

    private const string SandboxOrgSlug = "acme-plumbing-sandbox";
    private const string SandboxOrgName = "Acme Plumbing";
    private const string SandboxProjectSlug = "acme-plumbing";
    private const string SandboxProjectName = "Acme Plumbing — Sandbox";
    private const string SandboxApiKey = "sandbox-acme-plumbing-key";

    public SandboxSeeder(BugsManagedDbContext db, ILogger<SandboxSeeder> log)
    {
        _db = db;
        _log = log;
    }

    public async Task<SandboxResetLog> ResetAsync(string? triggeredBy = null, CancellationToken ct = default)
    {
        triggeredBy ??= "scheduler";
        _log.LogInformation("SandboxSeeder: starting reset (triggeredBy={Trigger})", triggeredBy);

        // Find or create the Acme Plumbing org. We never delete the org
        // itself — the sandbox tenant identity is stable across resets so
        // any external integrations (Slack webhook, etc.) keep working.
        var org = await _db.Organizations.IgnoreQueryFilters()
            .FirstOrDefaultAsync(o => o.Slug == SandboxOrgSlug, ct);
        if (org == null)
        {
            org = new Organization
            {
                Name = SandboxOrgName,
                Slug = SandboxOrgSlug,
                Plan = "PRO",
            };
            _db.Organizations.Add(org);
            await _db.SaveChangesAsync(ct);
            _log.LogInformation("SandboxSeeder: created Acme org {OrgId}", org.Id);
        }

        // Find or create the project that bug widgets POST to.
        var project = await _db.Projects.IgnoreQueryFilters()
            .FirstOrDefaultAsync(p => p.Slug == SandboxProjectSlug && p.OrganizationId == org.Id, ct);
        if (project == null)
        {
            project = new Project
            {
                Name = SandboxProjectName,
                Slug = SandboxProjectSlug,
                ApiKey = SandboxApiKey,
                OrganizationId = org.Id,
                DevBranch = "dev",
            };
            _db.Projects.Add(project);
            await _db.SaveChangesAsync(ct);
            _log.LogInformation("SandboxSeeder: created Acme project {ProjectId}", project.Id);
        }

        // ---- Truncate ----
        // ClaudeRuns FK -> Tickets, TicketNotes FK -> Tickets, so order
        // matters even with cascade off. We use ExecuteDelete (EF Core 7+)
        // which issues a single DELETE and skips change-tracking — the
        // sandbox table can have thousands of rows after a few days of
        // demo activity.
        var tx = await _db.Database.BeginTransactionAsync(ct);
        try
        {
            // Scope the wipe to the Acme org only. If a future change adds
            // a second sandbox tenant we don't want to flatten it too.
            await _db.ClaudeRuns.IgnoreQueryFilters()
                .Where(r => r.OrganizationId == org.Id).ExecuteDeleteAsync(ct);
            await _db.TicketNotes.IgnoreQueryFilters()
                .Where(n => n.OrganizationId == org.Id).ExecuteDeleteAsync(ct);
            await _db.TicketStageHistory.IgnoreQueryFilters()
                .Where(h => h.OrganizationId == org.Id).ExecuteDeleteAsync(ct);
            await _db.Tickets.IgnoreQueryFilters()
                .Where(t => t.OrganizationId == org.Id).ExecuteDeleteAsync(ct);

            // Persona wipe: keep PLATFORM_OWNER + SUPER_ADMIN (operator
            // accounts), drop the personas this seeder reinserts below so
            // we don't accumulate duplicates.
            await _db.Users.IgnoreQueryFilters()
                .Where(u => u.OrganizationId == org.Id
                    && u.Role != "PLATFORM_OWNER"
                    && u.Role != "SUPER_ADMIN")
                .ExecuteDeleteAsync(ct);

            // ---- Re-seed personas ----
            var personas = BuildAcmePersonas(org.Id);
            _db.Users.AddRange(personas);
            await _db.SaveChangesAsync(ct);

            // ---- Re-seed tickets ----
            var rng = new Random(unchecked((int)DateTime.UtcNow.Ticks));
            var tickets = BuildAcmeTickets(org.Id, project.Id, personas, rng);
            _db.Tickets.AddRange(tickets);
            await _db.SaveChangesAsync(ct);

            // ---- Comments on ~20 tickets ----
            var ticketsWithComments = tickets.OrderBy(_ => rng.Next()).Take(20).ToList();
            var comments = BuildAcmeComments(org.Id, ticketsWithComments, personas, rng);
            _db.TicketNotes.AddRange(comments);
            await _db.SaveChangesAsync(ct);

            // ---- Audit row ----
            var logRow = new SandboxResetLog
            {
                OccurredAtUtc = DateTime.UtcNow,
                BugsInserted = tickets.Count,
                UsersInserted = personas.Count,
                TriggeredBy = triggeredBy,
            };
            _db.SandboxResetLogs.Add(logRow);
            await _db.SaveChangesAsync(ct);

            await tx.CommitAsync(ct);
            _log.LogInformation("SandboxSeeder: reset complete — {Bugs} bugs, {Users} users, {Comments} comments",
                tickets.Count, personas.Count, comments.Count);
            return logRow;
        }
        catch
        {
            await tx.RollbackAsync(ct);
            throw;
        }
    }

    private static List<User> BuildAcmePersonas(long orgId)
    {
        // Password is the same dev placeholder DevSeeder uses — sandbox is
        // explicitly demo-only and never gets real customer data, so a
        // shared known password is OK and saves a per-persona reset email.
        var pw = BCrypt.Net.BCrypt.HashPassword("Sandbox!Demo1");
        return new List<User>
        {
            new() { OrganizationId = orgId, Email = "bob@acme-plumbing.example",    FullName = "Bob Wrench",    Role = "SUPER_ADMIN", Password = pw },
            new() { OrganizationId = orgId, Email = "dee@acme-plumbing.example",    FullName = "Dee Spatcher",  Role = "SUPER_ADMIN", Password = pw },
            new() { OrganizationId = orgId, Email = "penny@acme-plumbing.example",  FullName = "Penny Pipe",    Role = "DEVELOPER",   Specialty = "FULLSTACK", Password = pw },
            new() { OrganizationId = orgId, Email = "mick@acme-plumbing.example",   FullName = "Mick Hammer",   Role = "DEVELOPER",   Specialty = "FRONTEND",  Password = pw },
            new() { OrganizationId = orgId, Email = "helena@acme-plumbing.example", FullName = "Helena Hoses",  Role = "VIEWER",      Password = pw },
            new() { OrganizationId = orgId, Email = "ricky@acme-plumbing.example",  FullName = "Ricky Drain",   Role = "DEVELOPER",   Specialty = "BACKEND",   Password = pw },
            // External "customer" personas — Bug Out's Ticket.SubmittedBy is
            // a free-form email on widget submissions, no User row required,
            // but seeding them here gives the assign dropdown realistic
            // names if an op wants to assign a ticket to a customer.
            new() { OrganizationId = orgId, Email = "henderson@example.com",        FullName = "Mrs. Henderson (Customer)", Role = "VIEWER", Password = pw },
            new() { OrganizationId = orgId, Email = "patel@example.com",            FullName = "Raj Patel (Customer)",      Role = "VIEWER", Password = pw },
        };
    }

    // Realistic plumbing-shop bug titles. Each one paired with a
    // (priority, status, category) so the dashboard charts have variety
    // without being random noise.
    private static readonly (string Title, string Priority, string Status, string Category, string TicketType)[] BugTemplates =
    {
        ("Toilet won't flush after install — Mrs. Henderson",                  "HIGH",     "OPEN",         "BACKEND",  "BUG"),
        ("GPS routing wrong on Mick's tablet",                                 "MEDIUM",   "IN_PROGRESS",  "MOBILE",   "BUG"),
        ("Invoice #4502 sent twice to customer",                               "HIGH",     "RESOLVED",     "BACKEND",  "BUG"),
        ("Quote PDF cuts off line items past page 2",                          "MEDIUM",   "OPEN",         "BACKEND",  "BUG"),
        ("Dispatch board doesn't refresh after assignment",                    "HIGH",     "IN_PROGRESS",  "FRONTEND", "BUG"),
        ("Customer search by phone returns no results when 555-prefix",        "LOW",      "RESOLVED",     "DATABASE", "BUG"),
        ("Photo upload fails on jobs with > 10 photos",                        "MEDIUM",   "IN_REVIEW",    "API",      "BUG"),
        ("Time clock skips lunch break for jobs over 8h",                      "HIGH",     "OPEN",         "BACKEND",  "BUG"),
        ("Stripe payment shows pending forever after AmEx decline",            "CRITICAL", "IN_PROGRESS",  "BACKEND",  "BUG"),
        ("Add bulk-import for new customer list",                              "LOW",      "OPEN",         "BACKEND",  "FEATURE_REQUEST"),
        ("How do I reassign a ticket without losing the photos?",              "LOW",      "RESOLVED",     "UX",       "QUESTION"),
        ("Calendar view broken on iPad Safari",                                "MEDIUM",   "OPEN",         "FRONTEND", "BUG"),
        ("Penny can't see today's jobs after the 4am sync",                    "CRITICAL", "RESOLVED",     "DATABASE", "BUG"),
        ("Slack notifications stopped firing for new emergency calls",         "HIGH",     "CLOSED",       "API",      "BUG"),
        ("Customer signature box too small on phones",                         "LOW",      "OPEN",         "UI",       "BUG"),
        ("Add a 'reschedule' button to the customer text confirmation",        "MEDIUM",   "OPEN",         "FRONTEND", "FEATURE_REQUEST"),
        ("Tax rate wrong for Plano jobs (using Frisco rate)",                  "HIGH",     "IN_PROGRESS",  "BACKEND",  "BUG"),
        ("Helena's login locked out after one bad password",                   "MEDIUM",   "RESOLVED",     "SECURITY", "BUG"),
        ("Inventory shows -3 fittings after a return",                         "MEDIUM",   "IN_REVIEW",    "BACKEND",  "BUG"),
        ("Map clusters disappear at zoom 14",                                  "LOW",      "OPEN",         "FRONTEND", "BUG"),
        ("Customer portal lets two people open same job",                      "HIGH",     "VERIFIED",     "BACKEND",  "BUG"),
        ("Add Spanish translation to text reminders",                          "MEDIUM",   "OPEN",         "FRONTEND", "FEATURE_REQUEST"),
        ("Truck #7 GPS reads as 'never reported' all day",                     "HIGH",     "RESOLVED",     "API",      "BUG"),
        ("Estimate emails go to spam for Yahoo addresses",                     "MEDIUM",   "IN_PROGRESS",  "INFRASTRUCTURE", "BUG"),
        ("Add a 'parts on truck' running total to dispatch view",              "LOW",      "OPEN",         "FRONTEND", "FEATURE_REQUEST"),
        ("Drain camera video upload times out at 200MB",                       "MEDIUM",   "OPEN",         "API",      "BUG"),
        ("Recurring maintenance reminder fires twice if customer has 2 sites", "MEDIUM",   "RESOLVED",     "BACKEND",  "BUG"),
        ("Photo orientation wrong (sideways) on Android upload",               "LOW",      "OPEN",         "MOBILE",   "BUG"),
        ("Add ability to mark a customer as VIP",                              "LOW",      "OPEN",         "FULLSTACK","FEATURE_REQUEST"),
        ("Job total double-counts trip charge on emergency calls",             "CRITICAL", "RESOLVED",     "BACKEND",  "BUG"),
        ("Penny gets logged out mid-job when phone sleeps",                    "HIGH",     "IN_PROGRESS",  "FRONTEND", "BUG"),
        ("Customer review request never sends after job close",                "MEDIUM",   "OPEN",         "BACKEND",  "BUG"),
        ("Need export to QuickBooks Online (not Desktop)",                     "MEDIUM",   "OPEN",         "API",      "FEATURE_REQUEST"),
        ("Old jobs from 2024 show in today's queue",                           "HIGH",     "RESOLVED",     "DATABASE", "BUG"),
        ("Search 'leak' returns 'leakage' but not 'leaking'",                  "LOW",      "CLOSED",       "BACKEND",  "BUG"),
        ("Dispatcher map crashes browser on Friday afternoon (>200 jobs)",     "HIGH",     "IN_PROGRESS",  "FRONTEND", "BUG"),
        ("Invoice line item subtotal off by a penny on tax round",             "LOW",      "RESOLVED",     "BACKEND",  "BUG"),
        ("Dark mode breaks the customer portal calendar contrast",             "LOW",      "OPEN",         "UI",       "BUG"),
        ("Add a 'Mick said' free-text field to the dispatch screen",           "LOW",      "OPEN",         "FRONTEND", "FEATURE_REQUEST"),
        ("How do I refund only the trip charge, not the labor?",               "LOW",      "RESOLVED",     "UX",       "QUESTION"),
        ("Invoice PDF layout overlaps logo when company name > 25 chars",      "MEDIUM",   "OPEN",         "BACKEND",  "BUG"),
        ("New tech onboarding wizard skips the W-9 step",                      "HIGH",     "IN_REVIEW",    "FRONTEND", "BUG"),
        ("Bob can't see Helena's tickets in the assignment dropdown",          "MEDIUM",   "RESOLVED",     "BACKEND",  "BUG"),
        ("Speed up the dispatch board — it lags on slow Wi-Fi",                "MEDIUM",   "OPEN",         "FRONTEND", "FEATURE_REQUEST"),
        ("Failed-payment retry job runs every minute instead of nightly",      "CRITICAL", "RESOLVED",     "INFRASTRUCTURE", "BUG"),
        ("Customer can book a slot that's already taken",                      "CRITICAL", "OPEN",         "BACKEND",  "BUG"),
        ("Send-text-to-customer button has no loading state",                  "LOW",      "OPEN",         "UI",       "BUG"),
        ("Quote with 0 line items can be sent — should warn",                  "LOW",      "RESOLVED",     "FRONTEND", "BUG"),
        ("Mick's truck inventory desyncs after offline mode",                  "HIGH",     "IN_PROGRESS",  "MOBILE",   "BUG"),
        ("Add a 'do not disturb' flag for customers in collections",           "MEDIUM",   "OPEN",         "BACKEND",  "FEATURE_REQUEST"),
    };

    private static List<Ticket> BuildAcmeTickets(long orgId, long projectId, List<User> personas, Random rng)
    {
        var customerSubmitters = new[]
        {
            "henderson@example.com",
            "patel@example.com",
            "smith@example.com",
            "garcia@example.com",
            "obrien@example.com",
        };
        var devs = personas.Where(p => p.Role == "DEVELOPER").ToList();
        var pages = new[] { "/dispatch", "/jobs/today", "/customers", "/invoices", "/calendar", "/settings", "/reports" };

        var tickets = new List<Ticket>(BugTemplates.Length);
        foreach (var (title, priority, status, category, ticketType) in BugTemplates)
        {
            var createdDaysAgo = rng.Next(1, 61); // 1..60
            var createdAt = DateTime.UtcNow.AddDays(-createdDaysAgo)
                .AddHours(-rng.Next(0, 24))
                .AddMinutes(-rng.Next(0, 60));

            var (stage, assignee, assigneeType) = MapStatusToEscalation(status, devs, rng);

            DateTime? resolvedAt = null;
            if (status is "RESOLVED" or "CLOSED" or "VERIFIED")
            {
                // 1..14 days after creation, but never in the future.
                var resolveOffsetDays = rng.Next(1, 15);
                resolvedAt = createdAt.AddDays(resolveOffsetDays);
                if (resolvedAt > DateTime.UtcNow)
                    resolvedAt = DateTime.UtcNow.AddHours(-rng.Next(1, 24));
            }

            DateTime? assignedAt = assignee != null
                ? createdAt.AddHours(rng.Next(1, 12))
                : null;

            tickets.Add(new Ticket
            {
                OrganizationId = orgId,
                ProjectId = projectId,
                SubmittedBy = customerSubmitters[rng.Next(customerSubmitters.Length)],
                TicketType = ticketType,
                Title = title,
                Description = $"Reported via the in-app widget. Reproduced on {pages[rng.Next(pages.Length)]}.",
                Priority = priority,
                Status = status,
                CurrentPageUrl = $"https://acme-plumbing.example{pages[rng.Next(pages.Length)]}",
                CurrentPageName = "Acme Plumbing Dispatch",
                BrowserInfo = "Chrome/124 on Windows 11",
                ScreenWidth = 1920,
                ScreenHeight = 1080,
                Visibility = "TENANT",
                TenantId = "acme-plumbing-prod",
                TenantName = "Acme Plumbing",
                Environment = "PRODUCTION",
                ApplicationVersion = "2026.4.1",
                DeveloperCategory = category,
                AssignedTo = assignee,
                AssigneeType = assigneeType,
                AssignedAt = assignedAt,
                AssignedBy = assignee != null ? "bob@acme-plumbing.example" : null,
                EscalationStage = stage,
                ResolvedAt = resolvedAt,
                CreatedAt = createdAt,
                UpdatedAt = resolvedAt ?? createdAt,
            });
        }
        return tickets;
    }

    // Maps the surface "Status" to a plausible point on the gated escalation
    // chain. Sandbox data needs to look real for a Performance Dashboard demo,
    // not just a Tickets list — so OPEN -> SUPER_ADMIN_REVIEW, IN_PROGRESS
    // -> ASSIGNED_HUMAN, etc.
    private static (string stage, string? assignee, string? assigneeType) MapStatusToEscalation(
        string status, List<User> devs, Random rng)
    {
        string? PickDev() => devs.Count == 0 ? null : devs[rng.Next(devs.Count)].Email;

        return status switch
        {
            "OPEN" => ("SUPER_ADMIN_REVIEW", null, null),
            "IN_PROGRESS" => ("ASSIGNED_HUMAN", PickDev(), "HUMAN"),
            "IN_REVIEW" => ("OWNER_APPROVAL_PENDING", PickDev(), "HUMAN"),
            "READY_FOR_TESTING" => ("OWNER_APPROVAL_PENDING", PickDev(), "HUMAN"),
            "VERIFIED" => ("COMPLETED", PickDev(), "HUMAN"),
            "RESOLVED" => ("COMPLETED", PickDev(), "HUMAN"),
            "CLOSED" => ("COMPLETED", PickDev(), "HUMAN"),
            _ => ("SUPER_ADMIN_REVIEW", null, null),
        };
    }

    private static readonly string[] CommentBank =
    {
        "Confirmed — I can repro on the staging copy.",
        "Talked to the customer, they're OK waiting until Tuesday.",
        "This was the trip-charge math, not the tax rate. Patch in PR.",
        "Mick says it's only happening on his tablet, not Penny's. Could be cached.",
        "Pinging Bob to confirm the priority bump.",
        "Should we backport the fix to the v2025.12 hotfix line?",
        "Heads-up: this same bug bit us last quarter on a different customer.",
        "Closing — root cause was a stale config in the dispatch service.",
        "Ran the new migration in sandbox, looks clean.",
        "Customer called back to thank us. Closing the loop.",
        "Found it — wrong timezone on the cron. Fixing now.",
        "I think this is a dupe of #41, want me to merge them?",
    };

    private static List<TicketNote> BuildAcmeComments(long orgId, List<Ticket> tickets, List<User> personas, Random rng)
    {
        var commenters = personas
            .Where(p => p.Role is "SUPER_ADMIN" or "DEVELOPER")
            .ToList();
        var notes = new List<TicketNote>();

        foreach (var t in tickets)
        {
            var n = rng.Next(1, 4); // 1..3 comments
            for (var i = 0; i < n; i++)
            {
                var author = commenters[rng.Next(commenters.Count)];
                // Comments anchored relative to the parent: between
                // ticket.CreatedAt and either ResolvedAt or now.
                var maxAt = t.ResolvedAt ?? DateTime.UtcNow;
                var span = (maxAt - t.CreatedAt).TotalMinutes;
                if (span < 5) span = 5;
                var offset = rng.NextDouble() * span;
                var createdAt = t.CreatedAt.AddMinutes(offset);

                notes.Add(new TicketNote
                {
                    OrganizationId = orgId,
                    TicketId = t.Id,
                    AuthorEmail = author.Email,
                    AuthorName = author.FullName,
                    Content = CommentBank[rng.Next(CommentBank.Length)],
                    NoteType = "COMMENT",
                    Source = "DASHBOARD",
                    CreatedAt = createdAt,
                });
            }
        }
        return notes;
    }
}
