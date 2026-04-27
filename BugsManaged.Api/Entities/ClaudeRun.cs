using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace BugsManaged.Api.Entities;

// One row per "assign to Claude" execution attempt. The ClaudeRunWorker
// background service polls this table for PENDING rows, hands them off to
// the Node sidecar over HTTP, and writes the result back here.
//
// Status flow: PENDING -> RUNNING -> SUCCEEDED | FAILED | CAPPED
[Table("ClaudeRuns")]
public class ClaudeRun
{
    [Key]
    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    public long Id { get; set; }

    public long TicketId { get; set; }

    // Denormalized from Ticket.OrganizationId for tenant scoping + the
    // per-tenant daily $100 cap query.
    public long OrganizationId { get; set; }

    [Required, MaxLength(20)]
    public string Status { get; set; } = "PENDING";
    // PENDING, RUNNING, SUCCEEDED, FAILED, CAPPED

    [Required, MaxLength(50)]
    public string Model { get; set; } = "claude-sonnet-4-6";

    public int? TokensIn { get; set; }
    public int? TokensOut { get; set; }

    [Column(TypeName = "decimal(10,4)")]
    public decimal? CostUsd { get; set; }

    public int? DurationMs { get; set; }

    public string? AnalysisMarkdown { get; set; }

    [MaxLength(500)]
    public string? PrUrl { get; set; }

    [MaxLength(200)]
    public string? BranchName { get; set; }

    public string? ErrorMessage { get; set; }

    [MaxLength(255)]
    public string? RequestedBy { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
