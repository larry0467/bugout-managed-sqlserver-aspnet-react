data "azurerm_client_config" "current" {}

resource "random_string" "kv_suffix" {
  length  = 4
  upper   = false
  special = false
  numeric = true

  keepers = {
    # Recreate only if app_name changes — env changes shouldn't reroll
    app_name = var.app_name
  }
}

locals {
  base_name = "${var.app_name}-${var.environment}"
  tags = merge({
    app         = var.app_name
    environment = var.environment
    managed_by  = "terraform"
  }, var.tags)
}

# -----------------------------------------------------------------------------
# Per-app resource group
# -----------------------------------------------------------------------------

resource "azurerm_resource_group" "app" {
  name     = "rg-${local.base_name}"
  location = var.location
  tags     = local.tags
}

# -----------------------------------------------------------------------------
# User-Assigned Managed Identity — runtime + GitHub OIDC subject
# -----------------------------------------------------------------------------

resource "azurerm_user_assigned_identity" "app" {
  name                = "id-${local.base_name}"
  resource_group_name = azurerm_resource_group.app.name
  location            = var.location
  tags                = local.tags
}

resource "azurerm_federated_identity_credential" "github_branch" {
  # Trusts pushes to the default branch (build jobs that run without an `environment:` block).
  # Only created for dev — higher envs don't get branch-level trust.
  count     = var.environment == "dev" ? 1 : 0
  name      = "github-${var.environment}-branch"
  parent_id = azurerm_user_assigned_identity.app.id
  audience  = ["api://AzureADTokenExchange"]
  issuer    = "https://token.actions.githubusercontent.com"
  subject   = "repo:${var.github_repo}:ref:refs/heads/${var.default_branch}"
}

resource "azurerm_federated_identity_credential" "github_env" {
  # Trusts jobs that target a GitHub Environment matching this env.
  # Required for all envs because the workflow's deploy-* jobs use `environment:`.
  name      = "github-${var.environment}-env"
  parent_id = azurerm_user_assigned_identity.app.id
  audience  = ["api://AzureADTokenExchange"]
  issuer    = "https://token.actions.githubusercontent.com"
  subject   = "repo:${var.github_repo}:environment:${var.environment}"
}

# -----------------------------------------------------------------------------
# SQL Database on the shared SQL Server
# -----------------------------------------------------------------------------

resource "azurerm_mssql_database" "app" {
  name      = var.app_name
  server_id = var.sql_server_id
  collation = "SQL_Latin1_General_CP1_CI_AS"
  # prod, beta, and sandbox all get S1 always-warm. Beta is "internal prod" for
  # MP/Protocall/PIR; sandbox is a customer-facing prod clone with seeded data.
  # Only dev runs serverless GP_S so it scales to zero between feature pushes.
  sku_name    = contains(["prod", "beta", "sandbox"], var.environment) ? "S1" : "GP_S_Gen5_1"
  max_size_gb = contains(["prod", "beta", "sandbox"], var.environment) ? 50 : 5

  # Serverless auto-pause is dev-only — beta, prod, and sandbox stay always-warm
  auto_pause_delay_in_minutes = contains(["prod", "beta", "sandbox"], var.environment) ? -1 : 60
  min_capacity                = contains(["prod", "beta", "sandbox"], var.environment) ? null : 0.5

  tags = local.tags
}

# -----------------------------------------------------------------------------
# Storage Account — video uploads for bug report recordings
# -----------------------------------------------------------------------------

resource "azurerm_storage_account" "videos" {
  name                     = substr("st${replace(var.app_name, "-", "")}${var.environment}${random_string.kv_suffix.result}", 0, 24)
  resource_group_name      = azurerm_resource_group.app.name
  location                 = var.location
  account_tier             = "Standard"
  account_replication_type = "LRS"
  min_tls_version          = "TLS1_2"

  blob_properties {
    delete_retention_policy {
      days = 30
    }

    # Allow browser-side direct blob fetches (SAS video URLs) from all
    # consumer app origins. Without this the browser blocks the fetch even
    # though the SAS token is valid.
    cors_rule {
      allowed_origins = concat(
        [
          "http://localhost:5173",
          "http://localhost:3000",
          "https://bugout.managedplatform.com",
          "https://bugout-${var.environment}.managedplatform.com",
        ],
        var.extra_cors_origins
      )
      allowed_methods    = ["GET", "HEAD"]
      allowed_headers    = ["*"]
      exposed_headers    = ["Content-Length", "Content-Type", "Content-Range"]
      max_age_in_seconds = 3600
    }
  }

  tags = local.tags
}

resource "azurerm_storage_container" "videos" {
  name                  = "videos"
  storage_account_id    = azurerm_storage_account.videos.id
  container_access_type = "private"
}

# UAMI: upload/download blobs
resource "azurerm_role_assignment" "storage_blob_contributor" {
  scope                = azurerm_storage_account.videos.id
  role_definition_name = "Storage Blob Data Contributor"
  principal_id         = azurerm_user_assigned_identity.app.principal_id
}

# UAMI: generate user-delegation SAS tokens (no account key needed)
resource "azurerm_role_assignment" "storage_blob_delegator" {
  scope                = azurerm_storage_account.videos.id
  role_definition_name = "Storage Blob Delegator"
  principal_id         = azurerm_user_assigned_identity.app.principal_id
}

# -----------------------------------------------------------------------------
# Key Vault — per-app secret store
# -----------------------------------------------------------------------------

resource "azurerm_key_vault" "app" {
  # Globally unique with a per-app random suffix to avoid the rare case where
  # `kv-{app}-{env}` is squatted in another tenant.
  name                       = substr("kv-${local.base_name}-${random_string.kv_suffix.result}", 0, 24)
  location                   = var.location
  resource_group_name        = azurerm_resource_group.app.name
  tenant_id                  = data.azurerm_client_config.current.tenant_id
  sku_name                   = "standard"
  soft_delete_retention_days = 7
  purge_protection_enabled   = false
  rbac_authorization_enabled = true
  tags                       = local.tags
}

# Deploying principal needs Officer to write secrets during apply
resource "azurerm_role_assignment" "kv_deployer_officer" {
  scope                = azurerm_key_vault.app.id
  role_definition_name = "Key Vault Secrets Officer"
  principal_id         = data.azurerm_client_config.current.object_id
}

# UAMI gets read-only at runtime
resource "azurerm_role_assignment" "kv_uami_user" {
  scope                = azurerm_key_vault.app.id
  role_definition_name = "Key Vault Secrets User"
  principal_id         = azurerm_user_assigned_identity.app.principal_id
}

resource "azurerm_key_vault_secret" "sql_connection_string" {
  name         = "sql-connection-string"
  key_vault_id = azurerm_key_vault.app.id
  value        = "Server=tcp:${var.sql_server_fqdn},1433;Database=${azurerm_mssql_database.app.name};Authentication=Active Directory Default;Encrypt=True;TrustServerCertificate=False;Connection Timeout=30;"

  depends_on = [azurerm_role_assignment.kv_deployer_officer]
}

resource "azurerm_key_vault_secret" "extra" {
  for_each     = nonsensitive(toset(keys(var.extra_secrets)))
  name         = each.value
  key_vault_id = azurerm_key_vault.app.id
  value        = var.extra_secrets[each.value]

  depends_on = [azurerm_role_assignment.kv_deployer_officer]
}

resource "azurerm_key_vault_secret" "anthropic_api_key" {
  count        = var.anthropic_enabled ? 1 : 0
  name         = "anthropic-api-key"
  key_vault_id = azurerm_key_vault.app.id
  value        = var.anthropic_api_key

  lifecycle {
    # Rotate via 'az keyvault secret set' — TF must not stomp the live value.
    ignore_changes = [value]
  }

  depends_on = [azurerm_role_assignment.kv_deployer_officer]
}

# ---- Claude Agent sidecar secrets ----------------------------------------
# A random per-deploy shared key gates the sidecar's HTTP surface — the
# API attaches it as `X-Claude-Agent-Key` on every call. Random because
# it doesn't need to be human-known: terraform manages it on both sides.
resource "random_password" "sidecar_api_key" {
  count   = var.sidecar_enabled ? 1 : 0
  length  = 48
  special = false
}

resource "azurerm_key_vault_secret" "sidecar_api_key" {
  count        = var.sidecar_enabled ? 1 : 0
  name         = "claude-agent-sidecar-api-key"
  key_vault_id = azurerm_key_vault.app.id
  value        = random_password.sidecar_api_key[0].result

  depends_on = [azurerm_role_assignment.kv_deployer_officer]
}

# GitHub App credentials. Three secrets, all populated externally via
# `az keyvault secret set` after the App is registered on github.com:
#   - github-app-id              : numeric App ID (string)
#   - github-app-installation-id : numeric installation ID (string)
#   - github-app-private-key     : PEM-encoded RSA private key
# Terraform creates the slots with placeholder values; lifecycle ignores
# changes so re-applies don't stomp the live values.
#
# This pattern is required for SOC 2 / enterprise customer security
# review — see project_bugout_always_prod.md for context. The legacy PAT
# path (single github-token secret) was removed; the sidecar still falls
# back to it if env is set, but new tenants should never see a PAT.
resource "azurerm_key_vault_secret" "github_app_id" {
  count        = var.sidecar_enabled ? 1 : 0
  name         = "github-app-id"
  key_vault_id = azurerm_key_vault.app.id
  value        = "placeholder-replace-via-az-keyvault-secret-set"

  lifecycle {
    ignore_changes = [value]
  }

  depends_on = [azurerm_role_assignment.kv_deployer_officer]
}

resource "azurerm_key_vault_secret" "github_app_installation_id" {
  count        = var.sidecar_enabled ? 1 : 0
  name         = "github-app-installation-id"
  key_vault_id = azurerm_key_vault.app.id
  value        = "placeholder-replace-via-az-keyvault-secret-set"

  lifecycle {
    ignore_changes = [value]
  }

  depends_on = [azurerm_role_assignment.kv_deployer_officer]
}

resource "azurerm_key_vault_secret" "github_app_private_key" {
  count        = var.sidecar_enabled ? 1 : 0
  name         = "github-app-private-key"
  key_vault_id = azurerm_key_vault.app.id
  value        = "placeholder-replace-via-az-keyvault-secret-set"

  lifecycle {
    ignore_changes = [value]
  }

  depends_on = [azurerm_role_assignment.kv_deployer_officer]
}

# Legacy PAT fallback — only used pre-GitHub-App-cutover. Once the App is
# wired up and validated, drop this data block + the corresponding env on
# the sidecar container.
#
# Using `data` not `resource` because the secret is populated out of band
# (`az keyvault secret set`) and a managed resource would create a new
# placeholder version on every terraform apply, overwriting the live PAT.
# Caller must ensure the secret exists in KV before terraform plan runs;
# otherwise the data lookup fails. Document this in deploy/README.
data "azurerm_key_vault_secret" "github_token" {
  count        = var.sidecar_enabled ? 1 : 0
  name         = "github-token"
  key_vault_id = azurerm_key_vault.app.id
}

# -----------------------------------------------------------------------------
# Application Insights — workspace-based, points at platform LAW
# -----------------------------------------------------------------------------

resource "azurerm_application_insights" "app" {
  name                = "appi-${local.base_name}"
  location            = var.location
  resource_group_name = azurerm_resource_group.app.name
  workspace_id        = var.log_analytics_workspace_id
  application_type    = "web"
  tags                = local.tags
}

# -----------------------------------------------------------------------------
# Container App — pulls from shared ACR via UAMI, reads secrets from KV
# -----------------------------------------------------------------------------

resource "azurerm_role_assignment" "acr_uami_pull" {
  scope                = var.acr_id
  role_definition_name = "AcrPull"
  principal_id         = azurerm_user_assigned_identity.app.principal_id
}

# Dev UAMI also needs push so GitHub Actions can build+push images
resource "azurerm_role_assignment" "acr_uami_push" {
  count                = var.environment == "dev" ? 1 : 0
  scope                = var.acr_id
  role_definition_name = "AcrPush"
  principal_id         = azurerm_user_assigned_identity.app.principal_id
}

# UAMI needs to read/write the TF state blob via OIDC during GitHub Actions runs
resource "azurerm_role_assignment" "tfstate_uami_blob" {
  count                = var.tfstate_storage_account_id != "" ? 1 : 0
  scope                = var.tfstate_storage_account_id
  role_definition_name = "Storage Blob Data Contributor"
  principal_id         = azurerm_user_assigned_identity.app.principal_id
}

# Contributor on the per-app RG — lets the GH Actions UAMI run terraform apply
resource "azurerm_role_assignment" "rg_uami_contributor" {
  scope                = azurerm_resource_group.app.id
  role_definition_name = "Contributor"
  principal_id         = azurerm_user_assigned_identity.app.principal_id
}

resource "azurerm_container_app" "app" {
  name                         = "ca-${local.base_name}"
  resource_group_name          = azurerm_resource_group.app.name
  container_app_environment_id = var.container_app_environment_id
  revision_mode                = "Single"
  tags                         = local.tags

  identity {
    type         = "UserAssigned"
    identity_ids = [azurerm_user_assigned_identity.app.id]
  }

  registry {
    server   = var.acr_login_server
    identity = azurerm_user_assigned_identity.app.id
  }

  ingress {
    external_enabled = true
    target_port      = 8080
    transport        = "auto"

    traffic_weight {
      latest_revision = true
      percentage      = 100
    }
  }

  template {
    min_replicas = var.container_app_min_replicas
    max_replicas = var.container_app_max_replicas

    container {
      name   = var.app_name
      image  = var.container_image
      cpu    = var.container_app_cpu
      memory = var.container_app_memory

      env {
        name = "ASPNETCORE_ENVIRONMENT"
        # Map to canonical .NET environment names so framework auth, swagger,
        # detailed-errors, etc. flip correctly. `title("dev")` would produce "Dev"
        # which doesn't match `IsDevelopment()` checks in app code.
        value = var.environment == "prod" ? "Production" : "Development"
      }
      env {
        name  = "ASPNETCORE_URLS"
        value = "http://+:8080"
      }
      env {
        name  = "AZURE_CLIENT_ID"
        value = azurerm_user_assigned_identity.app.client_id
      }
      env {
        name  = "ApplicationInsights__ConnectionString"
        value = azurerm_application_insights.app.connection_string
      }
      # The API reads ConnectionStrings:DefaultConnection (not Default).
      # The previous "Default" env var was silently ignored, leaving the app
      # to fall back to appsettings.Development.json which has a LocalDB
      # connection string — crashing the container on Linux.
      env {
        name        = "ConnectionStrings__DefaultConnection"
        secret_name = "sql-connection-string"
      }

      # Allow the SWA frontend on managedplatform.com (per-env subdomains plus
      # the prod apex) to call this API cross-origin. Program.cs reads this key
      # via Configuration["BugOutManaged:Cors:AllowedOrigins"] (comma list).
      env {
        name  = "BugOutManaged__Video__StorageAccountName"
        value = azurerm_storage_account.videos.name
      }
      env {
        name  = "BugOutManaged__Video__ContainerName"
        value = azurerm_storage_container.videos.name
      }
      env {
        name = "BugOutManaged__Cors__AllowedOrigins"
        value = join(",", concat([
          "http://localhost:5173",
          "http://localhost:3000",
          "https://bugout.managedplatform.com",
          "https://bugout-${var.environment}.managedplatform.com",
        ], var.extra_cors_origins))
      }

      dynamic "env" {
        for_each = var.anthropic_enabled ? [1] : []
        content {
          name        = "Anthropic__ApiKey"
          secret_name = "anthropic-api-key"
        }
      }

      # Sidecar shared key — the API attaches this to every /runs call.
      # localhost:7100 is the C# default so no URL override needed.
      dynamic "env" {
        for_each = var.sidecar_enabled ? [1] : []
        content {
          name        = "BugsManaged__ClaudeAgentSidecar__ApiKey"
          secret_name = "claude-agent-sidecar-api-key"
        }
      }
    }

    # Claude Agent sidecar — Node.js, listens on :7100 in the same
    # Container App so localhost wiring just works.
    dynamic "container" {
      for_each = var.sidecar_enabled ? [1] : []
      content {
        name   = "claude-agent"
        image  = var.sidecar_image
        cpu    = 0.25
        memory = "0.5Gi"

        env {
          name  = "PORT"
          value = "7100"
        }
        env {
          name        = "ANTHROPIC_API_KEY"
          secret_name = "anthropic-api-key"
        }
        env {
          name        = "CLAUDE_AGENT_SIDECAR_API_KEY"
          secret_name = "claude-agent-sidecar-api-key"
        }
        # GitHub App credentials. The sidecar mints a fresh 1-hour
        # installation token at the start of each /run call from these.
        # No long-lived PAT in memory — required for SOC 2.
        env {
          name        = "GITHUB_APP_ID"
          secret_name = "github-app-id"
        }
        env {
          name        = "GITHUB_APP_INSTALLATION_ID"
          secret_name = "github-app-installation-id"
        }
        env {
          name        = "GITHUB_APP_PRIVATE_KEY"
          secret_name = "github-app-private-key"
        }
        # Legacy PAT fallback. The sidecar prefers App credentials when
        # present and only reaches for this if all three github-app-*
        # secrets are still placeholders. Used during the pre-IT-security-
        # review interval; remove once the App is live.
        env {
          name        = "GITHUB_TOKEN"
          secret_name = "github-token"
        }
      }
    }

    http_scale_rule {
      name                = "http-scale"
      concurrent_requests = "100"
    }
  }

  secret {
    name                = "sql-connection-string"
    key_vault_secret_id = azurerm_key_vault_secret.sql_connection_string.versionless_id
    identity            = azurerm_user_assigned_identity.app.id
  }

  dynamic "secret" {
    for_each = var.anthropic_enabled ? [1] : []
    content {
      name                = "anthropic-api-key"
      key_vault_secret_id = azurerm_key_vault_secret.anthropic_api_key[0].versionless_id
      identity            = azurerm_user_assigned_identity.app.id
    }
  }

  dynamic "secret" {
    for_each = var.sidecar_enabled ? [1] : []
    content {
      name                = "claude-agent-sidecar-api-key"
      key_vault_secret_id = azurerm_key_vault_secret.sidecar_api_key[0].versionless_id
      identity            = azurerm_user_assigned_identity.app.id
    }
  }

  dynamic "secret" {
    for_each = var.sidecar_enabled ? [1] : []
    content {
      name                = "github-app-id"
      key_vault_secret_id = azurerm_key_vault_secret.github_app_id[0].versionless_id
      identity            = azurerm_user_assigned_identity.app.id
    }
  }

  dynamic "secret" {
    for_each = var.sidecar_enabled ? [1] : []
    content {
      name                = "github-app-installation-id"
      key_vault_secret_id = azurerm_key_vault_secret.github_app_installation_id[0].versionless_id
      identity            = azurerm_user_assigned_identity.app.id
    }
  }

  dynamic "secret" {
    for_each = var.sidecar_enabled ? [1] : []
    content {
      name                = "github-app-private-key"
      key_vault_secret_id = azurerm_key_vault_secret.github_app_private_key[0].versionless_id
      identity            = azurerm_user_assigned_identity.app.id
    }
  }

  dynamic "secret" {
    for_each = var.sidecar_enabled ? [1] : []
    content {
      name                = "github-token"
      key_vault_secret_id = data.azurerm_key_vault_secret.github_token[0].versionless_id
      identity            = azurerm_user_assigned_identity.app.id
    }
  }

  depends_on = [
    azurerm_role_assignment.acr_uami_pull,
    azurerm_role_assignment.kv_uami_user,
  ]
}

# -----------------------------------------------------------------------------
# Static Web App — frontend (Vite build output)
# -----------------------------------------------------------------------------

resource "azurerm_static_web_app" "app" {
  name                = "swa-${local.base_name}"
  resource_group_name = azurerm_resource_group.app.name
  location            = var.location == "eastus2" ? "eastus2" : var.location
  sku_tier            = var.static_web_app_sku
  sku_size            = var.static_web_app_sku
  tags                = local.tags
}
