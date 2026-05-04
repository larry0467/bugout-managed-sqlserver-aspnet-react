using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace BugsManaged.Api.Entities;

[Table("Users")]
public class User
{
    [Key]
    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    public long Id { get; set; }

    public long OrganizationId { get; set; }

    [Required, MaxLength(255)]
    public string Email { get; set; } = string.Empty;

    [Required]
    public string Password { get; set; } = string.Empty;

    [Required, MaxLength(255)]
    public string FullName { get; set; } = string.Empty;

    [Required, MaxLength(50)]
    public string Role { get; set; } = "SUPER_ADMIN"; // PLATFORM_OWNER, SUPER_ADMIN, DEVELOPER, VIEWER

    // Only meaningful when Role == "DEVELOPER". Drives the filtered assignment dropdown.
    [MaxLength(20)]
    public string? Specialty { get; set; } // FRONTEND, BACKEND, FULLSTACK

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
