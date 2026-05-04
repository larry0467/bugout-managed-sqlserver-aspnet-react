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

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
