using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace BugsManaged.Api.Entities;

// Per-org status dictionary. Replaces the previously-hardcoded list
// (OPEN / IN_PROGRESS / ... / CLOSED) so admins can rename / add / reorder
// states. Tickets still carry their status as a plain string (Ticket.Status)
// — this table is the *source of truth for what's allowed* and how it
// renders, but is not joined on for reads (so a status row being deleted
// doesn't orphan tickets — they just fall through to a default chip).
[Table("TicketStatusDefs")]
public class TicketStatusDef
{
    [Key]
    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    public long Id { get; set; }

    public long OrganizationId { get; set; }

    // The stored Ticket.Status string. SCREAMING_SNAKE so existing tickets
    // keep matching after migration. UI label lives in DisplayName.
    [Required, MaxLength(50)]
    public string Key { get; set; } = string.Empty;

    [Required, MaxLength(100)]
    public string DisplayName { get; set; } = string.Empty;

    [Required, MaxLength(7)]
    public string Color { get; set; } = "#888888";

    public int SortOrder { get; set; }

    // "Closed-like" — when true the status is treated as terminal: rows are
    // hidden by the "Show closed" toggle, and the dashboard's "resolved"
    // count includes it. Lets a custom status like "WONT_FIX" behave the
    // way RESOLVED/CLOSED behaved historically.
    public bool IsClosedLike { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
