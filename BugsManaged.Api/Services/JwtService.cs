using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using BugsManaged.Api.Entities;
using Microsoft.IdentityModel.Tokens;

namespace BugsManaged.Api.Services;

public class JwtService
{
    private readonly string _secret;
    private readonly long _expirationMs;

    public JwtService(IConfiguration configuration)
    {
        _secret = configuration["BugOutManaged:Jwt:Secret"] ?? "default-secret-change-me-in-production-32chars!";
        _expirationMs = long.Parse(configuration["BugOutManaged:Jwt:ExpirationMs"] ?? "86400000");
    }

    public string GenerateToken(User user)
    {
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_secret));
        var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var claims = new[]
        {
            new Claim(ClaimTypes.Email, user.Email),
            new Claim("userId", user.Id.ToString()),
            new Claim("organizationId", user.OrganizationId.ToString()),
            new Claim(ClaimTypes.Role, user.Role),
            new Claim("fullName", user.FullName)
        };

        var token = new JwtSecurityToken(
            claims: claims,
            expires: DateTime.UtcNow.AddMilliseconds(_expirationMs),
            signingCredentials: credentials
        );

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    public string? GetEmail(string token)
    {
        var principal = ValidateAndGetPrincipal(token);
        return principal?.FindFirst(JwtRegisteredClaimNames.Sub)?.Value
            ?? principal?.FindFirst(ClaimTypes.NameIdentifier)?.Value;
    }

    public long? GetOrganizationId(string token)
    {
        var principal = ValidateAndGetPrincipal(token);
        var orgId = principal?.FindFirst("orgId")?.Value;
        return orgId != null ? long.Parse(orgId) : null;
    }

    public string? GetRole(string token)
    {
        var principal = ValidateAndGetPrincipal(token);
        return principal?.FindFirst("role")?.Value;
    }

    public bool IsValid(string token)
    {
        return ValidateAndGetPrincipal(token) != null;
    }

    private ClaimsPrincipal? ValidateAndGetPrincipal(string token)
    {
        try
        {
            var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_secret));
            var handler = new JwtSecurityTokenHandler();

            var principal = handler.ValidateToken(token, new TokenValidationParameters
            {
                ValidateIssuer = false,
                ValidateAudience = false,
                ValidateLifetime = true,
                ValidateIssuerSigningKey = true,
                IssuerSigningKey = key,
                ClockSkew = TimeSpan.Zero
            }, out _);

            return principal;
        }
        catch
        {
            return null;
        }
    }
}
