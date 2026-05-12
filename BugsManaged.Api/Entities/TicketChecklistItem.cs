using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace BugsManaged.Api.Entities;

[Table("TicketChecklistItems")]
public class TicketChecklistItem
{
    [Key]
    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    public long Id { get; set; }

    public long OrganizationId { get; set; }
    public long TicketId { get; set; }

    [Required, MaxLength(1000)]
    public string Text { get; set; } = string.Empty;

    public bool IsDone { get; set; }

    // SortOrder lets the dashboard render items in user-set order without
    // a second join. We renumber on reorder, so the values are dense ints
    // (0,1,2,...) per ticket.
    public int SortOrder { get; set; }

    [MaxLength(255)]
    public string? CreatedBy { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [MaxLength(255)]
    public string? DoneBy { get; set; }

    public DateTime? DoneAt { get; set; }
}
