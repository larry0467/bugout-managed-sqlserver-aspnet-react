using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace BugsManaged.Api.Entities;

// A machine credential for an organization. Created by an org admin in
// Settings, shown once, and presented by non-interactive callers (the Claude
// Code sessions that log development orders) in the X-BOM-Service-Key
// header. Only the hash is stored; the raw key never touches the database
// or the logs.
//
// Service keys are honoured on the /api/development/* routes only - see
// ServiceKeyAuthenticationHandler. Everything else still needs a user JWT.
[Table("ServiceApiKeys")]
public class ServiceApiKey
{
    [Key]
    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    public long Id { get; set; }

    public long OrganizationId { get; set; }

    // Human label, e.g. "Claude Code - devbox". Also the actor name written
    // into activity rows for changes made with this key.
    [Required, MaxLength(100)]
    public string Name { get; set; } = string.Empty;

    // Lower-case hex SHA-256 of the raw key.
    [Required, MaxLength(64)]
    public string KeyHash { get; set; } = string.Empty;

    // First characters of the raw key ("bsk_a1b2c3d4") so the Settings page
    // can tell keys apart without ever showing the key again.
    [Required, MaxLength(16)]
    public string KeyPrefix { get; set; } = string.Empty;

    // Comma-separated scopes. Today: development:read, development:write.
    [Required, MaxLength(500)]
    public string Scopes { get; set; } = "development:write";

    [MaxLength(255)]
    public string? CreatedBy { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public DateTime? LastUsedAt { get; set; }

    public DateTime? RevokedAt { get; set; }

    [MaxLength(255)]
    public string? RevokedBy { get; set; }
}
