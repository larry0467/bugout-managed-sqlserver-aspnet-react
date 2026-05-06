namespace BugsManaged.Api.Entities;

public class UserProjectAssignment
{
    public long Id { get; set; }
    public long UserId { get; set; }
    public User User { get; set; } = null!;
    public long ProjectId { get; set; }
    public Project Project { get; set; } = null!;
}
