environment                = "prod"
location                   = "eastus2"
container_app_min_replicas = 2
container_app_max_replicas = 10
static_web_app_sku         = "Standard"

# Anthropic enabled in prod so the Claude developer agent can escalate
# bugs + feature requests. The actual API key lives in
# kv-bugout-prod-{suffix} as the `anthropic-api-key` secret; Terraform
# does NOT manage the value (lifecycle ignore_changes=[value]) — rotate
# via `az keyvault secret set`.
anthropic_enabled = true
anthropic_api_key = "set-via-az-keyvault-secret-set-not-tf"

# Consumer app origins — Bug Out is prod-only so every consumer env
# (including dev/beta subdomains) must be listed here.
extra_cors_origins = [
  "https://voices-dev.managedplatform.com",
  "https://voices.managedplatform.com",
  "https://videos-dev.managedplatform.com",
  "https://videos.managedplatform.com",
  "https://console-dev.managedplatform.com",
  "https://console.managedplatform.com",
  "https://hancock-dev.managedplatform.com",
  "https://hancock.managedplatform.com",
  "https://rx-dev.managedplatform.com",
  "https://rx.managedplatform.com",
  "https://finance-dev.managedplatform.com",
  "https://finance.managedplatform.com",
  "https://freight-dev.managedplatform.com",
  "https://freight.managedplatform.com",
  "https://comms-dev.managedplatform.com",
  "https://comms.managedplatform.com",
  "https://hdd-dev.managedplatform.com",
  "https://hdd.managedplatform.com",
]
