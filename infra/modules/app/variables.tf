variable "app_name" {
  description = "Short app slug (lowercase, no spaces). Used in resource names. Example: hancock."
  type        = string
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,15}$", var.app_name))
    error_message = "app_name must be 2-16 chars, lowercase alphanum/dashes, starting with a letter."
  }
}

variable "environment" {
  description = "Deployment environment: dev, demo, beta, prod."
  type        = string
}

variable "location" {
  description = "Primary Azure region for app resources."
  type        = string
}

variable "platform_resource_group_name" {
  description = "RG that holds the shared platform resources (CAE, SQL Server, etc.) in this region."
  type        = string
}

variable "container_app_environment_id" {
  description = "ID of the shared Container Apps Environment in this region."
  type        = string
}

variable "log_analytics_workspace_id" {
  description = "ID of the shared Log Analytics workspace in this region."
  type        = string
}

variable "sql_server_id" {
  description = "ID of the shared SQL Server (lean tier)."
  type        = string
}

variable "sql_server_fqdn" {
  description = "FQDN of the shared SQL Server."
  type        = string
}

variable "acr_id" {
  description = "ID of the shared ACR."
  type        = string
}

variable "acr_login_server" {
  description = "Login server FQDN of the shared ACR (e.g. acrmpshared.azurecr.io)."
  type        = string
}

variable "container_image" {
  description = "Full image reference to deploy (e.g. acrmpshared.azurecr.io/hancock:abc123). Pass placeholder during bootstrap."
  type        = string
  default     = "mcr.microsoft.com/k8se/quickstart:latest"
}

variable "container_app_min_replicas" {
  description = "Minimum container app replicas. 0 = scale to zero (lean envs); 2+ = always-warm (prod)."
  type        = number
  default     = 0
}

variable "container_app_max_replicas" {
  description = "Maximum container app replicas."
  type        = number
  default     = 3
}

variable "container_app_cpu" {
  description = "CPU per replica."
  type        = number
  default     = 0.5
}

variable "container_app_memory" {
  description = "Memory per replica (e.g. '1Gi')."
  type        = string
  default     = "1Gi"
}

variable "static_web_app_sku" {
  description = "SKU for the Static Web App: Free or Standard."
  type        = string
  default     = "Free"
}

variable "github_repo" {
  description = "GitHub repo in 'owner/name' format. Used for federated identity credential subjects."
  type        = string
}

variable "default_branch" {
  description = "Default branch (main or master). Dev federated identity trusts pushes to this branch."
  type        = string
  default     = "main"
}

variable "extra_secrets" {
  description = "Map of additional secrets to seed into Key Vault. Keys are secret names, values are secret values."
  type        = map(string)
  default     = {}
}

variable "anthropic_enabled" {
  description = "Whether to provision the Anthropic API key secret in KV and inject Anthropic__* env vars into the Container App."
  type        = bool
  default     = false
}

variable "anthropic_api_key" {
  description = "Anthropic API key written into KV when anthropic_enabled = true. Lifecycle ignores changes after creation."
  type        = string
  default     = ""
  sensitive   = true
}

variable "anthropic_default_model" {
  description = "Default Anthropic model id injected as Anthropic__DefaultModel env var."
  type        = string
  default     = "claude-haiku-4-5"
}

variable "anthropic_escalation_models" {
  description = "Comma-separated escalation model ids injected as Anthropic__EscalationModels env var."
  type        = string
  default     = "claude-sonnet-4-6,claude-opus-4-7"
}

variable "tfstate_storage_account_id" {
  description = "Resource ID of the storage account holding TF state. UAMI gets Storage Blob Data Contributor so GH Actions can read/write state via OIDC."
  type        = string
  default     = ""
}

variable "tags" {
  description = "Common tags applied to all per-app resources."
  type        = map(string)
  default     = {}
}
