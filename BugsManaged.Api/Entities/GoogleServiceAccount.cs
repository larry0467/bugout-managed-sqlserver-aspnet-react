using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace BugsManaged.Api.Entities;

// The secret half of a Google service-account key, per organization.
//
// GoogleChatOptions.ServiceAccountJson (from Key Vault / an App Service setting)
// is the preferred source and takes precedence. This table exists because that
// is how the credential is already stored in this deployment, and column names
// match the GoogleServiceAccounts table in ServiceManaged so a row copies across
// unchanged. Either way the key is never in source control, which is the
// constraint that matters.
//
// The five constant fields of a key (type, auth_uri, token_uri,
// auth_provider_x509_cert_url, universe_domain) are not stored here — they are
// identical for every Google project and come from the "GoogleServiceAccount"
// config section.
[Table("GoogleServiceAccounts")]
public class GoogleServiceAccount
{
    [Key]
    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    public long Id { get; set; }

    /// <summary>
    /// Null means "use for any organization that has no row of its own" — the
    /// shape a single-tenant install wants. A row naming an organization wins
    /// over it for that organization.
    /// </summary>
    public long? OrganizationId { get; set; }

    /// <summary>
    /// Google Cloud project id (e.g. "gcsm-protocall-485607-d4"), not a Bug Out
    /// project. Named to match the source table; the key field is project_id.
    /// </summary>
    [Required, MaxLength(255)]
    public string ProjectId { get; set; } = string.Empty;

    /// <summary>
    /// The Google Cloud project *number* (all digits, e.g. "123456789012") — a
    /// different value from <see cref="ProjectId"/>, and not present in a
    /// downloaded key file, so it has to be recorded separately.
    ///
    /// Google signs every inbound Chat request with a JWT audienced to this, so
    /// it is what proves a POST to /api/google-chat/events really came from
    /// Google. Kept here rather than only in config so a tenant on its own Cloud
    /// project can be added without a redeploy;
    /// GoogleChat:ProjectNumber still works as a deployment-wide fallback.
    /// </summary>
    [MaxLength(32)]
    public string? ProjectNumber { get; set; }

    [Required, MaxLength(255)]
    public string PrivateKeyId { get; set; } = string.Empty;

    /// <summary>
    /// PEM block, holding either real newlines or the literal two-character \n
    /// escapes that come out of the downloaded JSON key. Normalised before use —
    /// Google rejects the PEM if the escapes are left in.
    /// </summary>
    [Required]
    public string PrivateKey { get; set; } = string.Empty;

    [Required, MaxLength(255)]
    public string ClientEmail { get; set; } = string.Empty;

    [Required, MaxLength(100)]
    public string ClientId { get; set; } = string.Empty;

    [MaxLength(700)]
    public string? ClientX509CertUrl { get; set; }

    /// <summary>
    /// Lets a key be rotated by inserting the new row and flipping the old one
    /// off, keeping a record of which key was live when.
    /// </summary>
    public bool IsActive { get; set; } = true;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
