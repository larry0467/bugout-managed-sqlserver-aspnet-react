using BugsManaged.Api.Data;
using BugsManaged.Api.Entities;
using Microsoft.EntityFrameworkCore;

namespace BugsManaged.Api.Services;

public class AuthService
{
    private readonly BugsManagedDbContext _db;
    private readonly OrganizationService _organizationService;
    private readonly JwtService _jwtService;

    public AuthService(BugsManagedDbContext db, OrganizationService organizationService, JwtService jwtService)
    {
        _db = db;
        _organizationService = organizationService;
        _jwtService = jwtService;
    }

    public async Task<string> RegisterAsync(string email, string password, string fullName, string orgName)
    {
        if (await _db.Users.AnyAsync(u => u.Email == email))
        {
            throw new InvalidOperationException("A user with this email already exists.");
        }

        var org = await _organizationService.CreateAsync(orgName);

        var user = new User
        {
            Email = email,
            Password = BCrypt.Net.BCrypt.HashPassword(password),
            FullName = fullName,
            OrganizationId = org.Id,
            Role = "SUPER_ADMIN"
        };

        _db.Users.Add(user);
        await _db.SaveChangesAsync();

        return _jwtService.GenerateToken(user);
    }

    public async Task<string> LoginAsync(string email, string password)
    {
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Email == email);

        if (user == null || !BCrypt.Net.BCrypt.Verify(password, user.Password))
        {
            throw new UnauthorizedAccessException("Invalid email or password.");
        }

        return _jwtService.GenerateToken(user);
    }

    public async Task<User?> GetUserByEmailAsync(string email)
    {
        return await _db.Users.FirstOrDefaultAsync(u => u.Email == email);
    }

    public async Task<List<User>> GetUsersByOrganizationAsync(long orgId)
    {
        return await _db.Users
            .Where(u => u.OrganizationId == orgId)
            .OrderBy(u => u.FullName)
            .ToListAsync();
    }
}
