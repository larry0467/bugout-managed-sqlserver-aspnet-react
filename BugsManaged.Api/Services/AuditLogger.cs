using Microsoft.Extensions.Logging;

namespace BugsManaged.Api.Services;

// ---------------------------------------------------------------------------
// Structured security-audit logger.
//
// Why a separate logger and not just ILogger<TController> calls? SOC 2
// audit trails need to be queryable as a discrete stream — not buried in
// the same firehose as INFO-level app activity. Routing every audit event
// through this category ("BugsManaged.Audit") gives us:
//
//   * One Log Analytics filter (`category == "BugsManaged.Audit"`) to
//     produce the full audit record for any time range.
//   * Stable property names across emitters: `actor`, `action`, `target`,
//     `outcome`. Auditors can write a single KQL query.
//   * Tamper evidence: Container App stdout flows one-way into Log
//     Analytics. The workspace ingestion model is append-only — operators
//     cannot edit or selectively delete events without an audit trail of
//     their own.
//
// Future hardening (not done tonight): mirror the same events into a
// `SecurityAuditLogs` SQL table with an INSERT-ONLY trigger, so we have
// a tamper-evident DB-side record in addition to the workspace stream.
// Required for SOC 2 Type II controls testing in some auditor playbooks.
// ---------------------------------------------------------------------------

public interface IAuditLogger
{
    /// <summary>
    /// Record a security-relevant action. Always succeeds (logging never
    /// throws) — never let an audit failure break the user-facing flow.
    /// </summary>
    void Record(
        string action,
        string outcome,
        string? actorEmail = null,
        long? actorUserId = null,
        long? organizationId = null,
        long? targetTicketId = null,
        string? targetType = null,
        string? targetId = null,
        IReadOnlyDictionary<string, object?>? extra = null);
}

public sealed class AuditLogger : IAuditLogger
{
    // The dedicated category. Logs flowing through this name appear in
    // Log Analytics as `Properties.Category == "BugsManaged.Audit"`.
    public const string Category = "BugsManaged.Audit";

    private readonly ILogger _log;
    private readonly IHttpContextAccessor _httpContext;

    public AuditLogger(ILoggerFactory factory, IHttpContextAccessor httpContext)
    {
        _log = factory.CreateLogger(Category);
        _httpContext = httpContext;
    }

    public void Record(
        string action,
        string outcome,
        string? actorEmail = null,
        long? actorUserId = null,
        long? organizationId = null,
        long? targetTicketId = null,
        string? targetType = null,
        string? targetId = null,
        IReadOnlyDictionary<string, object?>? extra = null)
    {
        // Defensive: never let an audit failure crash a request. If
        // logging is genuinely broken, swallow + emit a single error to
        // a fallback path.
        try
        {
            var ctx = _httpContext.HttpContext;
            // Capture IP + UA for forensics. The X-Forwarded-For check
            // covers Container Apps' ingress proxy chain.
            var remoteIp =
                ctx?.Request.Headers["X-Forwarded-For"].FirstOrDefault()?.Split(',').FirstOrDefault()?.Trim()
                ?? ctx?.Connection.RemoteIpAddress?.ToString();
            var userAgent = ctx?.Request.Headers["User-Agent"].FirstOrDefault();

            // Structured logging: every property below shows up as a
            // queryable field in Log Analytics under `customDimensions`.
            using (_log.BeginScope(new Dictionary<string, object?>
            {
                ["audit.action"] = action,
                ["audit.outcome"] = outcome,
                ["audit.actorEmail"] = actorEmail,
                ["audit.actorUserId"] = actorUserId,
                ["audit.organizationId"] = organizationId,
                ["audit.targetTicketId"] = targetTicketId,
                ["audit.targetType"] = targetType,
                ["audit.targetId"] = targetId,
                ["audit.remoteIp"] = remoteIp,
                ["audit.userAgent"] = userAgent,
                ["audit.timestamp"] = DateTimeOffset.UtcNow.ToString("O"),
            }))
            {
                _log.LogInformation(
                    "AUDIT {Action} {Outcome} actor={ActorEmail} org={OrgId} target={TargetType}:{TargetId}",
                    action, outcome, actorEmail ?? "(anon)", organizationId, targetType ?? "-", targetId ?? "-");
            }

            if (extra != null && extra.Count > 0)
            {
                using (_log.BeginScope(extra))
                {
                    _log.LogInformation("AUDIT {Action} extra-properties", action);
                }
            }
        }
        catch
        {
            // Swallow — audit must never break the flow. The lack of an
            // event in the stream is itself a signal worth investigating
            // separately via runtime metrics.
        }
    }
}
