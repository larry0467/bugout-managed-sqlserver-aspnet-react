using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace BugsManaged.Api.Entities;

[Table("TicketNotes")]
public class TicketNote
{
    [Key]
    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    public long Id { get; set; }

    public long OrganizationId { get; set; }

    public long TicketId { get; set; }

    [Required, MaxLength(255)]
    public string AuthorEmail { get; set; } = string.Empty;

    [MaxLength(255)]
    public string? AuthorName { get; set; }

    [Required]
    public string Content { get; set; } = string.Empty;

    [Required, MaxLength(50)]
    public string NoteType { get; set; } = "COMMENT"; // COMMENT, QUESTION, INTERNAL

    [Required, MaxLength(50)]
    public string Source { get; set; } = "DASHBOARD"; // DASHBOARD, SLACK

    [MaxLength(100)]
    public string? SlackThreadTs { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
