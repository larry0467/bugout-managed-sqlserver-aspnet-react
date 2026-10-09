using System.Security.Claims;
using BugsManaged.Api.Controllers;
using BugsManaged.Api.Data;
using BugsManaged.Api.Entities;
using BugsManaged.Api.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace BugsManaged.Api.Tests;

// Videos Managed as the widget's recorder: the widget asks for a capture
// link, records in a separate window, and the share link lands on the ticket;
// the transcript is copied over once Videos Managed has produced captions.
public class VideosManagedRecorderTests
{
    private const long OrgId = 42;
    private const long ProjectId = 7;
    private const string ShareLink = "https://videos-dev.managedplatform.com/protocall/r/abc123";

    private static (BugsManagedDbContext db, TestDoubles.TestOrgContext org) Seed(string? recorderKey)
    {
        var org = new TestDoubles.TestOrgContext();
        org.SetProject(ProjectId, "Service Managed", OrgId);
        var db = TestDoubles.NewInMemoryDb(org);
        TestDoubles.EnsureOrganization(db, OrgId);
        db.Projects.Add(new Project { Id = ProjectId, Name = "Service Managed", Slug = "service-managed", ApiKey = "k1", OrganizationId = OrgId, VideosManagedApiKey = recorderKey });
        db.SaveChanges();
        return (db, org);
    }

    private static void WithOrigin(TicketController ctrl, string origin) =>
        ctrl.ControllerContext.HttpContext.Request.Headers.Origin = origin;

    // ===== capture session =====

    [Fact]
    public async Task Capture_session_is_refused_when_the_app_has_no_recorder_key()
    {
        var (db, org) = Seed(recorderKey: null);
        var fake = new TestDoubles.FakeVideosManagedClient();
        var ctrl = TestDoubles.CreateTicketController(db, org, videos: fake);

        var result = await ctrl.CreateCaptureSession(new TicketController.CaptureSessionRequest("Board flickers", "https://sm.test/dispatch"), default);

        var status = Assert.IsType<ObjectResult>(result);
        Assert.Equal(409, status.StatusCode);
        Assert.Empty(fake.SessionRequests); // never even asked Videos Managed
    }

    [Fact]
    public async Task Capture_session_hands_back_the_capture_link_from_videos_managed()
    {
        var (db, org) = Seed(recorderKey: "vm_live_0123456789abcdef0123456789abcdef");
        var fake = new TestDoubles.FakeVideosManagedClient();
        var ctrl = TestDoubles.CreateTicketController(db, org, videos: fake);
        WithOrigin(ctrl, "https://sm.test");

        var result = await ctrl.CreateCaptureSession(new TicketController.CaptureSessionRequest("Board flickers", "https://sm.test/dispatch"), default);

        var ok = Assert.IsType<OkObjectResult>(result);
        var json = System.Text.Json.JsonSerializer.Serialize(ok.Value);
        Assert.Contains("/capture/vmc_test-token", json);
        Assert.Contains("protocall/r/abc123", json);

        var (key, req) = Assert.Single(fake.SessionRequests);
        Assert.Equal("vm_live_0123456789abcdef0123456789abcdef", key);
        Assert.Equal("bugout", req.Source);
        Assert.Equal("Board flickers", req.Title);
        Assert.Equal("https://sm.test", req.ReturnOrigin);    // completion message is posted only to the opener's origin
        Assert.StartsWith("bugout:service-managed:", req.ExternalRef);
        Assert.Equal(30 * 60, req.MaxDurationSeconds);
    }

    [Fact]
    public async Task Capture_session_reports_videos_managed_being_down_so_the_widget_falls_back()
    {
        var (db, org) = Seed(recorderKey: "vm_live_0123456789abcdef0123456789abcdef");
        var fake = new TestDoubles.FakeVideosManagedClient { NextSession = null };
        var ctrl = TestDoubles.CreateTicketController(db, org, videos: fake);

        var result = await ctrl.CreateCaptureSession(new TicketController.CaptureSessionRequest(null, null), default);

        var status = Assert.IsType<ObjectResult>(result);
        Assert.Equal(502, status.StatusCode);
        var (_, req) = Assert.Single(fake.SessionRequests);
        Assert.Equal("Service Managed bug report", req.Title); // default title comes from the app
    }

    [Fact]
    public async Task Capture_session_without_a_widget_key_is_unauthorized()
    {
        var org = new TestDoubles.TestOrgContext(); // no project resolved
        var db = TestDoubles.NewInMemoryDb(org);
        var ctrl = TestDoubles.CreateTicketController(db, org);

        var result = await ctrl.CreateCaptureSession(new TicketController.CaptureSessionRequest("x", null), default);

        Assert.IsType<UnauthorizedObjectResult>(result);
    }

    // ===== the ticket keeps the share link =====

    [Fact]
    public async Task Create_keeps_a_videos_managed_share_link_and_its_recording_id()
    {
        var (db, org) = Seed(recorderKey: "vm_live_0123456789abcdef0123456789abcdef");
        var ctrl = TestDoubles.CreateTicketController(db, org);

        var result = await ctrl.Create(new Ticket
        {
            Title = "Board flickers", TicketType = "BUG", Priority = "HIGH", SubmittedBy = "tech@customer.com",
            VideoUrl = "  " + ShareLink + "  ", VideosManagedRecordingId = "bbbbbbbb-0000-0000-0000-000000000002",
        });

        var created = Assert.IsType<CreatedAtActionResult>(result);
        var ticket = Assert.IsType<Ticket>(created.Value);
        Assert.Equal(ShareLink, ticket.VideoUrl);
        Assert.Equal("bbbbbbbb-0000-0000-0000-000000000002", ticket.VideosManagedRecordingId);
        Assert.Null(ticket.Transcript); // arrives later from Videos Managed
    }

    [Theory]
    [InlineData("https://evil.example/protocall/r/abc123")]        // share-shaped, wrong host
    [InlineData("https://videos-dev.managedplatform.com/app")]      // our host, not a share link
    [InlineData("javascript:alert(1)")]
    public async Task Create_drops_any_video_url_that_is_not_our_share_link(string url)
    {
        var (db, org) = Seed(recorderKey: null);
        var ctrl = TestDoubles.CreateTicketController(db, org);

        var result = await ctrl.Create(new Ticket
        {
            Title = "Board flickers", TicketType = "BUG", Priority = "HIGH", SubmittedBy = "tech@customer.com",
            VideoUrl = url, VideosManagedRecordingId = "bbbbbbbb-0000-0000-0000-000000000002",
        });

        var created = Assert.IsType<CreatedAtActionResult>(result);
        var ticket = Assert.IsType<Ticket>(created.Value);
        Assert.Null(ticket.VideoUrl);
        Assert.Null(ticket.VideosManagedRecordingId);
    }

    [Fact]
    public async Task Video_url_passes_a_share_link_through_and_signs_a_blob()
    {
        var (db, org) = Seed(recorderKey: null);
        db.Tickets.Add(new Ticket { Id = 1, OrganizationId = OrgId, ProjectId = ProjectId, Title = "a", TicketType = "BUG", Priority = "LOW", Status = "OPEN", VideoUrl = ShareLink });
        db.Tickets.Add(new Ticket { Id = 2, OrganizationId = OrgId, ProjectId = ProjectId, Title = "b", TicketType = "BUG", Priority = "LOW", Status = "OPEN", VideoUrl = "https://acct.blob.core.windows.net/videos/ticket_2.webm" });
        db.SaveChanges();
        var ctrl = TestDoubles.CreateTicketController(db, org);

        var external = System.Text.Json.JsonSerializer.Serialize(Assert.IsType<OkObjectResult>(await ctrl.GetVideoUrl(1)).Value);
        Assert.Contains(ShareLink, external);
        Assert.Contains("\"external\":true", external);

        var blob = System.Text.Json.JsonSerializer.Serialize(Assert.IsType<OkObjectResult>(await ctrl.GetVideoUrl(2)).Value);
        Assert.Contains("?sas=1", blob);
        Assert.Contains("\"external\":false", blob);
    }

    // ===== transcript backfill =====

    private static VideosManagedTranscriptService Backfill(BugsManagedDbContext db, TestDoubles.FakeVideosManagedClient fake) =>
        new(db, fake, new TicketActivityLogger(db), Options.Create(new DevelopmentTrackerOptions { TimeZone = "UTC" }), NullLogger<VideosManagedTranscriptService>.Instance);

    private static Ticket SeedPending(BugsManagedDbContext db, DateTime createdAt, string? transcript = null, string? recordingId = "bbbbbbbb-0000-0000-0000-000000000002")
    {
        var t = new Ticket
        {
            OrganizationId = OrgId, ProjectId = ProjectId, Title = "Board flickers", TicketType = "BUG", Priority = "HIGH", Status = "OPEN",
            SubmittedBy = "tech@customer.com", VideoUrl = ShareLink, VideosManagedRecordingId = recordingId, Transcript = transcript, CreatedAt = createdAt, UpdatedAt = createdAt,
        };
        db.Tickets.Add(t);
        db.SaveChanges();
        return t;
    }

    [Fact]
    public async Task Backfill_copies_the_captions_into_the_transcript_and_logs_it()
    {
        var (db, _) = Seed(recorderKey: null);
        var now = new DateTime(2026, 10, 9, 15, 0, 0, DateTimeKind.Utc);
        var ticket = SeedPending(db, now.AddMinutes(-5));
        var fake = new TestDoubles.FakeVideosManagedClient();

        var filled = await Backfill(db, fake).RunOnceAsync(now);

        Assert.Equal(1, filled);
        var saved = await db.Tickets.IgnoreQueryFilters().SingleAsync(t => t.Id == ticket.Id);
        Assert.Equal("Start from the technician's hours then add the truck fees", saved.Transcript);
        Assert.Equal(120, saved.VideoDurationSeconds);
        Assert.Contains(await db.TicketActivities.IgnoreQueryFilters().ToListAsync(), a => a.TicketId == ticket.Id && a.Kind == "TRANSCRIPT_READY");
    }

    [Fact]
    public async Task Backfill_waits_while_the_recording_is_still_processing()
    {
        var (db, _) = Seed(recorderKey: null);
        var now = new DateTime(2026, 10, 9, 15, 0, 0, DateTimeKind.Utc);
        var ticket = SeedPending(db, now.AddMinutes(-5));
        var fake = new TestDoubles.FakeVideosManagedClient { Unreachable = true };

        var filled = await Backfill(db, fake).RunOnceAsync(now);

        Assert.Equal(0, filled);
        Assert.Null((await db.Tickets.IgnoreQueryFilters().SingleAsync(t => t.Id == ticket.Id)).Transcript);
        Assert.Single(fake.RecordingLookups); // and it will ask again next pass
    }

    [Fact]
    public async Task Backfill_marks_no_speech_only_after_the_grace_period()
    {
        var (db, _) = Seed(recorderKey: null);
        var now = new DateTime(2026, 10, 9, 15, 0, 0, DateTimeKind.Utc);
        var fresh = SeedPending(db, now.AddMinutes(-5));
        var old = SeedPending(db, now.AddHours(-2));
        var fake = new TestDoubles.FakeVideosManagedClient { CaptionsVtt = null };

        var filled = await Backfill(db, fake).RunOnceAsync(now);

        Assert.Equal(0, filled);
        Assert.Null((await db.Tickets.IgnoreQueryFilters().SingleAsync(t => t.Id == fresh.Id)).Transcript);
        Assert.Equal(VideosManagedTranscriptService.NoSpeechTranscript, (await db.Tickets.IgnoreQueryFilters().SingleAsync(t => t.Id == old.Id)).Transcript);
    }

    [Fact]
    public async Task Backfill_ignores_tickets_that_already_have_a_transcript_or_no_recording()
    {
        var (db, _) = Seed(recorderKey: null);
        var now = new DateTime(2026, 10, 9, 15, 0, 0, DateTimeKind.Utc);
        SeedPending(db, now.AddMinutes(-5), transcript: "already here");
        SeedPending(db, now.AddMinutes(-5), recordingId: null);           // in-page blob recording
        SeedPending(db, now.AddDays(-10));                                 // outside the lookback window
        var fake = new TestDoubles.FakeVideosManagedClient();

        var filled = await Backfill(db, fake).RunOnceAsync(now);

        Assert.Equal(0, filled);
        Assert.Empty(fake.RecordingLookups);
    }

    // ===== recorder key setting =====

    private static DevelopmentFixController FixController(BugsManagedDbContext db, TestDoubles.TestOrgContext org, string role = "PLATFORM_OWNER")
    {
        var activity = new TicketActivityLogger(db);
        var ctrl = new DevelopmentFixController(
            db, org, activity, new DevelopmentOrderService(db, activity),
            new TicketNoteService(db, new HttpClient(), NullLogger<TicketNoteService>.Instance),
            new TestDoubles.NoOpVideoBlobService(), new TestDoubles.NoOpScreenshotBlobService(), new TestDoubles.NoOpAuditLogger(),
            Options.Create(new DevelopmentTrackerOptions { BoardBaseUrl = "https://board.test", TimeZone = "UTC" }),
            NullLogger<DevelopmentFixController>.Instance,
            new TestDoubles.FakeVideosManagedClient(), new TestDoubles.RecordingNotificationService());
        var claims = new List<Claim> { new(ClaimTypes.Email, "owner@x.com"), new(ClaimTypes.Role, role), new("organizationId", OrgId.ToString()) };
        ctrl.ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext { User = new ClaimsPrincipal(new ClaimsIdentity(claims, "TestAuth")) } };
        return ctrl;
    }

    [Fact]
    public async Task Recorder_key_is_stored_masked_in_answers_and_clearable()
    {
        var (db, org) = Seed(recorderKey: null);
        var ctrl = FixController(db, org);

        var set = Assert.IsType<DevelopmentFixController.AppFixSettingDto>(Assert.IsType<OkObjectResult>(
            await ctrl.SetRecorderKey(ProjectId, new DevelopmentFixController.RecorderKeyRequest(" vm_live_0123456789abcdef0123456789abcdef "))).Value);
        Assert.True(set.VideosManagedRecorder);
        Assert.Equal("vm_live_0123…", set.VideosManagedKeyPrefix);
        Assert.Equal("vm_live_0123456789abcdef0123456789abcdef", (await db.Projects.IgnoreQueryFilters().SingleAsync(p => p.Id == ProjectId)).VideosManagedApiKey);

        var apps = Assert.IsType<List<DevelopmentFixController.AppFixSettingDto>>(Assert.IsType<OkObjectResult>(await ctrl.Apps()).Value);
        var app = Assert.Single(apps);
        Assert.True(app.VideosManagedRecorder);
        Assert.DoesNotContain("abcdef0123456789abcdef", System.Text.Json.JsonSerializer.Serialize(apps)); // the full key never leaves the server

        var cleared = Assert.IsType<DevelopmentFixController.AppFixSettingDto>(Assert.IsType<OkObjectResult>(
            await ctrl.SetRecorderKey(ProjectId, new DevelopmentFixController.RecorderKeyRequest(""))).Value);
        Assert.False(cleared.VideosManagedRecorder);
        Assert.Null((await db.Projects.IgnoreQueryFilters().SingleAsync(p => p.Id == ProjectId)).VideosManagedApiKey);
    }

    [Fact]
    public async Task Recorder_key_must_look_like_a_videos_managed_key_and_needs_a_human_admin()
    {
        var (db, org) = Seed(recorderKey: null);

        var bad = await FixController(db, org).SetRecorderKey(ProjectId, new DevelopmentFixController.RecorderKeyRequest("bsk_notavideoskey_0123456789"));
        Assert.IsType<BadRequestObjectResult>(bad);

        var dev = await FixController(db, org, role: "DEVELOPER").SetRecorderKey(ProjectId, new DevelopmentFixController.RecorderKeyRequest("vm_live_0123456789abcdef0123456789abcdef"));
        Assert.Equal(403, Assert.IsType<ObjectResult>(dev).StatusCode);
        Assert.Null((await db.Projects.IgnoreQueryFilters().SingleAsync(p => p.Id == ProjectId)).VideosManagedApiKey);
    }

    [Fact]
    public void Trusted_share_links_are_ours_only()
    {
        var opts = new DevelopmentTrackerOptions();
        Assert.True(VideosManagedClient.IsTrustedShareLink("https://videos-dev.managedplatform.com/protocall/r/abc123", opts));
        Assert.True(VideosManagedClient.IsTrustedShareLink("https://videos.managedplatform.com/protocall/r/abc123?t=5", opts));
        Assert.False(VideosManagedClient.IsTrustedShareLink("https://videos-dev.managedplatform.com.evil.example/protocall/r/abc123", opts));
        Assert.False(VideosManagedClient.IsTrustedShareLink("https://evil.example/protocall/r/abc123", opts));
        Assert.False(VideosManagedClient.IsTrustedShareLink("https://videos-dev.managedplatform.com/protocall/m/room", opts));
        Assert.False(VideosManagedClient.IsTrustedShareLink(null, opts));
    }
}
