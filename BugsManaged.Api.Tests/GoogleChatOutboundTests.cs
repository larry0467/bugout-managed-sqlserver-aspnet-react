using System.Net;
using System.Text;
using System.Text.Json;
using BugsManaged.Api.Data;
using BugsManaged.Api.Entities;
using BugsManaged.Api.Services;
using BugsManaged.Api.Services.GoogleChat;
using Microsoft.AspNetCore.Hosting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace BugsManaged.Api.Tests;

/// <summary>
/// Task 5 — unit tests for the Chat API wrapper with the HTTP calls mocked, and
/// for the outbound leg that turns a ticket event into a Chat post.
///
/// These are the tests that prove a developer's comment actually reaches the
/// client's Space: <see cref="Adding_a_comment_posts_it_to_the_client_space"/>
/// asserts on the exact request that goes out.
/// </summary>
public class GoogleChatOutboundTests
{
    private const long OrgId = 1;
    private const long ProjectId = 10;
    private const string ClientEmail = "client@external.example";
    private const string SpaceName = "spaces/AAAAtest";

    // ── harness ──────────────────────────────────────────────────────────────

    /// <summary>
    /// Records every request and replies from a queue of canned responses, so a
    /// test can assert on what we sent and drive retry behaviour.
    /// </summary>
    private sealed class StubHandler : HttpMessageHandler
    {
        private readonly Queue<HttpResponseMessage> _responses = new();
        public List<(HttpMethod Method, string Url, string? Body, string? Auth)> Requests { get; } = new();

        public StubHandler Enqueue(HttpStatusCode status, object? body = null)
        {
            _responses.Enqueue(new HttpResponseMessage(status)
            {
                Content = new StringContent(
                    body == null ? "" : JsonSerializer.Serialize(body), Encoding.UTF8, "application/json"),
            });
            return this;
        }

        protected override async Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var body = request.Content == null
                ? null
                : await request.Content.ReadAsStringAsync(cancellationToken);

            Requests.Add((request.Method, request.RequestUri!.ToString(), body,
                request.Headers.Authorization?.ToString()));

            return _responses.Count > 0
                ? _responses.Dequeue()
                : new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent("{}") };
        }
    }

    /// <summary>A token without going anywhere near Google's token endpoint.</summary>
    private sealed class StubTokenSource : IGoogleChatTokenSource
    {
        private readonly string? _token;
        public StubTokenSource(string? token = "test-token") => _token = token;

        public Task<string?> GetAccessTokenAsync(long? organizationId, string[] scopes, CancellationToken ct = default)
        {
            RequestedScopes.Add(string.Join(' ', scopes));
            return Task.FromResult(_token);
        }

        /// <summary>Scope sets asked for, so a test can assert the right one was used.</summary>
        public List<string> RequestedScopes { get; } = new();

        public Task<bool> IsConfiguredAsync(long? organizationId)
            => Task.FromResult(_token != null);
    }

    private sealed class FixedOrgContext : IOrgContext
    {
        public long? CurrentOrganizationId { get; set; } = OrgId;
        public long? CurrentProjectId { get; set; } = ProjectId;
        public string? CurrentProjectName { get; set; } = "Test";
        public void SetOrganization(long organizationId) => CurrentOrganizationId = organizationId;
        public void SetProject(long projectId, string projectName, long organizationId) { }
    }

    private sealed class FakeEnv : IWebHostEnvironment
    {
        public string EnvironmentName { get; set; } = "Production"; // no "DEV - " prefix
        public string ApplicationName { get; set; } = "Tests";
        public string WebRootPath { get; set; } = "";
        public IFileProvider WebRootFileProvider { get; set; } = new NullFileProvider();
        public string ContentRootPath { get; set; } = "";
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }

    private sealed class SelfScopeFactory : IServiceScopeFactory, IServiceScope, IServiceProvider
    {
        private readonly BugsManagedDbContext _db;
        public SelfScopeFactory(BugsManagedDbContext db) => _db = db;
        public IServiceScope CreateScope() => this;
        public IServiceProvider ServiceProvider => this;
        public object? GetService(Type t) => t == typeof(BugsManagedDbContext) ? _db : null;
        public void Dispose() { }
    }

    private static (GoogleChatApiClient api, GoogleChatNotifier notifier, BugsManagedDbContext db)
        Build(StubHandler handler, string? token = "test-token")
    {
        var db = new BugsManagedDbContext(
            new DbContextOptionsBuilder<BugsManagedDbContext>()
                .UseInMemoryDatabase($"gchat-out-{Guid.NewGuid()}").Options,
            new FixedOrgContext());

        var options = Options.Create(new GoogleChatOptions
        {
            RetryBaseDelayMs = 1,   // keep retry tests fast
            MaxAttempts = 3,
        });

        var api = new GoogleChatApiClient(
            new HttpClient(handler) { BaseAddress = new Uri("https://chat.googleapis.test/v1/") },
            new StubTokenSource(token), options, NullLogger<GoogleChatApiClient>.Instance);

        var notifier = new GoogleChatNotifier(
            db, api,
            new NotificationService(new HttpClient(handler), NullLogger<NotificationService>.Instance),
            new FakeEnv(), options,
            new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["BugsManaged:DashboardBaseUrl"] = "https://bugout.test",
            }).Build(),
            NullLogger<GoogleChatNotifier>.Instance);

        return (api, notifier, db);
    }

    private static Ticket SeedTicket(BugsManagedDbContext db, string? submittedBy = ClientEmail)
    {
        db.Projects.Add(new Project
        {
            Id = ProjectId, OrganizationId = OrgId, Name = "Acme Portal", Slug = "acme", ApiKey = "k",
        });

        var ticket = new Ticket
        {
            OrganizationId = OrgId,
            ProjectId = ProjectId,
            Title = "Export button does nothing",
            SubmittedBy = submittedBy,
            Status = "IN_PROGRESS",
            UpdatedAt = DateTime.UtcNow,
        };
        db.Tickets.Add(ticket);
        db.SaveChanges();
        return ticket;
    }

    private static void SeedSpace(BugsManagedDbContext db) =>
        db.GoogleChatSpaces.Add(new GoogleChatSpace
        {
            OrganizationId = OrgId,
            SpaceName = SpaceName,
            MemberEmail = ClientEmail,
            InviteSent = true,
        });

    private static TicketNote SeedNote(BugsManagedDbContext db, Ticket ticket, string source = "DASHBOARD")
    {
        var note = new TicketNote
        {
            TicketId = ticket.Id,
            OrganizationId = OrgId,
            AuthorEmail = "dev@ourteam.example",
            AuthorName = "Anil Kumar",
            Content = "Fixed on dev, please retest.",
            NoteType = "COMMENT",
            Source = source,
        };
        db.TicketNotes.Add(note);
        db.SaveChanges();
        return note;
    }

    // ── the comment leg ──────────────────────────────────────────────────────

    [Fact]
    public async Task Adding_a_comment_posts_it_to_the_client_space()
    {
        var handler = new StubHandler()
            .Enqueue(HttpStatusCode.OK, new { name = $"{SpaceName}/messages/M1", thread = new { name = $"{SpaceName}/threads/T1" } });

        var (_, notifier, db) = Build(handler);
        var ticket = SeedTicket(db);
        SeedSpace(db);
        var note = SeedNote(db, ticket);
        await db.SaveChangesAsync();

        await notifier.HandleAsync(new GoogleChatJob(
            GoogleChatJobKind.NoteAdded, ticket.Id, OrgId, NoteId: note.Id));

        var request = Assert.Single(handler.Requests);
        Assert.Equal(HttpMethod.Post, request.Method);
        Assert.Contains($"{SpaceName}/messages", request.Url);
        Assert.Equal("Bearer test-token", request.Auth);

        // Everything a client needs without opening the dashboard.
        Assert.Contains("Fixed on dev, please retest.", request.Body);
        Assert.Contains($"#{ticket.Id}", request.Body);
        Assert.Contains("Export button does nothing", request.Body);
        Assert.Contains("Anil Kumar", request.Body);
        Assert.Contains($"https://bugout.test/tickets/{ticket.Id}", request.Body);
    }

    [Fact]
    public async Task Tenant_name_appears_in_the_outbound_comment()
    {
        var handler = new StubHandler()
            .Enqueue(HttpStatusCode.OK, new { name = $"{SpaceName}/messages/M1" });

        var (_, notifier, db) = Build(handler);
        var ticket = SeedTicket(db);

        // Spaces are keyed on reporter email, so one person reporting against
        // several subscriber apps has a single Space. Naming the app is what keeps
        // that Space readable.
        ticket.TenantId = "tenant-customer-portal";
        ticket.TenantName = "Customer Portal";
        SeedSpace(db);
        var note = SeedNote(db, ticket);
        await db.SaveChangesAsync();

        await notifier.HandleAsync(new GoogleChatJob(
            GoogleChatJobKind.NoteAdded, ticket.Id, OrgId, NoteId: note.Id));

        var request = Assert.Single(handler.Requests);
        Assert.Contains("Customer Portal", request.Body);
        Assert.Contains($"#{ticket.Id}", request.Body);
    }

    [Fact]
    public async Task A_ticket_with_no_tenant_gets_no_label()
    {
        var handler = new StubHandler()
            .Enqueue(HttpStatusCode.OK, new { name = $"{SpaceName}/messages/M1" });

        var (_, notifier, db) = Build(handler);
        var ticket = SeedTicket(db);        // TenantName left null
        SeedSpace(db);
        var note = SeedNote(db, ticket);
        await db.SaveChangesAsync();

        await notifier.HandleAsync(new GoogleChatJob(
            GoogleChatJobKind.NoteAdded, ticket.Id, OrgId, NoteId: note.Id));

        // No stray separator when there is nothing to name.
        var request = Assert.Single(handler.Requests);
        Assert.DoesNotContain($"#{ticket.Id} · ", request.Body);
    }

    [Fact]
    public async Task Comment_post_records_the_thread_and_message_ids()
    {
        var handler = new StubHandler()
            .Enqueue(HttpStatusCode.OK, new { name = $"{SpaceName}/messages/M1", thread = new { name = $"{SpaceName}/threads/T1" } });

        var (_, notifier, db) = Build(handler);
        var ticket = SeedTicket(db);
        SeedSpace(db);
        var note = SeedNote(db, ticket);
        await db.SaveChangesAsync();

        await notifier.HandleAsync(new GoogleChatJob(
            GoogleChatJobKind.NoteAdded, ticket.Id, OrgId, NoteId: note.Id));

        // The thread is how a client's reply gets attributed back to this ticket.
        Assert.Equal($"{SpaceName}/threads/T1",
            (await db.Tickets.IgnoreQueryFilters().SingleAsync(t => t.Id == ticket.Id)).GoogleChatThreadName);

        // The message id is the loop guard: if Chat ever delivers our own post
        // back as an event, the inbound path finds this note and skips it.
        Assert.Equal($"{SpaceName}/messages/M1",
            (await db.TicketNotes.IgnoreQueryFilters().SingleAsync(n => n.Id == note.Id)).GoogleChatMessageName);
    }

    [Fact]
    public async Task A_comment_that_came_from_chat_is_not_echoed_back()
    {
        var handler = new StubHandler();
        var (_, notifier, db) = Build(handler);
        var ticket = SeedTicket(db);
        SeedSpace(db);
        var note = SeedNote(db, ticket, source: "GOOGLE_CHAT");
        await db.SaveChangesAsync();

        await notifier.HandleAsync(new GoogleChatJob(
            GoogleChatJobKind.NoteAdded, ticket.Id, OrgId, NoteId: note.Id));

        Assert.Empty(handler.Requests);
    }

    [Fact]
    public async Task Comment_creates_the_space_on_first_use_then_reuses_it()
    {
        var handler = new StubHandler()
            .Enqueue(HttpStatusCode.OK, new { name = SpaceName, displayName = "Acme Portal — client" })  // spaces.create
            .Enqueue(HttpStatusCode.OK, new { })                                                        // members.create
            .Enqueue(HttpStatusCode.OK, new { name = $"{SpaceName}/messages/M1" })                       // messages.create
            .Enqueue(HttpStatusCode.OK, new { name = $"{SpaceName}/messages/M2" });                      // second comment

        var (_, notifier, db) = Build(handler);
        var ticket = SeedTicket(db);           // deliberately no Space seeded
        var first = SeedNote(db, ticket);
        await db.SaveChangesAsync();

        await notifier.HandleAsync(new GoogleChatJob(
            GoogleChatJobKind.NoteAdded, ticket.Id, OrgId, NoteId: first.Id));

        var second = SeedNote(db, ticket);
        await notifier.HandleAsync(new GoogleChatJob(
            GoogleChatJobKind.NoteAdded, ticket.Id, OrgId, NoteId: second.Id));

        // One Space, created once and reused — not one per comment.
        Assert.Equal(1, await db.GoogleChatSpaces.IgnoreQueryFilters().CountAsync());
        Assert.Single(handler.Requests, r => r.Url.EndsWith("/v1/spaces"));
        Assert.Equal(2, handler.Requests.Count(r => r.Url.Contains("/messages")));
    }

    [Fact]
    public async Task No_credential_means_no_http_call_at_all()
    {
        var handler = new StubHandler();
        var (_, notifier, db) = Build(handler, token: null);
        var ticket = SeedTicket(db);
        SeedSpace(db);
        var note = SeedNote(db, ticket);
        await db.SaveChangesAsync();

        await notifier.HandleAsync(new GoogleChatJob(
            GoogleChatJobKind.NoteAdded, ticket.Id, OrgId, NoteId: note.Id));

        // Degrades silently to the email notification rather than throwing.
        Assert.Empty(handler.Requests);
    }

    [Fact]
    public async Task A_ticket_with_no_client_email_is_skipped_not_failed()
    {
        var handler = new StubHandler();
        var (_, notifier, db) = Build(handler);
        var ticket = SeedTicket(db, submittedBy: null);
        var note = SeedNote(db, ticket);
        await db.SaveChangesAsync();

        await notifier.HandleAsync(new GoogleChatJob(
            GoogleChatJobKind.NoteAdded, ticket.Id, OrgId, NoteId: note.Id));

        Assert.Empty(handler.Requests);
        Assert.Equal(0, await db.GoogleChatSpaces.IgnoreQueryFilters().CountAsync());
    }

    // ── the resolve leg, still working ───────────────────────────────────────

    [Fact]
    public async Task Resolving_a_ticket_posts_the_resolution()
    {
        var handler = new StubHandler().Enqueue(HttpStatusCode.OK, new { name = $"{SpaceName}/messages/M1" });

        var (_, notifier, db) = Build(handler);
        var ticket = SeedTicket(db);
        ticket.Status = "RESOLVED";
        ticket.Resolution = "Corrected the export mime type.";
        SeedSpace(db);
        await db.SaveChangesAsync();

        await notifier.HandleAsync(new GoogleChatJob(GoogleChatJobKind.TicketResolved, ticket.Id, OrgId));

        var request = Assert.Single(handler.Requests);
        Assert.Contains("resolved", request.Body);
        Assert.Contains("Corrected the export mime type.", request.Body);
    }

    // ── the wrapper's own contract ───────────────────────────────────────────

    [Fact]
    public async Task Rate_limited_calls_are_retried_then_succeed()
    {
        var handler = new StubHandler()
            .Enqueue(HttpStatusCode.TooManyRequests)
            .Enqueue(HttpStatusCode.OK, new { name = $"{SpaceName}/messages/M1" });

        var (api, _, _) = Build(handler);

        var sent = await api.PostMessageAsync(OrgId, SpaceName, "hello");

        Assert.NotNull(sent);
        Assert.Equal(2, handler.Requests.Count);
    }

    [Fact]
    public async Task Client_errors_are_not_retried()
    {
        var handler = new StubHandler()
            .Enqueue(HttpStatusCode.BadRequest, new { error = new { message = "malformed" } });

        var (api, _, _) = Build(handler);

        var sent = await api.PostMessageAsync(OrgId, SpaceName, "hello");

        // A 400 fails identically every time; retrying only delays the log line.
        Assert.Null(sent);
        Assert.Single(handler.Requests);
    }

    [Fact]
    public async Task Each_operation_asks_for_only_its_own_scope()
    {
        // Regression guard for ACCESS_TOKEN_SCOPE_INSUFFICIENT: chat.bot covers
        // posting as the app but NOT spaces.create, and Chat rejects some
        // app-auth scope combinations on one token — so each call mints a token
        // carrying exactly what it needs, never a merged set.
        var handler = new StubHandler()
            .Enqueue(HttpStatusCode.OK, new { name = SpaceName })   // spaces.create
            .Enqueue(HttpStatusCode.OK, new { })                    // members.create
            .Enqueue(HttpStatusCode.OK, new { name = $"{SpaceName}/messages/M1" });

        var tokens = new StubTokenSource();
        var options = Options.Create(new GoogleChatOptions { RetryBaseDelayMs = 1 });
        var api = new GoogleChatApiClient(
            new HttpClient(handler) { BaseAddress = new Uri("https://chat.googleapis.test/v1/") },
            tokens, options, NullLogger<GoogleChatApiClient>.Instance);

        await api.CreateSpaceForClientAsync(OrgId, ClientEmail, "Acme");
        await api.PostMessageAsync(OrgId, SpaceName, "hello");

        Assert.Equal(
            new[]
            {
                "https://www.googleapis.com/auth/chat.app.spaces.create",
                "https://www.googleapis.com/auth/chat.app.memberships",
                "https://www.googleapis.com/auth/chat.bot",
            },
            tokens.RequestedScopes);
    }

    [Fact]
    public async Task Already_a_member_counts_as_invited()
    {
        var handler = new StubHandler()
            .Enqueue(HttpStatusCode.Conflict, new { error = new { status = "ALREADY_EXISTS" } });

        var (api, _, _) = Build(handler);

        Assert.True(await api.AddMemberAsync(OrgId, SpaceName, ClientEmail));
    }

    [Fact]
    public async Task Space_creation_survives_a_refused_invite()
    {
        var handler = new StubHandler()
            .Enqueue(HttpStatusCode.OK, new { name = SpaceName })      // spaces.create
            .Enqueue(HttpStatusCode.Forbidden, new { error = "external members not allowed" });

        var (api, _, _) = Build(handler);

        var created = await api.CreateSpaceForClientAsync(OrgId, ClientEmail, "Acme");

        // The Space is kept and the outstanding invite recorded — losing it would
        // mean creating a duplicate on the client's next ticket.
        Assert.NotNull(created);
        Assert.Equal(SpaceName, created.SpaceName);
        Assert.False(created.InviteSent);
    }

    [Fact]
    public async Task Unthreaded_space_falls_back_to_posting_without_a_thread()
    {
        var handler = new StubHandler()
            .Enqueue(HttpStatusCode.BadRequest, new { error = "thread not supported" })
            .Enqueue(HttpStatusCode.OK, new { name = $"{SpaceName}/messages/M1" });

        var (api, _, _) = Build(handler);

        var sent = await api.PostMessageAsync(OrgId, SpaceName, "hello", threadKey: "ticket-1");

        Assert.NotNull(sent);
        Assert.Equal(2, handler.Requests.Count);
        Assert.Contains("thread", handler.Requests[0].Body);
        Assert.DoesNotContain("thread", handler.Requests[1].Body);
    }
}
