using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace BugsManaged.Api.Entities;

// Human-readable Trello-style activity feed entry. Different from
// TicketStageHistory: that one is structured stage-transition audit
// (used by the performance dashboard's interval math). TicketActivity
// is the freeform "Larry moved to IN_PROGRESS / Tom added screenshot.png"
// log shown in the ticket detail tab.
[Table("TicketActivities")]
public class TicketActivity
{
    [Key]
    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    public long Id { get; set; }

    public long OrganizationId { get; set; }
    public long TicketId { get; set; }

    [MaxLength(255)]
    public string? ActorEmail { get; set; }

    [MaxLength(255)]
    public string? ActorName { get; set; }

    // Short kind tag — clients can filter on this. Free-form to keep
    // adding new kinds cheap (no enum migration each time).
    // Examples: STATUS_CHANGED, ASSIGNED, LABEL_ADDED, LABEL_REMOVED,
    // CHECKLIST_ADDED, CHECKLIST_COMPLETED, DUE_DATE_SET, MENTIONED,
    // SCREENSHOT_ADDED, NOTE_ADDED, STAGE_CHANGED.
    [Required, MaxLength(50)]
    public string Kind { get; set; } = string.Empty;

    [Required, MaxLength(1000)]
    public string Message { get; set; } = string.Empty;

    // Optional JSON blob for structured details (mentioned user email,
    // label id+name, before/after status, etc.). Renderer can ignore it.
    public string? PayloadJson { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
