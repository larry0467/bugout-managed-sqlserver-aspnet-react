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
