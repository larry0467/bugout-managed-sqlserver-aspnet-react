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
  name        = var.app_name
  server_id   = var.sql_server_id
  collation   = "SQL_Latin1_General_CP1_CI_AS"
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
      env {
        name        = "ConnectionStrings__Default"
        secret_name = "sql-connection-string"
      }

      # Allow the SWA frontend on managedplatform.com (per-env subdomains plus
      # the prod apex) to call this API cross-origin. Program.cs reads this key
      # via Configuration["BugOutManaged:Cors:AllowedOrigins"] (comma list).
      env {
        name  = "BugOutManaged__Cors__AllowedOrigins"
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
