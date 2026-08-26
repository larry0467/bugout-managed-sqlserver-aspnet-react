/*
  Seeds the Google service account that lets Bug Out create Chat Spaces and post
  as the Chat app. Run against the Bug Out database (bugout_managed).

  This is the alternative to GoogleChat:ServiceAccountJson — use whichever suits
  the deployment. Either way the key stays out of source control, which is the
  constraint that matters. Config takes precedence when both are present.

  Only the secret half lives here. The five constant fields of a key (type,
  auth_uri, token_uri, auth_provider_x509_cert_url, universe_domain) come from
  the "GoogleServiceAccount" section of appsettings, because they are identical
  for every Google project.

  Never commit a filled-in copy of this file.

  ── PrivateKey ──────────────────────────────────────────────────────────────
  Paste it exactly as it appears in the downloaded JSON key, i.e. one line with
  literal \n escape sequences:

      -----BEGIN PRIVATE KEY-----\nMIIEvQ...\n-----END PRIVATE KEY-----\n

  SQL Server stores backslash-n verbatim (it has no escape processing), and the
  API un-escapes it before handing the key to Google. A real multi-line PEM also
  works — both forms are accepted.

  ── OrganizationId ──────────────────────────────────────────────────────────
  NULL means "use this account for every organization", which is what a
  single-tenant install wants. Set it to a specific Organizations.Id only when
  that tenant needs its own Google Cloud project; such a row takes precedence
  over the NULL default for that organization.
*/

DECLARE @OrganizationId    BIGINT        = NULL;                 -- NULL = shared default
DECLARE @ProjectId         NVARCHAR(255) = N'$(GcpProjectId)';   -- e.g. bugout-chat-123456
DECLARE @PrivateKeyId      NVARCHAR(255) = N'$(PrivateKeyId)';
DECLARE @PrivateKey        NVARCHAR(MAX) = N'$(PrivateKey)';     -- see note above
DECLARE @ClientEmail       NVARCHAR(255) = N'$(ClientEmail)';    -- ...iam.gserviceaccount.com
DECLARE @ClientId          NVARCHAR(100) = N'$(ClientId)';
DECLARE @ClientX509CertUrl NVARCHAR(700) = N'$(ClientX509CertUrl)';
DECLARE @ProjectNumber      NVARCHAR(32)  = N'$(ProjectNumber)';    -- all digits; see note below

SET NOCOUNT ON;

BEGIN TRANSACTION;

-- Rotating a key: retire whatever this organization was using rather than
-- deleting it, so it stays clear which key was live when.
UPDATE GoogleServiceAccounts
SET IsActive = 0,
    UpdatedAt = SYSUTCDATETIME()
WHERE IsActive = 1
  AND ((@OrganizationId IS NULL AND OrganizationId IS NULL)
    OR OrganizationId = @OrganizationId);

INSERT INTO GoogleServiceAccounts
    (OrganizationId, ProjectId, ProjectNumber, PrivateKeyId, PrivateKey, ClientEmail, ClientId,
     ClientX509CertUrl, IsActive, CreatedAt, UpdatedAt)
VALUES
    (@OrganizationId, @ProjectId, @ProjectNumber, @PrivateKeyId, @PrivateKey, @ClientEmail, @ClientId,
     @ClientX509CertUrl, 1, SYSUTCDATETIME(), SYSUTCDATETIME());

COMMIT TRANSACTION;

-- Confirm what is now live, without printing the key.
SELECT Id,
       OrganizationId,
       ProjectId,
       ProjectNumber,
       ClientEmail,
       PrivateKeyId,
       LEN(PrivateKey) AS PrivateKeyLength,
       IsActive,
       CreatedAt
FROM GoogleServiceAccounts
WHERE IsActive = 1;
