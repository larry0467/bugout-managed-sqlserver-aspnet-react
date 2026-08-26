namespace BugsManaged.Api.Services.GoogleChat;

/// <summary>
/// Drains <see cref="GoogleChatQueue"/> on a background thread, one DI scope per
/// job so each gets a fresh DbContext.
///
/// Modelled on ClaudeRunWorker, the existing background pattern in this codebase.
/// One job failing must never stop the loop, so every job is individually
/// wrapped — an unhandled exception in a BackgroundService kills the host.
/// </summary>
public class GoogleChatDispatcher : BackgroundService
{
    private readonly GoogleChatQueue _queue;
    private readonly IServiceScopeFactory _scopes;
    private readonly ILogger<GoogleChatDispatcher> _log;

    public GoogleChatDispatcher(
        GoogleChatQueue queue,
        IServiceScopeFactory scopes,
        ILogger<GoogleChatDispatcher> log)
    {
        _queue = queue;
        _scopes = scopes;
        _log = log;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _log.LogInformation("Google Chat dispatcher started");

        try
        {
            await foreach (var job in _queue.ReadAllAsync(stoppingToken))
            {
                try
                {
                    using var scope = _scopes.CreateScope();
                    var notifier = scope.ServiceProvider.GetRequiredService<GoogleChatNotifier>();
                    await notifier.HandleAsync(job, stoppingToken);
                }
                catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
                {
                    throw;
                }
                catch (Exception ex)
                {
                    _log.LogError(ex, "Google Chat job {Kind} for ticket {TicketId} failed",
                        job.Kind, job.TicketId);
                }
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            // Ordinary shutdown.
        }

        _log.LogInformation("Google Chat dispatcher stopped");
    }
}
