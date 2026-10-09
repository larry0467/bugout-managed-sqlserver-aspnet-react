using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace BugsManaged.Api.Entities;

[Table("Tickets")]
public class Ticket
{
    [Key]
    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    public long Id { get; set; }

    // Denormalized from Project.OrganizationId so every tenant-scoped query
    // (including the EF global query filter) can run against a single column
    // without joining. Must match Project.OrganizationId; enforced at the
    // service layer on create.
    public long OrganizationId { get; set; }

    public long ProjectId { get; set; }

    [MaxLength(255)]
    public string? SubmittedBy { get; set; }

    [Required, MaxLength(50)]
    public string TicketType { get; set; } = "BUG"; // BUG, FEATURE_REQUEST, QUESTION

    [Required, MaxLength(500)]
    public string Title { get; set; } = string.Empty;

    public string? Description { get; set; }

    [Required, MaxLength(50)]
    public string Priority { get; set; } = "MEDIUM"; // CRITICAL, HIGH, MEDIUM, LOW

    [Required, MaxLength(50)]
    public string Status { get; set; } = "OPEN"; // OPEN, IN_PROGRESS, IN_REVIEW, READY_FOR_TESTING, VERIFIED, RESOLVED, CLOSED

    [MaxLength(2000)]
    public string? CurrentPageUrl { get; set; }

    [MaxLength(500)]
    public string? CurrentPageName { get; set; }

    [MaxLength(500)]
    public string? BrowserInfo { get; set; }

    public int? ScreenWidth { get; set; }
    public int? ScreenHeight { get; set; }

    public string? ConsoleErrors { get; set; }
    public string? NetworkErrors { get; set; }
    public string? Transcript { get; set; }

    [MaxLength(500)]
    public string? VideoUrl { get; set; }

    public long? VideoSizeBytes { get; set; }
    public int? VideoDurationSeconds { get; set; }

    [Required, MaxLength(50)]
    public string Visibility { get; set; } = "TENANT"; // TENANT, PLATFORM

    // Multi-tenant context
    [MaxLength(255)]
    public string? TenantId { get; set; }

    [MaxLength(255)]
    public string? TenantName { get; set; }

    [MaxLength(255)]
    public string? DatabaseName { get; set; }

    [MaxLength(100)]
    public string? ApplicationVersion { get; set; }

    [MaxLength(50)]
    public string? Environment { get; set; } // PRODUCTION, STAGING, DEVELOPMENT

    [MaxLength(50)]
    public string? DeveloperCategory { get; set; } // UI, UX, FRONTEND, BACKEND, FULLSTACK, DEVOPS, DATABASE, MOBILE, QA, SECURITY, API, DATA_ENGINEERING, INFRASTRUCTURE

    [MaxLength(255)]
    public string? AssignedTo { get; set; }

    public string? Resolution { get; set; }

    [MaxLength(255)]
    public string? EscalatedBy { get; set; }

    public DateTime? EscalatedAt { get; set; }
    public DateTime? ResolvedAt { get; set; }

    // Tiered escalation chain. New tickets default to SUPER_ADMIN_REVIEW
    // (auto-routed to subscriber's super admin). The super admin can escalate
    // to the platform owner, who in turn assigns to either a HUMAN developer
    // or to CLAUDE (the AI sidecar). The dev (human or Claude) submits work
    // back for owner approval, which closes the loop with COMPLETED — or
    // bounces back to ASSIGNED_HUMAN via request-changes.
    [Required, MaxLength(50)]
    public string EscalationStage { get; set; } = "SUPER_ADMIN_REVIEW";
    // NONE, SUPER_ADMIN_REVIEW, PLATFORM_OWNER_REVIEW, ASSIGNED_HUMAN,
    // ASSIGNED_CLAUDE, OWNER_APPROVAL_PENDING, COMPLETED

    [MaxLength(20)]
    public string? AssigneeType { get; set; } // HUMAN, CLAUDE

    public DateTime? EscalatedToOwnerAt { get; set; }

    [MaxLength(255)]
    public string? EscalatedToOwnerBy { get; set; }

    public DateTime? AssignedAt { get; set; }

    [MaxLength(255)]
    public string? AssignedBy { get; set; }

    // Owner-approval loop. Set when a developer (human or Claude) submits
    // their work for owner review. Cleared on request-changes so the dev's
    // SLA clock restarts cleanly.
    public DateTime? SubmittedForApprovalAt { get; set; }

    [MaxLength(255)]
    public string? SubmittedForApprovalBy { get; set; }

    public DateTime? ApprovedAt { get; set; }

    [MaxLength(255)]
    public string? ApprovedBy { get; set; }

    // Number of times the owner bounced this ticket back to the dev with
    // request-changes. Used by the performance dashboard to compute a
    // developer's revision rate.
    public int RevisionCount { get; set; } = 0;

    // Optional target date for the ticket. Drives the calendar view and the
    // "overdue glow" on the Kanban card. Null = no due date.
    public DateTime? DueDate { get; set; }

    // ===== Development orders (the cross-app development tracker) =====
    // A development order is an ordinary FEATURE_REQUEST ticket with this
    // bit set, so the bug board and the Development board share one table,
    // one activity feed and one set of notes. Everything below is null for
    // plain bug reports. See Controllers/DevelopmentController.cs.
    public bool IsDevelopmentOrder { get; set; } = false;

    // One of DevelopmentStages.All: ORDERED, IN_PROGRESS, LOCAL_DEMO,
    // PR_OPEN, MERGED_DEV, BETA, PRODUCTION, ANNOUNCED. Transitions are
    // appended to TicketStageHistory and TicketActivity (DEV_STAGE_CHANGED).
    [MaxLength(50)]
    public string? DevelopmentStage { get; set; }

    // Link to the Claude Code session's markdown log (OneDrive share link or
    // a file: path) so a later session can pick the item up where it stopped.
    [MaxLength(2000)]
    public string? SessionLogUrl { get; set; }

    [MaxLength(100)]
    public string? SessionId { get; set; }

    // Stamped the first time the stage becomes PRODUCTION. Drives the daily
    // "what shipped today" digest and the production-date column.
    public DateTime? ProductionAt { get; set; }

    // The short "what shipped" video Larry records for the team after an
    // item reaches production. Setting it on a PRODUCTION item moves the
    // stage to ANNOUNCED.
    [MaxLength(2000)]
    public string? AnnouncementVideoUrl { get; set; }

    public DateTime? AnnouncedAt { get; set; }

    // When the production digest that listed this item was sent. Null until
    // then; the digest query is "ProductionAt set, DigestSentAt null".
    public DateTime? DigestSentAt { get; set; }

    // How a tester knows the order did what was asked: the expected outcome,
    // the screens to open, the data to use. Shown on the board and copied into
    // PR descriptions by sessions.
    public string? TestingNotes { get; set; }

    // ===== Drafted-fix queue (Claude Code on the devbox) =====
    // One of FixStatuses: REQUESTED, CLAIMED, READY_TO_TEST, FAILED, APPROVED,
    // REJECTED. Null for tickets nobody asked a fix for. Set automatically on
    // arrival when the app has Project.AutoDraftFixes, or by "Request fix".
    [MaxLength(30)]
    public string? FixStatus { get; set; }

    public DateTime? FixRequestedAt { get; set; }

    public DateTime? FixClaimedAt { get; set; }

    // Which worker claimed it ("devbox" + session id), so a stale claim can be
    // released and a second dispatcher never doubles the work.
    [MaxLength(255)]
    public string? FixClaimedBy { get; set; }

    public DateTime? FixCompletedAt { get; set; }

    // The worker's analysis / result markdown (also posted as an internal note).
    public string? FixSummary { get; set; }

    // Why a fix was rejected; fed back into the prompt when it is re-queued.
    public string? FixFeedback { get; set; }

    // ===== Triage: a human watches the video and decides =====
    // One of TriageDecisions: DEVELOP (send to Claude), RERECORD (needs a
    // better video first), USER_ERROR (works as designed; retrain the user),
    // DECLINED (not doing this). Nothing is drafted before this.
    [MaxLength(30)]
    public string? TriageDecision { get; set; }

    [MaxLength(255)]
    public string? TriagedBy { get; set; }

    public DateTime? TriagedAt { get; set; }

    // A second Videos Managed recording explaining how the thing should
    // actually work (Larry or a developer re-recording the ask). Its captions
    // are stored so the drafting run reads the intent, not just the bug.
    [MaxLength(2000)]
    public string? GuidanceVideoUrl { get; set; }

    public string? GuidanceTranscript { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
