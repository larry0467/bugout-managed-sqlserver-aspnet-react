using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace BugsManaged.Api.Entities;

// A branch, pull request, commit or document attached to a development
// order. One order usually carries several: the API PR, the web PR, the
// branch in each repo, and a note such as "stacked on PR 4351".
[Table("TicketDevelopmentLinks")]
public class TicketDevelopmentLink
{
    [Key]
    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    public long Id { get; set; }

    public long TicketId { get; set; }

    // Denormalized for tenant scoping + the EF global query filter.
    public long OrganizationId { get; set; }

    // BRANCH, PR, COMMIT, DOC, VIDEO. Free-form string like the rest of the
    // schema so a new kind is not a migration.
    [Required, MaxLength(20)]
    public string Kind { get; set; } = "PR";

    // Repository the link belongs to, e.g. "ServiceManagerUI" or
    // "ServiceManagedWeb". Optional for DOC links.
    [MaxLength(100)]
    public string? Repo { get; set; }

    // Display text: the branch name, "PR 4347", a commit sha, a doc title.
    [Required, MaxLength(255)]
    public string Name { get; set; } = string.Empty;

    [MaxLength(2000)]
    public string? Url { get; set; }

    [MaxLength(1000)]
    public string? Note { get; set; }

    [MaxLength(255)]
    public string? CreatedBy { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
