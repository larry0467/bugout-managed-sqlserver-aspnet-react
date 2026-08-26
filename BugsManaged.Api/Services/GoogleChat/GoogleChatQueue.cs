using System.Threading.Channels;

namespace BugsManaged.Api.Services.GoogleChat;

/// <summary>What a queued Google Chat job should do.</summary>
public enum GoogleChatJobKind
{
    /// <summary>A client filed a ticket: ensure their Space exists, then acknowledge in it.</summary>
    TicketCreated,

    /// <summary>The ticket reached Done/Resolved — the core requirement.</summary>
    TicketResolved,

    /// <summary>A developer commented; mirror it into the client's Space.</summary>
    NoteAdded,

    // There is deliberately no MentionNotice. @-mentions in a comment are an
    // internal signal between teammates, and the only Chat destination we have
    // is the *client's* space — so announcing them there would publish a
    // developer's email and the fact they were pulled in, to the customer.
    // Mentions are notified by email/Slack instead; see
    // TicketNoteController.HandleMentionsAsync.
}

/// <param name="TicketId">Always set — everything is anchored on a ticket.</param>
/// <param name="NoteId">The comment, for NoteAdded.</param>
public record GoogleChatJob(
    GoogleChatJobKind Kind,
    long TicketId,
    long OrganizationId,
    long? NoteId = null);

/// <summary>
/// Hand-off point between the request path and Google Chat. Controllers enqueue
/// and return immediately; <see cref="GoogleChatDispatcher"/> drains this on a
/// background thread. That is the whole point — a Chat API hiccup must never
/// block a ticket update from saving, and none of these calls belongs on a
/// user-facing request.
///
/// An in-memory channel rather than Hangfire: Hangfire is only wired in this
/// codebase when the sandbox tier is enabled, so a Hangfire job would silently
/// stop delivering with Sandbox:Enabled=false. A hosted BackgroundService is
/// always running.
///
/// The trade-off is durability — jobs still in the channel are lost if the
/// process is recycled. That is acceptable for notifications, and the email
/// notification is sent independently so the client is never left with nothing.
/// If at-least-once delivery is wanted later, the upgrade is a DB-backed outbox
/// polled the way ClaudeRunWorker drains ClaudeRuns.
/// </summary>
public class GoogleChatQueue
{
    private readonly Channel<GoogleChatJob> _channel;
    private readonly ILogger<GoogleChatQueue> _log;

    public GoogleChatQueue(ILogger<GoogleChatQueue> log)
    {
        _log = log;

        // Bounded so a Chat outage plus heavy traffic cannot grow unboundedly.
        // DropWrite over Wait deliberately: waiting would push backpressure into
        // the request path, which is exactly what this queue exists to prevent.
        // Full is logged rather than swallowed.
        _channel = Channel.CreateBounded<GoogleChatJob>(new BoundedChannelOptions(1000)
        {
            FullMode = BoundedChannelFullMode.DropWrite,
            SingleReader = true,
        });
    }

    public void Enqueue(GoogleChatJob job)
    {
        if (!_channel.Writer.TryWrite(job))
        {
            _log.LogWarning(
                "Google Chat queue is full — dropped {Kind} for ticket {TicketId}. The email " +
                "notification for this event is unaffected.",
                job.Kind, job.TicketId);
        }
    }

    public IAsyncEnumerable<GoogleChatJob> ReadAllAsync(CancellationToken ct) =>
        _channel.Reader.ReadAllAsync(ct);
}
