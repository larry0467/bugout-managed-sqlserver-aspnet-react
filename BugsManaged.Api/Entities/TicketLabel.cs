using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace BugsManaged.Api.Entities;

// Per-org label dictionary. A ticket gets labels via TicketLabelAssignment.
// Org-scoped so two orgs can define labels with the same name independently.
[Table("TicketLabels")]
public class TicketLabel
{
    [Key]
    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    public long Id { get; set; }

    public long OrganizationId { get; set; }

    [Required, MaxLength(60)]
    public string Name { get; set; } = string.Empty;

    // Hex like #ff9800. Six-char hex only; the UI maps it directly to a chip
    // background. Keeping it permissive (no enum) so the UI can offer a
    // colour picker without server changes.
    [Required, MaxLength(7)]
    public string Color { get; set; } = "#888888";

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

[Table("TicketLabelAssignments")]
public class TicketLabelAssignment
{
    [Key]
    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    public long Id { get; set; }

    public long OrganizationId { get; set; }
    public long TicketId { get; set; }
    public long LabelId { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
