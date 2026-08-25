using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace BugsManaged.Api.Entities;

[Table("Projects")]
public class Project
{
    [Key]
    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    public long Id { get; set; }

    public long OrganizationId { get; set; }

    [Required, MaxLength(255)]
    public string Name { get; set; } = string.Empty;

    [Required, MaxLength(255)]
    public string Slug { get; set; } = string.Empty;

    [Required, MaxLength(255)]
    public string ApiKey { get; set; } = $"bom_{Guid.NewGuid():N}";

    [MaxLength(500)]
    public string? WebhookUrl { get; set; }

    [MaxLength(500)]
    public string? SlackWebhookUrl { get; set; }

    [MaxLength(255)]
    public string? SlackChannel { get; set; }

    [MaxLength(500)]
    public string? SlackBotToken { get; set; }

    // DEPRECATED, and read by nothing. Google Chat moved from incoming webhooks
    // to a Chat app authenticated with a service account, which addresses Spaces
    // by resource name rather than a per-project webhook URL — see
    // Services/GoogleChat. The write path and the settings form that fed this are
    // both gone; the column stays only so dropping it is a deliberate migration
    // rather than a surprise buried in an unrelated one. Safe to drop.
    [MaxLength(700)]
    public string? GoogleChatWebhookUrl { get; set; }

    [MaxLength(255)]
    public string? NotificationEmail { get; set; }

    // Repo metadata used by the Claude Agent sidecar when "assign to Claude"
    // runs. RepoPath is the absolute fs path on the host that runs the agent;
    // GithubOwner/GithubRepo are used to open a PR back to dev branch.
    [MaxLength(500)]
    public string? RepoPath { get; set; }

    [MaxLength(500)]
    public string? RepoSubpath { get; set; }

    [Required, MaxLength(100)]
    public string DevBranch { get; set; } = "dev";

    [MaxLength(100)]
    public string? GithubOwner { get; set; }

    [MaxLength(100)]
    public string? GithubRepo { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
