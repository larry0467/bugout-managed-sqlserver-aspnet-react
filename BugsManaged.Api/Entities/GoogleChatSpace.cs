using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace BugsManaged.Api.Entities;

// Task 1: the Google Chat Space that belongs to one client.
//
// Per-client rather than per-ticket, which is the documented default: the client
// accepts one invite ever and every later ticket reuses the same Space. A fresh
// Space per ticket would prompt them again on every report.
//
// There is no Client entity in this codebase — a client is identified by the
// email they submit tickets under (Ticket.SubmittedBy) — so the mapping lives in
// its own table keyed on that email rather than as columns on a client row. Also
// scoped by organization, because two tenants can have clients on the same email
// domain and a Space from tenant A must never receive tenant B's tickets.
[Table("GoogleChatSpaces")]
public class GoogleChatSpace
{
    [Key]
    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    public long Id { get; set; }

    public long OrganizationId { get; set; }

    /// <summary>
    /// Full Chat resource name as Google returns it, e.g. "spaces/AAAAxxxxxxx".
    /// Stored whole because that is the form every API call and every inbound
    /// event uses — no prefix juggling.
    /// </summary>
    [Required, MaxLength(200)]
    public string SpaceName { get; set; } = string.Empty;

    /// <summary>
    /// The client's email, used to invite them and to match a ticket to this
    /// Space. Lower-cased on write so the widget, the dashboard and Chat events
    /// all resolve to the same row.
    /// </summary>
    [Required, MaxLength(255)]
    public string MemberEmail { get; set; } = string.Empty;

    [MaxLength(255)]
    public string? DisplayName { get; set; }

    /// <summary>
    /// Whether spaces.members.create succeeded. It can fail independently of
    /// space creation — a Workspace policy blocking external members, most
    /// often — and we retry on the next send rather than losing the Space.
    /// </summary>
    public bool InviteSent { get; set; }

    /// <summary>
    /// When we first received a message from this client in the Space. This is
    /// the only reliable signal that they actually accepted the invite: Chat
    /// sends ADDED_TO_SPACE for the *app* being added, not for a human joining.
    /// Null therefore means "invited, no sign of them yet", which is exactly
    /// what the ticket screen reports.
    /// </summary>
    public DateTime? MemberFirstSeenAt { get; set; }

    /// <summary>The ticket whose creation caused the Space. Audit only.</summary>
    public long? CreatedForTicketId { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? LastMessageAt { get; set; }
}
