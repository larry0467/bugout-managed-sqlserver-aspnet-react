namespace BugsManaged.Api.Services.GoogleChat;

/// <summary>
/// Everything the Google Chat integration needs, bound from the "GoogleChat"
/// configuration section via <c>IOptions&lt;GoogleChatOptions&gt;</c>.
///
/// The service-account key is a secret and must never live in a checked-in
/// appsettings file. Supply it at run time by one of:
///
///   * <see cref="ServiceAccountJson"/> — the downloaded key inline, from an
///     App Service setting or a Key Vault secret. Preferred.
///   * <see cref="ServiceAccountJsonPath"/> — path to the key file on disk,
///     for a mounted secret.
///   * a row in the GoogleServiceAccounts table, which is how this deployment
///     already stores it. Used when neither of the above is set.
///
/// When none of the three resolves, the integration reports itself disabled and
/// every caller falls back to the existing email notification instead of
/// failing — see the "keep email as a fallback" constraint.
/// </summary>
public class GoogleChatOptions
{
    public const string SectionName = "GoogleChat";

    /// <summary>Master off switch, independent of whether credentials exist.</summary>
    public bool Enabled { get; set; } = true;

    /// <summary>Downloaded service-account key, inline. Keep in a secret store.</summary>
    public string? ServiceAccountJson { get; set; }

    /// <summary>Path to the key file, as an alternative to the inline value.</summary>
    public string? ServiceAccountJsonPath { get; set; }

    /// <summary>
    /// The GCP project *number* (not the id). Google signs inbound webhook
    /// requests with a JWT whose audience is this value; without it we cannot
    /// verify that a POST really came from Google, so inbound events are
    /// rejected rather than trusted.
    /// </summary>
    public string? ProjectNumber { get; set; }

    /// <summary>
    /// The exact HTTP endpoint URL configured in the Chat app, e.g.
    /// "https://example.com/api/google-chat/events". Google audiences the inbound
    /// system ID token to this string, so it must match character for character.
    ///
    /// Left empty, the URL is reconstructed from the incoming request — which is
    /// correct when the API is addressed directly, but wrong behind a tunnel or
    /// proxy that rewrites scheme or host. Set it explicitly whenever the public
    /// URL differs from what Kestrel sees.
    /// </summary>
    public string? EventAudience { get; set; }

    // Scopes are per purpose, and a separate token is minted for each, because
    // Chat rejects some app-auth scope combinations on a single token. That is
    // why the ServiceManaged reference builds one client per scope, and why
    // asking chat.bot to do spaces.create returns
    // ACCESS_TOKEN_SCOPE_INSUFFICIENT: chat.bot covers posting as the app but
    // not creating spaces.
    //
    // Defaults reflect the split in the current Chat API: creating spaces and
    // managing membership are app-auth operations (chat.app.*), while posting as
    // the app is still the classic chat.bot scope. All four are configuration so
    // a Workspace on a different footing can be accommodated without a redeploy.

    /// <summary>Scope for spaces.create. chat.bot is NOT sufficient here.</summary>
    public string[] SpaceCreateScopes { get; set; } =
        { "https://www.googleapis.com/auth/chat.app.spaces.create" };

    /// <summary>Scope for spaces.members.create.</summary>
    public string[] MembershipScopes { get; set; } =
        { "https://www.googleapis.com/auth/chat.app.memberships" };

    /// <summary>Scope for spaces.messages.create.</summary>
    public string[] MessageScopes { get; set; } =
        { "https://www.googleapis.com/auth/chat.bot" };

    public string ApiBaseUrl { get; set; } = "https://chat.googleapis.com/v1/";

    /// <summary>
    /// Workspace that owns spaces we create. Required when creating a space
    /// with app authentication.
    /// </summary>
    public string Customer { get; set; } = "customers/my_customer";

    /// <summary>
    /// Our clients are outside our Workspace domain, so spaces are created
    /// permitting external members. A Workspace policy can still forbid it.
    /// </summary>
    public bool ExternalUserAllowed { get; set; } = true;

    /// <summary>
    /// Attempts per call before giving up, for 429 and 5xx responses. Quota is
    /// roughly 3000 writes/min per project and we are nowhere near it; this is
    /// defensive only.
    /// </summary>
    public int MaxAttempts { get; set; } = 4;

    /// <summary>Base delay for exponential backoff between those attempts.</summary>
    public int RetryBaseDelayMs { get; set; } = 400;

    /// <summary>
    /// Prefix applied to space display names outside Production, so a dev run
    /// is never mistaken for a real client conversation in the space list.
    /// </summary>
    public string NonProductionSpacePrefix { get; set; } = "DEV - ";
}
