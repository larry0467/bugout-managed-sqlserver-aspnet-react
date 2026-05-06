using System.Text;
using System.Threading.RateLimiting;
using BugsManaged.Api.Data;
using BugsManaged.Api.Jobs;
using BugsManaged.Api.Middleware;
using BugsManaged.Api.Services;
using BugsManaged.Api.Services.Sandbox;
using Hangfire;
using Hangfire.SqlServer;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.RateLimiting;
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
// "WidgetPolicy" — open to any origin because the API key IS the auth.
// Customers embed the widget on their own domains; we can't enumerate them.
// "AdminPolicy" — locked to known origins for the JWT-authenticated dashboard.
var allowedOrigins = (builder.Configuration["BugOutManaged:Cors:AllowedOrigins"] ?? "http://localhost:5173,http://localhost:3000")
    .Split(',', StringSplitOptions.RemoveEmptyEntries);

builder.Services.AddCors(options =>
{
    options.AddPolicy("WidgetPolicy", policy =>
        policy.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader());

    options.AddPolicy("AdminPolicy", policy =>
        policy.WithOrigins(allowedOrigins).AllowAnyMethod().AllowAnyHeader().AllowCredentials());
});

// Services
builder.Services.AddHttpContextAccessor();
// Security audit logger — emits every auth + ticket-state-transition event
// under a dedicated category so SOC 2 audits can pull a clean stream.
builder.Services.AddSingleton<IAuditLogger, AuditLogger>();
builder.Services.AddScoped<IOrgContext, OrgContext>();
builder.Services.AddScoped<JwtService>();
builder.Services.AddScoped<OrganizationService>();
builder.Services.AddScoped<ProjectService>();
builder.Services.AddScoped<AuthService>();
builder.Services.AddScoped<TicketService>();
builder.Services.AddScoped<PerformanceService>();
builder.Services.AddScoped<BillingService>();
builder.Services.AddScoped<DevSeeder>();
builder.Services.AddScoped<SandboxSeeder>();
builder.Services.AddScoped<SandboxResetJob>();
builder.Services.Configure<SandboxOptions>(builder.Configuration.GetSection("Sandbox"));
builder.Services.AddSingleton<IVideoBlobService, VideoBlobService>();
builder.Services.AddHttpClient<NotificationService>();
builder.Services.AddHttpClient<TicketNoteService>();
builder.Services.AddHttpClient<TicketClassifierService>();

// Claude Agent sidecar — typed HTTP client. The C# backend never calls
// Anthropic directly; the Node sidecar at BugsManaged:ClaudeAgentSidecar:Url
// is the only thing that holds the Anthropic API key.
builder.Services.AddHttpClient<IClaudeAgentClient, ClaudeAgentClient>();

// Background worker that drains the ClaudeRuns table. Singleton hosted
// service that creates a scope per poll for DbContext.
builder.Services.AddHostedService<ClaudeRunWorker>();

builder.Services.AddControllers();
builder.Services.AddOpenApi();

// ---- Rate limiting (SOC 2 CC6.6 — boundary protection) -------------------
// Two policies, both partitioned per caller and applied as attributes on the
// hot endpoints:
//
//   * "widget-submit"  — POST /api/tickets (X-BOM-API-Key auth). Partitioned
//                        by API key (the project) so one compromised tenant
//                        can't drown the system. Sliding 60s window, 30 req.
//
//   * "anon-tight"     — anonymous endpoints like /api/auth/login that get
//                        partitioned by remote IP. Tight to slow brute-force
//                        attempts: 10 req per 60s.
//
// Rejections return 429 with a Retry-After header. Documented in
// docs/security/rate-limits.md (created by the same compliance pass that
// added this code).
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.OnRejected = (ctx, _) =>
    {
        ctx.HttpContext.Response.Headers["Retry-After"] = "60";
        return ValueTask.CompletedTask;
    };

    options.AddPolicy("widget-submit", httpContext =>
    {
        var key = httpContext.Request.Headers["X-BOM-API-Key"].FirstOrDefault()
                  ?? httpContext.Connection.RemoteIpAddress?.ToString()
                  ?? "anonymous";
        return RateLimitPartition.GetSlidingWindowLimiter(key, _ => new SlidingWindowRateLimiterOptions
        {
            Window = TimeSpan.FromSeconds(60),
            SegmentsPerWindow = 6,
            PermitLimit = 30,
            QueueLimit = 0,
            QueueProcessingOrder = QueueProcessingOrder.OldestFirst,
            AutoReplenishment = true,
        });
    });

    options.AddPolicy("anon-tight", httpContext =>
    {
        var ip = httpContext.Connection.RemoteIpAddress?.ToString() ?? "anonymous";
        return RateLimitPartition.GetFixedWindowLimiter(ip, _ => new FixedWindowRateLimiterOptions
        {
            Window = TimeSpan.FromSeconds(60),
            PermitLimit = 10,
            QueueLimit = 0,
            QueueProcessingOrder = QueueProcessingOrder.OldestFirst,
            AutoReplenishment = true,
        });
    });
});

// Hangfire — only wired when the sandbox tier is on. The recurring job
// itself is also gated, so even if a future env accidentally turns this
// on without the flag, the job will no-op. Storage shares the app's SQL
// connection but lives in its own schema (`HangFire`) so migrations
// don't collide with EF.
var sandboxEnabled = builder.Configuration.GetValue<bool>("Sandbox:Enabled");
if (sandboxEnabled)
{
    builder.Services.AddHangfire(cfg => cfg
        .SetDataCompatibilityLevel(CompatibilityLevel.Version_180)
        .UseSimpleAssemblyNameTypeSerializer()
        .UseRecommendedSerializerSettings()
        .UseSqlServerStorage(
            builder.Configuration.GetConnectionString("DefaultConnection"),
            new SqlServerStorageOptions
            {
                CommandBatchMaxTimeout = TimeSpan.FromMinutes(5),
                SlidingInvisibilityTimeout = TimeSpan.FromMinutes(5),
                QueuePollInterval = TimeSpan.Zero,
                UseRecommendedIsolationLevel = true,
                DisableGlobalLocks = true,
            }));
    builder.Services.AddHangfireServer();

    // Owner-only auth filter for the /admin/jobs dashboard. JWT cookies
    // aren't a thing here, so we accept the same Bearer token the rest of
    // the admin UI uses (passed via `?access_token=...` for browser nav)
    // OR a logged-in PLATFORM_OWNER on the same origin. v1 is intentionally
    // strict: PLATFORM_OWNER on the request principal, no exceptions.
    builder.Services.AddAuthorization(options =>
    {
        options.AddPolicy("HangfireDashboard", policy =>
            policy.RequireAuthenticatedUser().RequireRole("PLATFORM_OWNER"));
    });
}

var app = builder.Build();

// Apply any pending EF migrations on startup. Replaces the old
// EnsureCreated() path, which didn't handle schema evolution.
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<BugsManagedDbContext>();
    db.Database.Migrate();

    // Idempotent dev seeding: creates a demo org and sample projects with
    // fixed dev API keys so developers can hit the API immediately after
    // cloning without creating accounts.
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

// The IIFE widget is embedded in every consumer app with no version in the
// URL, so we must force revalidation on every request. no-cache means
// "always revalidate with the server" — the browser only re-downloads if
// the ETag/Last-Modified changed, so bandwidth cost is minimal.
app.UseStaticFiles(new StaticFileOptions
{
    OnPrepareResponse = ctx =>
    {
        if (ctx.File.Name.Equals("widget.iife.js", StringComparison.OrdinalIgnoreCase))
        {
            ctx.Context.Response.Headers["Cache-Control"] = "no-cache";
        }
    }
});
app.UseCors("AdminPolicy");
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();

// Must run after UseAuthentication so the JWT is parsed and
// ctx.User.FindFirstValue("organizationId") works for admin calls.
app.UseMiddleware<OrgResolutionMiddleware>();

// Sandbox: dashboard + recurring job. Both are gated by Sandbox:Enabled
// so dev/beta/prod don't pay the SQL polling cost or expose /admin/jobs.
if (sandboxEnabled)
{
    app.UseHangfireDashboard("/admin/jobs", new DashboardOptions
    {
        Authorization = new[] { new HangfireOwnerAuthFilter() },
        DisplayStorageConnectionString = false,
    });

    var sandboxOptions = app.Services.GetRequiredService<Microsoft.Extensions.Options.IOptions<SandboxOptions>>().Value;
    TimeZoneInfo tz;
    try { tz = TimeZoneInfo.FindSystemTimeZoneById(sandboxOptions.TimeZone); }
    catch { tz = TimeZoneInfo.Utc; }

    RecurringJob.AddOrUpdate<SandboxResetJob>(
        "sandbox-reset",
        j => j.RunAsync(),
        sandboxOptions.ResetCron,
        new RecurringJobOptions { TimeZone = tz });
}

app.MapControllers();

app.Run();

// Hangfire dashboard auth — defined as a top-level type at the end of
// Program.cs so it stays colocated with the wiring above.
internal sealed class HangfireOwnerAuthFilter : Hangfire.Dashboard.IDashboardAuthorizationFilter
{
    public bool Authorize(Hangfire.Dashboard.DashboardContext context)
    {
        // Hangfire.AspNetCore exposes the underlying HttpContext via this
        // extension; the abstract DashboardContext is host-agnostic.
        var http = Hangfire.Dashboard.AspNetCoreDashboardContextExtensions.GetHttpContext(context);
        var user = http.User;
        return user.Identity?.IsAuthenticated == true
            && user.IsInRole("PLATFORM_OWNER");
    }
}
