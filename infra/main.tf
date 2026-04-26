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
  container_app_min_replicas = var.container_app_min_replicas
  container_app_max_replicas = var.container_app_max_replicas
  static_web_app_sku         = var.static_web_app_sku
  extra_secrets              = var.extra_secrets
}
