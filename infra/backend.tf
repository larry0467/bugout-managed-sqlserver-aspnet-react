# NOTE: backend config values are passed via -backend-config on `terraform init`
# from bootstrap.ps1. The `key` differs per (app, env): app-{name}-{env}.tfstate
terraform {
  backend "azurerm" {
    use_azuread_auth = true
  }
}
