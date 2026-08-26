using BugsManaged.Api.Data;
using BugsManaged.Api.Entities;
using BugsManaged.Api.Services;
using BugsManaged.Api.Services.GoogleChat;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace BugsManaged.Api.Tests;

/// <summary>
/// Task 5 — the inbound path: a verified reply becomes a comment, an unverified
/// request is rejected, an unknown Space is ignored rather than 500-ing, and a
/// redelivered message does not double-post.
/// </summary>
public class GoogleChatInboundTests
{
    private const long OrgId = 1;
    private const long ProjectId = 10;
    private const string ClientEmail = "client@external.example";
    private const string SpaceName = "spaces/AAAAtest";

    private sealed class FixedOrgContext : IOrgContext
    {
        public long? CurrentOrganizationId { get; set; } = OrgId;
        public long? CurrentProjectId { get; set; } = ProjectId;
        public string? CurrentProjectName { get; set; } = "Test";
        public void SetOrganization(long organizationId) => CurrentOrganizationId = organizationId;
        public void SetProject(long projectId, string projectName, long organizationId)
        {
            CurrentProjectId = projectId;
            CurrentProjectName = projectName;
            CurrentOrganizationId = organizationId;
        }
    }

    private static (GoogleChatNotifier notifier, BugsManagedDbContext db) NewNotifier(
        string? serviceAccountJson = null)
    {
        var orgContext = new FixedOrgContext();
        var options = new DbContextOptionsBuilder<BugsManagedDbContext>()
            .UseInMemoryDatabase($"gchat-{Guid.NewGuid()}")
            .Options;
        var db = new BugsManagedDbContext(options, orgContext);

        var chatOptions = Options.Create(new GoogleChatOptions
        {
            ProjectNumber = "123456789",
            // Present but syntactically invalid: enough for IsConfiguredAsync to
            // attempt a build. Outbound posting is not exercised here — these
            // tests are about what the inbound path writes to the database.
            ServiceAccountJson = serviceAccountJson,
        });

        var config = new ConfigurationBuilder().AddInMemoryCollection().Build();

        var credentials = new GoogleChatCredentialProvider(
            new NullScopeFactory(db), chatOptions, config,
            NullLogger<GoogleChatCredentialProvider>.Instance);

        var api = new GoogleChatApiClient(
            new HttpClient { BaseAddress = new Uri("https://chat.googleapis.test/v1/") },
            credentials, chatOptions, NullLogger<GoogleChatApiClient>.Instance);

        var notifier = new GoogleChatNotifier(
            db, api,
            new NotificationService(new HttpClient(), NullLogger<NotificationService>.Instance),
            new FakeEnv(), chatOptions, config, NullLogger<GoogleChatNotifier>.Instance);

        return (notifier, db);
    }

    private static Ticket SeedTicketAndSpace(BugsManagedDbContext db)
    {
        var ticket = new Ticket
        {
            OrganizationId = OrgId,
            ProjectId = ProjectId,
            Title = "Export button does nothing",
            SubmittedBy = ClientEmail,
            Status = "IN_PROGRESS",
            UpdatedAt = DateTime.UtcNow,
        };
        db.Tickets.Add(ticket);

        db.GoogleChatSpaces.Add(new GoogleChatSpace
        {
            OrganizationId = OrgId,
            SpaceName = SpaceName,
            MemberEmail = ClientEmail,
            InviteSent = true,
        });

        db.SaveChanges();
        return ticket;
    }

    private static GoogleChatNotifier.InboundMessage Message(
        string text = "Still broken on my side",
        string? messageName = "spaces/AAAAtest/messages/MSG1",
        string? spaceName = SpaceName,
        bool bot = false) =>
        new(messageName, spaceName, ThreadName: null, Text: text,
            SenderEmail: ClientEmail, SenderDisplayName: "A Client", SenderIsBot: bot);

    [Fact]
    public async Task Valid_client_reply_becomes_a_ticket_comment()
    {
        var (notifier, db) = NewNotifier();
        var ticket = SeedTicketAndSpace(db);

        var outcome = await notifier.HandleInboundMessageAsync(Message());

        Assert.Equal(GoogleChatNotifier.InboundOutcome.Saved, outcome);

        var note = await db.TicketNotes.IgnoreQueryFilters().SingleAsync();
        Assert.Equal(ticket.Id, note.TicketId);
        Assert.Equal("GOOGLE_CHAT", note.Source);
        Assert.Equal("Still broken on my side", note.Content);
        Assert.Equal("spaces/AAAAtest/messages/MSG1", note.GoogleChatMessageName);
    }

    [Fact]
    public async Task First_reply_marks_the_client_as_joined()
    {
        var (notifier, db) = NewNotifier();
        SeedTicketAndSpace(db);

        await notifier.HandleInboundMessageAsync(Message());

        var space = await db.GoogleChatSpaces.IgnoreQueryFilters().SingleAsync();
        Assert.NotNull(space.MemberFirstSeenAt);
    }

    [Fact]
    public async Task Redelivered_message_does_not_create_a_second_comment()
    {
        var (notifier, db) = NewNotifier();
        SeedTicketAndSpace(db);

        var first = await notifier.HandleInboundMessageAsync(Message());
        var second = await notifier.HandleInboundMessageAsync(Message());

        Assert.Equal(GoogleChatNotifier.InboundOutcome.Saved, first);
        Assert.Equal(GoogleChatNotifier.InboundOutcome.Duplicate, second);
        Assert.Equal(1, await db.TicketNotes.IgnoreQueryFilters().CountAsync());
    }

    [Fact]
    public async Task Messages_from_an_app_are_ignored_so_our_own_posts_cannot_loop()
    {
        var (notifier, db) = NewNotifier();
        SeedTicketAndSpace(db);

        var outcome = await notifier.HandleInboundMessageAsync(Message(bot: true));

        Assert.Equal(GoogleChatNotifier.InboundOutcome.Ignored, outcome);
        Assert.Equal(0, await db.TicketNotes.IgnoreQueryFilters().CountAsync());
    }

    [Fact]
    public async Task Unknown_space_is_ignored_not_an_error()
    {
        var (notifier, db) = NewNotifier();
        SeedTicketAndSpace(db);

        var outcome = await notifier.HandleInboundMessageAsync(
            Message(spaceName: "spaces/NOTOURS"));

        Assert.Equal(GoogleChatNotifier.InboundOutcome.UnknownSpace, outcome);
        Assert.Equal(0, await db.TicketNotes.IgnoreQueryFilters().CountAsync());
    }

    [Fact]
    public async Task Empty_message_is_ignored()
    {
        var (notifier, db) = NewNotifier();
        SeedTicketAndSpace(db);

        var outcome = await notifier.HandleInboundMessageAsync(Message(text: "   "));

        Assert.Equal(GoogleChatNotifier.InboundOutcome.Ignored, outcome);
        Assert.Equal(0, await db.TicketNotes.IgnoreQueryFilters().CountAsync());
    }

    [Fact]
    public async Task Explicit_ticket_number_wins_over_most_recent()
    {
        var (notifier, db) = NewNotifier();
        var older = SeedTicketAndSpace(db);

        // A newer ticket from the same client, so "most recently updated" would
        // otherwise capture the reply.
        db.Tickets.Add(new Ticket
        {
            OrganizationId = OrgId,
            ProjectId = ProjectId,
            Title = "Something else",
            SubmittedBy = ClientEmail,
            UpdatedAt = DateTime.UtcNow.AddMinutes(5),
        });
        await db.SaveChangesAsync();

        await notifier.HandleInboundMessageAsync(Message(text: $"#{older.Id} still broken"));

        var note = await db.TicketNotes.IgnoreQueryFilters().SingleAsync();
        Assert.Equal(older.Id, note.TicketId);
    }

    [Fact]
    public async Task Ticket_number_belonging_to_another_client_is_not_honoured()
    {
        var (notifier, db) = NewNotifier();
        SeedTicketAndSpace(db);

        var someoneElse = new Ticket
        {
            OrganizationId = OrgId,
            ProjectId = ProjectId,
            Title = "Not this client's ticket",
            SubmittedBy = "other@external.example",
            UpdatedAt = DateTime.UtcNow,
        };
        db.Tickets.Add(someoneElse);
        await db.SaveChangesAsync();

        await notifier.HandleInboundMessageAsync(Message(text: $"#{someoneElse.Id} let me in"));

        // Falls back to this client's own ticket rather than writing onto another
        // client's — typing a number must not be a way to reach it.
        var note = await db.TicketNotes.IgnoreQueryFilters().SingleAsync();
        Assert.NotEqual(someoneElse.Id, note.TicketId);
    }

    [Fact]
    public async Task Chat_status_reports_invited_then_joined()
    {
        var (notifier, db) = NewNotifier();
        var ticket = SeedTicketAndSpace(db);

        var before = await notifier.GetChatStatusAsync(ticket);
        Assert.True(before.SpaceExists);
        Assert.True(before.InviteSent);
        Assert.False(before.ClientJoined);

        await notifier.HandleInboundMessageAsync(Message());

        var after = await notifier.GetChatStatusAsync(ticket);
        Assert.True(after.ClientJoined);
    }

    [Fact]
    public void Sanitize_neutralises_mention_injection()
    {
        // A client typing this into a bug report must not get us to @-mention
        // everyone in the Space on their behalf.
        var cleaned = GoogleChatNotifier.Sanitize("<users/all> please look");

        Assert.DoesNotContain("<", cleaned);
        Assert.DoesNotContain(">", cleaned);
        Assert.Contains("users/all", cleaned);
    }

    // ── cross-tenant isolation ───────────────────────────────────────────────

    [Fact]
    public async Task Sender_from_another_organization_cannot_write_into_this_space()
    {
        var (notifier, db) = NewNotifier();
        SeedTicketAndSpace(db);     // Space belongs to OrgId (1)

        // Verified event, but sent by a Chat app belonging to organization 2. A
        // valid token proves "from a project we trust", not "from the project that
        // owns this Space" — this is the check that closes that gap.
        var outcome = await notifier.HandleInboundMessageAsync(
            Message(), senderOrganizationId: OrgId + 1);

        Assert.Equal(GoogleChatNotifier.InboundOutcome.SpaceNotOwnedBySender, outcome);
        Assert.Equal(0, await db.TicketNotes.IgnoreQueryFilters().CountAsync());
    }

    [Fact]
    public async Task Sender_from_the_owning_organization_is_accepted()
    {
        var (notifier, db) = NewNotifier();
        SeedTicketAndSpace(db);

        var outcome = await notifier.HandleInboundMessageAsync(
            Message(), senderOrganizationId: OrgId);

        Assert.Equal(GoogleChatNotifier.InboundOutcome.Saved, outcome);
        Assert.Equal(1, await db.TicketNotes.IgnoreQueryFilters().CountAsync());
    }

    [Fact]
    public async Task Shared_credential_sender_is_not_constrained()
    {
        var (notifier, db) = NewNotifier();
        SeedTicketAndSpace(db);

        // A GoogleServiceAccounts row with no OrganizationId — one Chat app
        // legitimately serving every tenant. There is no owning organization to
        // compare against, so the check must not fire.
        var outcome = await notifier.HandleInboundMessageAsync(
            Message(), senderOrganizationId: null);

        Assert.Equal(GoogleChatNotifier.InboundOutcome.Saved, outcome);
        Assert.Equal(1, await db.TicketNotes.IgnoreQueryFilters().CountAsync());
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    /// <summary>
    /// Hands the credential provider the same in-memory DbContext, so its
    /// "read the GoogleServiceAccounts row" path works without a real container.
    /// </summary>
    private sealed class NullScopeFactory : IServiceScopeFactory, IServiceScope, IServiceProvider
    {
        private readonly BugsManagedDbContext _db;
        public NullScopeFactory(BugsManagedDbContext db) => _db = db;

        public IServiceScope CreateScope() => this;
        public IServiceProvider ServiceProvider => this;
        public object? GetService(Type serviceType) =>
            serviceType == typeof(BugsManagedDbContext) ? _db : null;
        public void Dispose() { }
    }

    private sealed class FakeEnv : IWebHostEnvironment
    {
        public string EnvironmentName { get; set; } = "Development";
        public string ApplicationName { get; set; } = "Tests";
        public string WebRootPath { get; set; } = "";
        public IFileProvider WebRootFileProvider { get; set; } = new NullFileProvider();
        public string ContentRootPath { get; set; } = "";
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }
}

/// <summary>
/// Task 5 — the webhook controller's own contract: nothing is trusted until the
/// bearer token verifies.
/// </summary>
public class GoogleChatWebhookVerificationTests
{
    /// <summary>Stands in for the config value plus the GoogleServiceAccounts rows.</summary>
    private sealed class StubAudiences : IGoogleChatAudienceSource
    {
        private readonly GoogleChatSender[] _senders;

        // Null-tolerant: `Verifier(null)` binds null to the params *array*, not to
        // an element, which would otherwise NRE instead of exercising the
        // no-sender-configured path.
        public StubAudiences(params string?[]? projectNumbers) =>
            _senders = (projectNumbers ?? Array.Empty<string?>())
                .Where(a => !string.IsNullOrWhiteSpace(a))
                .Select(a => new GoogleChatSender(a!, OrganizationId: null))
                .ToArray();

        public Task<IReadOnlyCollection<GoogleChatSender>> GetTrustedSendersAsync(
            CancellationToken ct = default)
            => Task.FromResult<IReadOnlyCollection<GoogleChatSender>>(_senders);
    }

    private const string Endpoint = "https://example.test/api/google-chat/events";

    private static GoogleChatRequestVerifier Verifier(
        string? eventAudience = null, params string?[]? projectNumbers) =>
        new(new StubAudiences(projectNumbers),
            Options.Create(new GoogleChatOptions { EventAudience = eventAudience }),
            NullLogger<GoogleChatRequestVerifier>.Instance);

    [Fact]
    public async Task Missing_system_id_token_is_rejected()
    {
        // Add-ons framework Chat apps always send one; a request without it did
        // not come from Google.
        var result = await Verifier().VerifyAsync(null, Endpoint);

        Assert.False(result.IsValid);
        Assert.Contains("systemIdToken", result.Reason);
    }

    [Fact]
    public async Task Garbage_token_is_rejected()
    {
        var result = await Verifier().VerifyAsync("not-a-real-jwt", Endpoint);

        Assert.False(result.IsValid);
    }

    [Fact]
    public async Task Unknown_endpoint_url_fails_closed()
    {
        // With no audience to compare against we cannot tell a token minted for
        // our app from one minted for somebody else's.
        var result = await Verifier().VerifyAsync("some-token", requestUrl: null);

        Assert.False(result.IsValid);
        Assert.Contains("EventAudience", result.Reason);
    }

    [Fact]
    public async Task Configured_audience_overrides_the_request_url()
    {
        // Behind a tunnel the URL Kestrel sees is not the one Google was given,
        // so the explicit setting must win.
        var result = await Verifier(eventAudience: Endpoint)
            .VerifyAsync("still-not-a-real-jwt", requestUrl: "http://localhost:5281/api/google-chat/events");

        Assert.False(result.IsValid);              // garbage token still fails
        Assert.Contains(Endpoint, result.Reason);  // but against the configured audience
    }
}
