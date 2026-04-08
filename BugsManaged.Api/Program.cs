using System.Text;
using BugsManaged.Api.Data;
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
builder.Services.AddScoped<JwtService>();
builder.Services.AddScoped<OrganizationService>();
builder.Services.AddScoped<ProjectService>();
builder.Services.AddScoped<AuthService>();
builder.Services.AddScoped<TicketService>();
builder.Services.AddHttpClient<NotificationService>();
builder.Services.AddHttpClient<TicketNoteService>();

builder.Services.AddControllers();
builder.Services.AddOpenApi();

var app = builder.Build();

// Auto-migrate database
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<BugsManagedDbContext>();
    db.Database.EnsureCreated();
}

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseCors();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();

app.Run();
