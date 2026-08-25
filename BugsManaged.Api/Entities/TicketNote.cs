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
    public string Source { get; set; } = "DASHBOARD"; // DASHBOARD, SLACK, GOOGLE_CHAT, EMAIL

    [MaxLength(100)]
    public string? SlackThreadTs { get; set; }

    // Google Chat message resource name ("spaces/AAA/messages/BBB") this comment
    // corresponds to: the message we posted for an app-side comment, or the
    // inbound message an external reply came from. Backed by a unique filtered
    // index, which is what makes a redelivered Chat event idempotent -- Chat
    // retries whenever our acknowledgement is slow or lost.
    [MaxLength(255)]
    public string? GoogleChatMessageName { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
