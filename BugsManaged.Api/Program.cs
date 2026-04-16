using System.Text;
using BugsManaged.Api.Data;
using BugsManaged.Api.Middleware;
using BugsManaged.Api.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);

// Database
builder.Services.AddDbContext<BugsManagedDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("DefaultConnection")));

// JWT Authentication
var jwtSecret = builder.Configuration["BugOutManaged:Jwt:Secret"] ?? "BugOutManaged2026SecretKeyMustBeAtLeast256BitsLong!";
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = false,
            ValidateAudience = false,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSecret))
        };
    });
builder.Services.AddAuthorization();

// CORS
var allowedOrigins = (builder.Configuration["BugOutManaged:Cors:AllowedOrigins"] ?? "http://localhost:5173,http://localhost:3000")
    .Split(',', StringSplitOptions.RemoveEmptyEntries);

builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.WithOrigins(allowedOrigins)
            .AllowAnyMethod()
            .AllowAnyHeader()
            .AllowCredentials();
    });
});

// Services
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<IOrgContext, OrgContext>();
builder.Services.AddScoped<JwtService>();
builder.Services.AddScoped<OrganizationService>();
builder.Services.AddScoped<ProjectService>();
builder.Services.AddScoped<AuthService>();
builder.Services.AddScoped<TicketService>();
builder.Services.AddScoped<DevSeeder>();
builder.Services.AddHttpClient<NotificationService>();
builder.Services.AddHttpClient<TicketNoteService>();
builder.Services.AddHttpClient<TicketClassifierService>();

builder.Services.AddControllers();
builder.Services.AddOpenApi();

var app = builder.Build();

// Apply any pending EF migrations on startup. Replaces the old
// EnsureCreated() path, which didn't handle schema evolution.
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<BugsManagedDbContext>();
    db.Database.Migrate();

    // Idempotent dev seeding: a Managed Platform org + one Project per
    // portfolio app, using the dev API keys the Comms Managed team
    // standardized on so developers get the same localStorage experience
    // across both products.
    if (app.Environment.IsDevelopment())
    {
        var seeder = scope.ServiceProvider.GetRequiredService<DevSeeder>();
        await seeder.SeedAsync();
    }
}

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseCors();
app.UseAuthentication();
app.UseAuthorization();

// Must run after UseAuthentication so the JWT is parsed and
// ctx.User.FindFirstValue("organizationId") works for admin calls.
app.UseMiddleware<OrgResolutionMiddleware>();

app.MapControllers();

app.Run();
