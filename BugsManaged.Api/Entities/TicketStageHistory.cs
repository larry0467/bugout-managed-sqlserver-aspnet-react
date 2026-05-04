using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace BugsManaged.Api.Entities;

// One row per escalation stage transition. Required so the performance
// dashboard can sum up the multiple OWNER_APPROVAL_PENDING and ASSIGNED_HUMAN
// intervals that occur when a ticket bounces back via request-changes.
//
// Every endpoint that mutates Ticket.EscalationStage MUST also append a row
// here in the same SaveChanges call. Same for ClaudeRunWorker's auto-flip.
[Table("TicketStageHistory")]
public class TicketStageHistory
{
    [Key]
    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    public long Id { get; set; }

    public long TicketId { get; set; }

    // Denormalized for tenant scoping + the EF global query filter.
    public long OrganizationId { get; set; }

    // Null on the very first row for a ticket (initial creation transition).
    [MaxLength(50)]
    public string? FromStage { get; set; }

    [Required, MaxLength(50)]
    public string ToStage { get; set; } = string.Empty;

    [MaxLength(255)]
    public string? ChangedBy { get; set; }

    public DateTime ChangedAt { get; set; } = DateTime.UtcNow;

    // Used by request-changes to capture the rejection reason. Owner-side
    // notes only — not part of the customer-facing TicketNote stream.
    public string? Note { get; set; }
}
