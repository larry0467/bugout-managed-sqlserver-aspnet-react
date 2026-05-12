using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace BugsManaged.Api.Entities;

// One file (screenshot/image) attached to either a ticket directly
// (from widget bug report) or a chat note (from in-ticket conversation).
// NoteId is nullable because widget submissions attach directly.
[Table("TicketAttachments")]
public class TicketAttachment
{
    [Key]
    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    public long Id { get; set; }

    public long OrganizationId { get; set; }
    public long TicketId { get; set; }

    public long? NoteId { get; set; }

    [Required, MaxLength(1000)]
    public string BlobUrl { get; set; } = string.Empty;

    [Required, MaxLength(255)]
    public string FileName { get; set; } = string.Empty;

    [MaxLength(100)]
    public string? ContentType { get; set; }

    public long SizeBytes { get; set; }

    [MaxLength(255)]
    public string? UploadedBy { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
