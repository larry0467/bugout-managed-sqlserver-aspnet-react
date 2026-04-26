output "uami_client_id" {
  description = "Set this as AZURE_CLIENT_ID_<ENV> in GitHub repo secrets."
  value       = module.app.uami_client_id
}

output "container_app_fqdn" {
  value = module.app.container_app_fqdn
}

output "static_web_app_default_hostname" {
  value = module.app.static_web_app_default_hostname
}

output "static_web_app_api_key" {
  value     = module.app.static_web_app_api_key
  sensitive = true
}

output "key_vault_uri" {
  value = module.app.key_vault_uri
}

output "sql_database_name" {
  value = module.app.sql_database_name
}

output "dns_records" {
  value = module.app.dns_records
}
