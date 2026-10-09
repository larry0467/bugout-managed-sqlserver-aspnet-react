using BugsManaged.Api.Data;
using Microsoft.EntityFrameworkCore;
using BugsManaged.Api.Entities;
using BugsManaged.Api.Services;
using BugsManaged.Api.Controllers;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;

namespace BugsManaged.Api.Tests;

/// <summary>
/// Shared fakes and a TicketController factory.
///
/// The three original fixtures each built a TicketController inline, and each
/// broke when the constructor grew: they were calling a four-argument overload
/// that had not existed for several commits, so the whole test project stopped
/// compiling (and CI never noticed, because `dotnet test` runs from the API
/// folder). Building it in one place means the next dependency added to the
/// controller is a one-line fix here rather than a hunt through fixtures.
/// </summary>
public static class TestDoubles
{
    public static TicketController CreateTicketController(
        BugsManagedDbContext db,
        IOrgContext orgContext,
        ITicketNotificationService? notify = null)
    {
        // POST /api/tickets runs BillingService.CheckTicketLimitAsync, which
        // denies with 402 when the organization row is missing. The fixtures seed
        // projects and users but never an organization, so without this every
        // Create test gets an ObjectResult instead of CreatedAtAction. Exempt
        // from billing so ticket-count limits never make a test flaky as the
        // month fills up.
        EnsureOrganization(db, orgContext.CurrentOrganizationId);

        var classifier = new TicketClassifierService(
            new HttpClient(),
            new ConfigurationBuilder().AddInMemoryCollection().Build(),
            NullLogger<TicketClassifierService>.Instance);

        var controller = new TicketController(
            db,
            classifier,
            orgContext,
            new NoOpAuditLogger(),
            new NoOpClaudeAgentClient(),
            new NoOpVideoBlobService(),
            new BillingService(db),
            new NoOpActivityLogger(),
            NullLogger<TicketController>.Instance,
            notify ?? new NoOpTicketNotificationService());

        controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext(),
        };

        return controller;
    }

    public static void EnsureOrganization(BugsManagedDbContext db, long? organizationId)
    {
        if (organizationId == null) return;
        if (db.Organizations.IgnoreQueryFilters().Any(o => o.Id == organizationId)) return;

        db.Organizations.Add(new Organization
        {
            Id = organizationId.Value,
            Name = "Test Org",
            Slug = $"test-org-{organizationId}",
            Plan = "PRO",
            IsBillingExempt = true,
        });
        db.SaveChanges();
    }

    public static BugsManagedDbContext NewInMemoryDb(IOrgContext orgContext)
    {
        var options = new DbContextOptionsBuilder<BugsManagedDbContext>()
            .UseInMemoryDatabase(databaseName: $"bugs-{Guid.NewGuid()}")
            .Options;
        return new BugsManagedDbContext(options, orgContext);
    }

    public sealed class TestOrgContext : IOrgContext
    {
        public long? CurrentOrganizationId { get; set; }
        public long? CurrentProjectId { get; set; }
        public string? CurrentProjectName { get; set; }
        public void SetOrganization(long organizationId) => CurrentOrganizationId = organizationId;
        public void SetProject(long projectId, string projectName, long organizationId)
        {
            CurrentProjectId = projectId;
            CurrentProjectName = projectName;
            CurrentOrganizationId = organizationId;
        }
    }

    public sealed class NoOpAuditLogger : IAuditLogger
    {
        public void Record(
            string action, string outcome, string? actorEmail = null, long? actorUserId = null,
            long? organizationId = null, long? targetTicketId = null, string? targetType = null,
            string? targetId = null, IReadOnlyDictionary<string, object?>? extra = null) { }
    }

    public sealed class NoOpActivityLogger : ITicketActivityLogger
    {
        public void Log(Ticket ticket, string kind, string message,
            string? actorEmail, string? actorName = null, object? payload = null) { }
    }

    private sealed class NoOpClaudeAgentClient : IClaudeAgentClient
    {
        public Task<ClaudeRunResultDto> RunAsync(ClaudeRunRequestDto request, CancellationToken ct)
            => Task.FromResult(new ClaudeRunResultDto { Status = "SUCCEEDED" });

        public Task<PromoteResultDto> PromoteAsync(PromoteRequestDto request, CancellationToken ct)
            => Task.FromResult(new PromoteResultDto());
    }

    public sealed class NoOpVideoBlobService : IVideoBlobService
    {
        public Task<string> UploadAsync(Stream data, string extension, long ticketId, CancellationToken ct = default)
            => Task.FromResult($"https://example.invalid/{ticketId}{extension}");

        public Task<Uri> GenerateSasUriAsync(string blobUri, TimeSpan validFor, CancellationToken ct = default)
            => Task.FromResult(new Uri(blobUri + "?sas=1"));
    }

    public sealed class NoOpScreenshotBlobService : IScreenshotBlobService
    {
        public Task<string> UploadAsync(Stream data, string extension, long ticketId, CancellationToken ct = default)
            => Task.FromResult($"https://example.invalid/shots/{ticketId}{extension}");

        public Task<Uri> GenerateSasUriAsync(string blobUri, TimeSpan validFor, CancellationToken ct = default)
            => Task.FromResult(new Uri(blobUri + "?sas=1"));
    }

    /// <summary>
    /// Records every digest send so tests can assert on recipients and content.
    /// Set <see cref="FailDigests"/> to simulate Comms being down.
    /// </summary>
    public sealed class RecordingNotificationService : ITicketNotificationService
    {
        public List<(string To, string Subject, string Body)> Digests { get; } = new();
        public bool FailDigests { get; set; }

        public Task NotifyTicketReceivedAsync(Ticket ticket, CancellationToken ct = default) => Task.CompletedTask;
        public Task NotifyTicketAssignedToDevAsync(Ticket ticket, string developerEmail, CancellationToken ct = default) => Task.CompletedTask;
        public Task NotifyReporterQuestionAsync(Ticket ticket, string questionText, CancellationToken ct = default) => Task.CompletedTask;
        public Task NotifyReporterInProgressAsync(Ticket ticket, CancellationToken ct = default) => Task.CompletedTask;
        public Task NotifyReporterResolvedAsync(Ticket ticket, CancellationToken ct = default) => Task.CompletedTask;
        public Task NotifyAssigneeChangesRequestedAsync(Ticket ticket, string reason, CancellationToken ct = default) => Task.CompletedTask;
        public Task NotifyReporterNoteAddedAsync(Ticket ticket, string noteContent, string authorName, CancellationToken ct = default) => Task.CompletedTask;

        public Task<bool> SendDigestAsync(string to, string subject, string body, CancellationToken ct = default)
        {
            if (FailDigests) return Task.FromResult(false);
            Digests.Add((to, subject, body));
            return Task.FromResult(true);
        }
    }

    private sealed class NoOpTicketNotificationService : ITicketNotificationService
    {
        public Task NotifyTicketReceivedAsync(Ticket ticket, CancellationToken ct = default) => Task.CompletedTask;
        public Task NotifyTicketAssignedToDevAsync(Ticket ticket, string developerEmail, CancellationToken ct = default) => Task.CompletedTask;
        public Task NotifyReporterQuestionAsync(Ticket ticket, string questionText, CancellationToken ct = default) => Task.CompletedTask;
        public Task NotifyReporterInProgressAsync(Ticket ticket, CancellationToken ct = default) => Task.CompletedTask;
        public Task NotifyReporterResolvedAsync(Ticket ticket, CancellationToken ct = default) => Task.CompletedTask;
        public Task NotifyAssigneeChangesRequestedAsync(Ticket ticket, string reason, CancellationToken ct = default) => Task.CompletedTask;
        public Task NotifyReporterNoteAddedAsync(Ticket ticket, string noteContent, string authorName, CancellationToken ct = default) => Task.CompletedTask;
        public Task<bool> SendDigestAsync(string to, string subject, string body, CancellationToken ct = default) => Task.FromResult(true);
    }
}
