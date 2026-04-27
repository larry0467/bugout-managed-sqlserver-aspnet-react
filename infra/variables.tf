variable "app_name" {
  description = "Short app slug. Set in tfvars."
  type        = string
}

variable "github_repo" {
  description = "GitHub repo in 'owner/name' format. Set in tfvars."
  type        = string
}

variable "default_branch" {
  description = "Repo default branch (main or master)."
  type        = string
  default     = "main"
}

variable "environment" {
  description = "dev, demo, beta, prod."
  type        = string
}

variable "location" {
  description = "Primary Azure region."
  type        = string
  default     = "eastus2"
}

variable "container_image" {
  description = "Image to deploy. Defaults to placeholder for first apply; CI overrides this."
  type        = string
  default     = "mcr.microsoft.com/k8se/quickstart:latest"
}

variable "container_app_min_replicas" {
  type    = number
  default = 0
}

variable "container_app_max_replicas" {
  type    = number
  default = 3
}

variable "static_web_app_sku" {
  type    = string
  default = "Free"
}

variable "extra_secrets" {
  type    = map(string)
  default = {}
}

variable "extra_cors_origins" {
  description = "Additional CORS origins on top of the standard localhost + bugout-{env}.managedplatform.com set."
  type        = list(string)
  default     = []
}

# Platform state lookup — the per-app TF reads platform outputs from this remote state
variable "platform_state_resource_group" {
  type    = string
  default = "rg-mp-tfstate"
}

variable "platform_state_storage_account" {
  type    = string
  default = "stmptfstatemkyf1j"
}

variable "platform_state_container" {
  type    = string
  default = "tfstate"
}
