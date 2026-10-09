using BugsManaged.Api.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace BugsManaged.Api.Services;

// Recordings made through Videos Managed arrive on the ticket as a share link
// the moment the reporter stops recording; the transcript does not exist yet
// (Videos Managed transcodes and transcribes in the background). This service
// polls those recordings and copies the captions into Ticket.Transcript so the
// triage card, the digest and a drafted fix all see the same words the in-page
// recorder used to capture live.
public class VideosManagedTranscriptService
{
    // Shown when the recording is ready but carries no speech, so the ticket
    // stops being polled and the reader knows why there is nothing to read.
    public const string NoSpeechTranscript = "(no speech detected in the recording)";

    // How long after the recording we wait before concluding "no speech":
    // Videos Managed usually finishes a short recording in a few minutes.
    public static readonly TimeSpan NoSpeechGrace = TimeSpan.FromMinutes(30);

    private readonly BugsManagedDbContext _db;
    private readonly IVideosManagedClient _videos;
    private readonly ITicketActivityLogger _activity;
    private readonly DevelopmentTrackerOptions _opts;
    private readonly ILogger<VideosManagedTranscriptService> _log;

    public VideosManagedTranscriptService(BugsManagedDbContext db, IVideosManagedClient videos, ITicketActivityLogger activity,
        IOptions<DevelopmentTrackerOptions> opts, ILogger<VideosManagedTranscriptService> log)
    {
        _db = db;
        _videos = videos;
        _activity = activity;
        _opts = opts.Value;
        _log = log;
    }

    // One pass: returns how many tickets got a transcript. Runs without an org
    // context, so every query ignores the tenant filter on purpose.
    public async Task<int> RunOnceAsync(DateTime nowUtc, CancellationToken ct = default, int take = 25)
    {
        var since = nowUtc.AddHours(-Math.Max(1, _opts.TranscriptLookbackHours));
        var pending = await _db.Tickets.IgnoreQueryFilters()
            .Where(t => t.VideosManagedRecordingId != null && t.VideoUrl != null && t.Transcript == null && t.CreatedAt >= since)
            .OrderBy(t => t.CreatedAt)
            .Take(take)
            .ToListAsync(ct);
        if (pending.Count == 0) return 0;

        var filled = 0;
        foreach (var ticket in pending)
        {
            ct.ThrowIfCancellationRequested();
            var rec = await _videos.TryGetRecordingAsync(ticket.VideoUrl!, ct);
            if (rec == null) continue; // still processing, or unreachable: try again next pass

            if (rec.DurationSeconds is > 0 && ticket.VideoDurationSeconds == null)
                ticket.VideoDurationSeconds = rec.DurationSeconds;

            if (!string.IsNullOrWhiteSpace(rec.TranscriptText))
            {
                ticket.Transcript = rec.TranscriptText;
                ticket.UpdatedAt = nowUtc;
                _activity.Log(ticket, "TRANSCRIPT_READY", "Transcript arrived from the Videos Managed recording",
                    ProductionDigestService.SystemActorEmail, ProductionDigestService.SystemActorName,
                    payload: new { recordingId = ticket.VideosManagedRecordingId, durationSeconds = rec.DurationSeconds });
                filled++;
            }
            else if (nowUtc - ticket.CreatedAt > NoSpeechGrace)
            {
                // Ready (the public JSON answered) but no captions after the grace
                // period: there was nothing to transcribe. Stop asking.
                ticket.Transcript = NoSpeechTranscript;
                ticket.UpdatedAt = nowUtc;
                _log.LogInformation("Ticket {TicketId}: Videos Managed recording {RecordingId} has no captions; marked no-speech",
                    ticket.Id, ticket.VideosManagedRecordingId);
            }
        }

        await _db.SaveChangesAsync(ct);
        return filled;
    }
}

public class VideosManagedTranscriptWorker : BackgroundService
{
    private readonly IServiceScopeFactory _scopes;
    private readonly DevelopmentTrackerOptions _opts;
    private readonly ILogger<VideosManagedTranscriptWorker> _log;

    public VideosManagedTranscriptWorker(IServiceScopeFactory scopes, IOptions<DevelopmentTrackerOptions> opts, ILogger<VideosManagedTranscriptWorker> log)
    {
        _scopes = scopes;
        _opts = opts.Value;
        _log = log;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!_opts.TranscriptBackfillEnabled)
        {
            _log.LogInformation("VideosManagedTranscriptWorker disabled (DevelopmentTracker:TranscriptBackfillEnabled=false)");
            return;
        }

        var interval = TimeSpan.FromMinutes(Math.Max(1, _opts.TranscriptPollMinutes));
        _log.LogInformation("VideosManagedTranscriptWorker starting; poll every {Minutes} min", interval.TotalMinutes);

        try { await Task.Delay(TimeSpan.FromSeconds(45), stoppingToken); }
        catch (OperationCanceledException) { return; }

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = _scopes.CreateScope();
                var svc = scope.ServiceProvider.GetRequiredService<VideosManagedTranscriptService>();
                var filled = await svc.RunOnceAsync(DateTime.UtcNow, stoppingToken);
                if (filled > 0) _log.LogInformation("VideosManagedTranscriptWorker filled {Count} transcript(s)", filled);
            }
            catch (OperationCanceledException) { break; }
            catch (Exception ex)
            {
                _log.LogError(ex, "VideosManagedTranscriptWorker poll failed");
            }

            try { await Task.Delay(interval, stoppingToken); }
            catch (OperationCanceledException) { break; }
        }
    }
}
