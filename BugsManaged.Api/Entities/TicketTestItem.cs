using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace BugsManaged.Api.Entities;

// One line of a development order's test checklist: what the tester does,
// what they should see, and where it can be tried. Written by the session
// that built the order (or on the board); the tester records Pass / Fail.
// Separate from TicketChecklistItem, the bug board's plain to-do list.
[Table("TicketTestItems")]
public class TicketTestItem
{
    [Key]
    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    public long Id { get; set; }

    public long OrganizationId { get; set; }
    public long TicketId { get; set; }

    // What to do: "On WO 90001 open Estimates and click Draft with AI".
    [Required, MaxLength(1000)]
    public string Text { get; set; } = string.Empty;

    // What the tester should see when it works.
    [MaxLength(1000)]
    public string? Expected { get; set; }

    // Where this can be tested: one of DevelopmentTests.Environments
    // (ANY, LOCAL, DEV, BETA).
    [Required, MaxLength(20)]
    public string Environment { get; set; } = "ANY";

    // Dense 0..N-1 per ticket, renumbered on reorder.
    public int SortOrder { get; set; }

    // Latest result: null = not tested yet, PASS or FAIL. A new test round
    // (e.g. local passed, now beta) clears them; the activity feed keeps the old ones.
    [MaxLength(20)]
    public string? Result { get; set; }

    [MaxLength(2000)]
    public string? ResultNote { get; set; }

    // Where the result was recorded (LOCAL, DEV, BETA).
    [MaxLength(20)]
    public string? TestedIn { get; set; }

    [MaxLength(255)]
    public string? TestedBy { get; set; }

    public DateTime? TestedAt { get; set; }

    [MaxLength(255)]
    public string? CreatedBy { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
