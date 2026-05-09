# Pull platform outputs from remote state — gives us the shared CAE, ACR, SQL Server, LAW
data "terraform_remote_state" "platform" {
  backend = "azurerm"
  config = {
    resource_group_name  = var.platform_state_resource_group
    storage_account_name = var.platform_state_storage_account
    container_name       = var.platform_state_container
    key                  = "platform-${var.environment}.tfstate"
    use_azuread_auth     = true
  }
}

# ---------------------------------------------------------------------------
# Import blocks — absorb KV secrets that were created manually before
# Terraform managed them. Safe to leave in place: once imported, subsequent
# applies treat these as no-ops.
# ---------------------------------------------------------------------------
import {
  to = module.app.azurerm_key_vault_secret.comms_managed_api_key[0]
  id = "https://kv-bugout-prod-ti8i.vault.azure.net/secrets/comms-managed-api-key/741d0c1396c9498ebc3ef3fa62784955"
}
import {
  to = module.app.azurerm_key_vault_secret.comms_managed_workspace_id[0]
  id = "https://kv-bugout-prod-ti8i.vault.azure.net/secrets/comms-managed-workspace-id/b8d7ee8da38146a090db246ca57bfabf"
}
import {
  to = module.app.azurerm_key_vault_secret.comms_managed_system_sender_user_id[0]
  id = "https://kv-bugout-prod-ti8i.vault.azure.net/secrets/comms-managed-system-sender-user-id/a7474af2d0d44cbba1f005b47a640673"
}
import {
  to = module.app.azurerm_key_vault_secret.comms_managed_webhook_secret[0]
  id = "https://kv-bugout-prod-ti8i.vault.azure.net/secrets/comms-managed-webhook-secret/5507f5084b2b4f65b9aab2b8ca35fc56"
}

module "app" {
  source = "./modules/app"

  app_name       = var.app_name
  environment    = var.environment
  location       = var.location
  github_repo    = var.github_repo
  default_branch = var.default_branch

  # Inputs from platform remote state
  platform_resource_group_name = data.terraform_remote_state.platform.outputs.resource_groups[var.location]
  container_app_environment_id = data.terraform_remote_state.platform.outputs.container_app_environment_ids[var.location]
  log_analytics_workspace_id   = data.terraform_remote_state.platform.outputs.log_analytics_workspace_ids[var.location]
  sql_server_id                = data.terraform_remote_state.platform.outputs.sql_server_id
  sql_server_fqdn              = data.terraform_remote_state.platform.outputs.sql_server_fqdn
  acr_id                       = data.terraform_remote_state.platform.outputs.acr_id
  acr_login_server             = data.terraform_remote_state.platform.outputs.acr_login_server

  container_image            = var.container_image
  sidecar_image              = var.sidecar_image
  sidecar_enabled            = var.anthropic_enabled
  container_app_min_replicas = var.container_app_min_replicas
  container_app_max_replicas = var.container_app_max_replicas
  static_web_app_sku         = var.static_web_app_sku
  extra_secrets              = var.extra_secrets
  extra_cors_origins         = var.extra_cors_origins
  anthropic_enabled          = var.anthropic_enabled
  anthropic_api_key          = var.anthropic_api_key
  comms_managed_enabled      = var.comms_managed_enabled
}
