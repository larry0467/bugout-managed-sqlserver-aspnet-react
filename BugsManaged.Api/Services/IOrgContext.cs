namespace BugsManaged.Api.Services;

// Carries the "who is making this request" identity through a request.
// Set by OrgResolutionMiddleware on every /api/** call, read by the EF
// global query filters in BugsManagedDbContext and by controllers that
// need the current org without parsing the JWT themselves.
//
// Two paths populate it:
//   1. JWT-authenticated admin calls -> OrganizationId from the token claim
//   2. Widget calls with X-BOM-API-Key -> OrganizationId looked up from
//      the Project row, plus CurrentProjectId / CurrentProjectName so the
//      UI can show which host app a ticket came from
public interface IOrgContext
{
    long? CurrentOrganizationId { get; }
    long? CurrentProjectId { get; }
    string? CurrentProjectName { get; }

    void SetOrganization(long organizationId);
    void SetProject(long projectId, string projectName, long organizationId);
}

public class OrgContext : IOrgContext
{
    // AsyncLocal slots so background / hosted-service code can temporarily
    // impersonate a tenant the same way a request does. Matches the pattern
    // Comms Managed uses for its TenantProvider.
    private static readonly AsyncLocal<long?> _orgSlot = new();
    private static readonly AsyncLocal<long?> _projectSlot = new();
    private static readonly AsyncLocal<string?> _projectNameSlot = new();

    private readonly IHttpContextAccessor _http;
    public OrgContext(IHttpContextAccessor http) => _http = http;

    public long? CurrentOrganizationId
    {
        get
        {
            if (_http.HttpContext?.Items.TryGetValue("CurrentOrgId", out var v) == true && v is long g)
                return g;
            return _orgSlot.Value;
        }
    }

    public long? CurrentProjectId
    {
        get
        {
            if (_http.HttpContext?.Items.TryGetValue("CurrentProjectId", out var v) == true && v is long g)
                return g;
            return _projectSlot.Value;
        }
    }

    public string? CurrentProjectName
    {
        get
        {
            if (_http.HttpContext?.Items.TryGetValue("CurrentProjectName", out var v) == true && v is string s)
                return s;
            return _projectNameSlot.Value;
        }
    }

    public void SetOrganization(long organizationId)
    {
        _orgSlot.Value = organizationId;
        if (_http.HttpContext != null)
            _http.HttpContext.Items["CurrentOrgId"] = organizationId;
    }

    public void SetProject(long projectId, string projectName, long organizationId)
    {
        _orgSlot.Value = organizationId;
        _projectSlot.Value = projectId;
        _projectNameSlot.Value = projectName;
        if (_http.HttpContext != null)
        {
            _http.HttpContext.Items["CurrentOrgId"] = organizationId;
            _http.HttpContext.Items["CurrentProjectId"] = projectId;
            _http.HttpContext.Items["CurrentProjectName"] = projectName;
        }
    }
}
