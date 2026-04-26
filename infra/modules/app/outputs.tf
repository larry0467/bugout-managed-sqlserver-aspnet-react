output "resource_group_name" {
  value = azurerm_resource_group.app.name
}

output "uami_id" {
  value = azurerm_user_assigned_identity.app.id
}

output "uami_client_id" {
  description = "Client ID of the app's UAMI. Set this as AZURE_CLIENT_ID_<ENV> in GitHub repo secrets."
  value       = azurerm_user_assigned_identity.app.client_id
}

output "uami_principal_id" {
  value = azurerm_user_assigned_identity.app.principal_id
}

output "container_app_fqdn" {
  description = "Default FQDN of the Container App (used for DNS CNAME until custom domain is wired)."
  value       = azurerm_container_app.app.latest_revision_fqdn
}

output "static_web_app_default_hostname" {
  description = "Default hostname of the Static Web App."
  value       = azurerm_static_web_app.app.default_host_name
}

output "static_web_app_api_key" {
  description = "Deployment API key for the Static Web App. Used by GitHub Actions to push the React build."
  value       = azurerm_static_web_app.app.api_key
  sensitive   = true
}

output "key_vault_id" {
  value = azurerm_key_vault.app.id
}

output "key_vault_uri" {
  value = azurerm_key_vault.app.vault_uri
}

output "sql_database_id" {
  value = azurerm_mssql_database.app.id
}

output "sql_database_name" {
  value = azurerm_mssql_database.app.name
}

output "application_insights_connection_string" {
  value     = azurerm_application_insights.app.connection_string
  sensitive = true
}

output "dns_records" {
  description = "Cloudflare DNS records that should be upserted by sync-dns.ps1."
  value = [
    {
      type  = "CNAME"
      name  = "${var.app_name}-${var.environment}"
      value = azurerm_static_web_app.app.default_host_name
    },
    {
      type  = "CNAME"
      name  = "${var.app_name}-api-${var.environment}"
      value = azurerm_container_app.app.latest_revision_fqdn
    },
  ]
}
