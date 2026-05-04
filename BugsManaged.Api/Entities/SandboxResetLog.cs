using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace BugsManaged.Api.Entities;

// Audit row written every time the sandbox tier resets itself. Lets the
// SANDBOX banner in the admin UI render "last reset: Xh ago" without
// inferring it from log scrapes, and gives the platform team a paper trail
// of nightly job runs.
//
// Lives outside the org-scoped query filter — there's only ever one sandbox
// universe at a time and the log is platform-meta, not tenant data.
[Table("SandboxResetLogs")]
public class SandboxResetLog
{
    [Key]
    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    public int Id { get; set; }

    public DateTime OccurredAtUtc { get; set; } = DateTime.UtcNow;

    public int BugsInserted { get; set; }
    public int UsersInserted { get; set; }

    // "scheduler" for the recurring Hangfire job, or the owner email when
    // a human kicked it off via POST /api/admin/sandbox/reset.
    [MaxLength(255)]
    public string? TriggeredBy { get; set; }
}
