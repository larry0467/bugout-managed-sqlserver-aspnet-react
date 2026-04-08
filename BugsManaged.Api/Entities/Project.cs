using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace BugsManaged.Api.Entities;

[Table("Projects")]
public class Project
{
    [Key]
    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    public long Id { get; set; }

    public long? OrganizationId { get; set; }

    [Required, MaxLength(255)]
    public string Name { get; set; } = string.Empty;

    [Required, MaxLength(255)]
    public string Slug { get; set; } = string.Empty;

    [Required, MaxLength(255)]
    public string ApiKey { get; set; } = $"bm_{Guid.NewGuid():N}";

    [MaxLength(500)]
    public string? WebhookUrl { get; set; }

    [MaxLength(500)]
    public string? SlackWebhookUrl { get; set; }

    [MaxLength(255)]
    public string? SlackChannel { get; set; }

    [MaxLength(500)]
    public string? SlackBotToken { get; set; }

    [MaxLength(255)]
    public string? NotificationEmail { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
