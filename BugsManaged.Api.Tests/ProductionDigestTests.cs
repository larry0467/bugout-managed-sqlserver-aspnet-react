using BugsManaged.Api.Data;
using BugsManaged.Api.Entities;
using BugsManaged.Api.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace BugsManaged.Api.Tests;

// The what-shipped digest: one email per organization per day, only after
// the configured hour, only for orders that reached production and were not
// digested yet; nothing is stamped unless Comms accepted the message.
public class ProductionDigestTests
{
    private const long OrgId = 42;
    private const long OtherOrgId = 43;

    private static (ProductionDigestService svc, BugsManagedDbContext db, TestDoubles.RecordingNotificationService notify) Build(
        int digestHour = 0, string recipients = "")
    {
        var org = new TestDoubles.TestOrgContext(); // hosted service: no org context
        var db = TestDoubles.NewInMemoryDb(org);
        TestDoubles.EnsureOrganization(db, OrgId);
        TestDoubles.EnsureOrganization(db, OtherOrgId);
        db.Projects.Add(new Project { Id = 7, Name = "Service Managed", Slug = "service-managed", ApiKey = "k1", OrganizationId = OrgId });
        db.Projects.Add(new Project { Id = 8, Name = "Forsor", Slug = "forsor", ApiKey = "k2", OrganizationId = OtherOrgId });
        db.Users.Add(new User { OrganizationId = OrgId, Email = "larry@x.com", FullName = "Larry", Role = "PLATFORM_OWNER", Password = "x" });
        db.Users.Add(new User { OrganizationId = OrgId, Email = "dev@x.com", FullName = "Dev", Role = "DEVELOPER", Password = "x" });
        db.SaveChanges();

        var notify = new TestDoubles.RecordingNotificationService();
        var opts = Options.Create(new DevelopmentTrackerOptions
        {
            DigestHourLocal = digestHour,
            TimeZone = "UTC",
            DigestRecipients = recipients,
            BoardBaseUrl = "https://board.test/",
        });
        var svc = new ProductionDigestService(db, notify, new TicketActivityLogger(db), opts, NullLogger<ProductionDigestService>.Instance);
        return (svc, db, notify);
    }

    private static Ticket Shipped(BugsManagedDbContext db, long orgId, long projectId, string title, DateTime productionAt, DateTime? digestSentAt = null)
    {
        var t = new Ticket
        {
            OrganizationId = orgId, ProjectId = projectId, Title = title, TicketType = "FEATURE_REQUEST", Status = "RESOLVED",
            IsDevelopmentOrder = true, DevelopmentStage = DevelopmentStages.Production, ProductionAt = productionAt, DigestSentAt = digestSentAt,
            VideoUrl = "https://videos-dev.managedplatform.com/larry-baxter/r/" + title.ToLowerInvariant().Replace(' ', '-'),
        };
        db.Tickets.Add(t);
        db.SaveChanges();
        db.TicketDevelopmentLinks.Add(new TicketDevelopmentLink { TicketId = t.Id, OrganizationId = orgId, Kind = "PR", Repo = "ServiceManagerUI", Name = "PR 4347", Url = "https://dev.azure.com/pr/4347" });
        db.SaveChanges();
        return t;
    }

    [Fact]
    public async Task SendsOneDigestPerOrg_ToPlatformOwners_AndStampsItems()
    {
        var (svc, db, notify) = Build();
        var now = new DateTime(2026, 10, 8, 23, 30, 0, DateTimeKind.Utc);
        var a = Shipped(db, OrgId, 7, "Estimates", now.AddHours(-3));
        var b = Shipped(db, OrgId, 7, "NTE history", now.AddHours(-1));
        var already = Shipped(db, OrgId, 7, "Old thing", now.AddDays(-3), digestSentAt: now.AddDays(-3));
        var other = Shipped(db, OtherOrgId, 8, "Forsor boosts", now.AddHours(-2)); // org 43 has no owner -> skipped
        db.Tickets.Add(new Ticket { OrganizationId = OrgId, ProjectId = 7, Title = "A bug", Status = "RESOLVED", ResolvedAt = now }); // not an order
        db.SaveChanges();

        var sent = await svc.RunDueDigestsAsync(now);

        Assert.Equal(1, sent);
        Assert.Single(notify.Digests);
        var (to, subject, body) = notify.Digests[0];
        Assert.Equal("larry@x.com", to);
        Assert.Contains("2 items reached production", subject);
        Assert.Contains("[Service Managed] Estimates", body);
        Assert.Contains("[Service Managed] NTE history", body);
        Assert.DoesNotContain("Old thing", body);
        Assert.DoesNotContain("Forsor boosts", body);
        Assert.Contains($"https://board.test/development/{a.Id}", body);
        Assert.Contains("PR 4347 https://dev.azure.com/pr/4347", body);
        Assert.Contains("what-shipped video", body);

        Assert.Equal(now, (await db.Tickets.IgnoreQueryFilters().SingleAsync(t => t.Id == a.Id)).DigestSentAt);
        Assert.Equal(now, (await db.Tickets.IgnoreQueryFilters().SingleAsync(t => t.Id == b.Id)).DigestSentAt);
        Assert.Null((await db.Tickets.IgnoreQueryFilters().SingleAsync(t => t.Id == other.Id)).DigestSentAt);
        Assert.Equal(now.AddDays(-3), (await db.Tickets.IgnoreQueryFilters().SingleAsync(t => t.Id == already.Id)).DigestSentAt);

        var acts = db.TicketActivities.IgnoreQueryFilters().Where(x => x.Kind == "DEV_DIGEST_SENT").ToList();
        Assert.Equal(2, acts.Count);
        Assert.All(acts, x => Assert.Contains("larry@x.com", x.Message));
    }

    [Fact]
    public async Task BeforeDigestHour_SendsNothing()
    {
        var (svc, db, notify) = Build(digestHour: 17);
        var now = new DateTime(2026, 10, 8, 10, 0, 0, DateTimeKind.Utc);
        Shipped(db, OrgId, 7, "Estimates", now.AddHours(-1));

        Assert.Equal(0, await svc.RunDueDigestsAsync(now));
        Assert.Empty(notify.Digests);
    }

    [Fact]
    public async Task AfterDigestHour_Sends()
    {
        var (svc, db, notify) = Build(digestHour: 17);
        var now = new DateTime(2026, 10, 8, 17, 5, 0, DateTimeKind.Utc);
        Shipped(db, OrgId, 7, "Estimates", now.AddHours(-1));

        Assert.Equal(1, await svc.RunDueDigestsAsync(now));
        Assert.Single(notify.Digests);
    }

    [Fact]
    public async Task SecondRunSameDay_WaitsForTomorrow()
    {
        var (svc, db, notify) = Build();
        var now = new DateTime(2026, 10, 8, 18, 0, 0, DateTimeKind.Utc);
        Shipped(db, OrgId, 7, "Estimates", now.AddHours(-1));
        Assert.Equal(1, await svc.RunDueDigestsAsync(now));

        // A late item the same evening waits.
        Shipped(db, OrgId, 7, "Late one", now.AddMinutes(30));
        Assert.Equal(0, await svc.RunDueDigestsAsync(now.AddHours(1)));
        Assert.Single(notify.Digests);

        // Next day it goes out.
        Assert.Equal(1, await svc.RunDueDigestsAsync(now.AddDays(1)));
        Assert.Equal(2, notify.Digests.Count);
        Assert.Contains("Late one", notify.Digests[1].Body);
        Assert.DoesNotContain("Estimates", notify.Digests[1].Body);
    }

    [Fact]
    public async Task WhenCommsRejects_NothingIsStamped_SoItRetries()
    {
        var (svc, db, notify) = Build();
        notify.FailDigests = true;
        var now = new DateTime(2026, 10, 8, 18, 0, 0, DateTimeKind.Utc);
        var t = Shipped(db, OrgId, 7, "Estimates", now.AddHours(-1));

        Assert.Equal(0, await svc.RunDueDigestsAsync(now));
        Assert.Null((await db.Tickets.IgnoreQueryFilters().SingleAsync(x => x.Id == t.Id)).DigestSentAt);

        notify.FailDigests = false;
        Assert.Equal(1, await svc.RunDueDigestsAsync(now.AddMinutes(10)));
        Assert.NotNull((await db.Tickets.IgnoreQueryFilters().SingleAsync(x => x.Id == t.Id)).DigestSentAt);
    }

    [Fact]
    public async Task ConfiguredRecipients_OverrideOwnerFallback()
    {
        var (svc, db, notify) = Build(recipients: "larry@protocall.co, team@protocall.co");
        var now = new DateTime(2026, 10, 8, 18, 0, 0, DateTimeKind.Utc);
        Shipped(db, OrgId, 7, "Estimates", now.AddHours(-1));

        Assert.Equal(1, await svc.RunDueDigestsAsync(now));
        Assert.Equal(new[] { "larry@protocall.co", "team@protocall.co" }, notify.Digests.Select(d => d.To).ToArray());
    }

    [Fact]
    public async Task DisabledDigest_DoesNothing()
    {
        var org = new TestDoubles.TestOrgContext();
        var db = TestDoubles.NewInMemoryDb(org);
        var notify = new TestDoubles.RecordingNotificationService();
        var svc = new ProductionDigestService(db, notify, new TicketActivityLogger(db),
            Options.Create(new DevelopmentTrackerOptions { DigestEnabled = false, DigestHourLocal = 0, TimeZone = "UTC" }),
            NullLogger<ProductionDigestService>.Instance);
        Shipped(db, OrgId, 7, "Estimates", DateTime.UtcNow);

        Assert.Equal(0, await svc.RunDueDigestsAsync(DateTime.UtcNow));
    }

    [Fact]
    public void ResolveTimeZone_AcceptsWindowsAndIanaIds_FallsBackToUtc()
    {
        Assert.NotEqual(TimeZoneInfo.Utc.Id, DevelopmentTrackerOptions.ResolveTimeZone("Central Standard Time").Id);
        Assert.NotEqual(TimeZoneInfo.Utc.Id, DevelopmentTrackerOptions.ResolveTimeZone("America/Chicago").Id);
        Assert.Equal(TimeZoneInfo.Utc.Id, DevelopmentTrackerOptions.ResolveTimeZone("UTC").Id);
        // Garbage still resolves (to the Central fallback or UTC), never throws.
        Assert.NotNull(DevelopmentTrackerOptions.ResolveTimeZone("Nowhere/Land"));
    }
}
