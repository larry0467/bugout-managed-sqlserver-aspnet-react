<#
.SYNOPSIS
  One-time per-(app, env) bootstrap. Provisions per-app Azure resources, sets
  GitHub repo secrets, creates the GitHub Environment, and runs the first
  terraform apply with a placeholder image.

.DESCRIPTION
  Idempotent: re-running is safe. Run after `az login` and `gh auth login`.

.EXAMPLE
  ./bootstrap.ps1 -AppName hancock -Environment dev -GitHubRepo managedplatform/hancock
#>

[CmdletBinding()]
param(
  [Parameter(Mandatory)] [string] $AppName,
  [Parameter(Mandatory)] [ValidateSet('dev','demo','beta','prod')] [string] $Environment,
  [Parameter(Mandatory)] [string] $GitHubRepo,
  [string] $DefaultBranch = 'main',
  [string] $TfStateResourceGroup = 'rg-mp-tfstate',
  [string] $TfStateStorageAccount = 'stmptfstatemkyf1j',
  [string] $TfStateContainer = 'tfstate'
)

$ErrorActionPreference = 'Stop'

function Step($msg) { Write-Host ">>> $msg" -ForegroundColor Cyan }

# -- preflight ------------------------------------------------------------
Step "Verifying prerequisites"
foreach ($cmd in 'az','terraform','gh') {
  if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
    throw "$cmd is not on PATH. Install it and retry."
  }
}
$account = az account show --output json | ConvertFrom-Json
if (-not $account) { throw "Not logged into az. Run 'az login'." }
gh auth status *> $null
if ($LASTEXITCODE -ne 0) { throw "Not logged into gh. Run 'gh auth login'." }

$subscriptionId = $account.id
$tenantId = $account.tenantId
Write-Host "Subscription: $($account.name) ($subscriptionId)"
Write-Host "Tenant:       $tenantId"
Write-Host ""

# -- terraform apply ------------------------------------------------------
$infraDir = Join-Path $PSScriptRoot (Join-Path ".." "infra")
if (-not (Test-Path $infraDir)) {
  throw "infra/ directory not found at $infraDir. Run from a repo containing the app template."
}

Step "Running terraform init for app=$AppName env=$Environment"
Push-Location $infraDir
try {
  $env:ARM_USE_AZUREAD = "true"
  terraform init -reconfigure `
    -backend-config="resource_group_name=$TfStateResourceGroup" `
    -backend-config="storage_account_name=$TfStateStorageAccount" `
    -backend-config="container_name=$TfStateContainer" `
    -backend-config="key=app-$AppName-$Environment.tfstate"
  if ($LASTEXITCODE -ne 0) { throw "terraform init failed" }

  Step "Running terraform apply (this provisions the per-app stack with a placeholder image)"
  terraform apply -auto-approve `
    -var-file="envs/$Environment.tfvars" `
    -var="app_name=$AppName" `
    -var="github_repo=$GitHubRepo" `
    -var="default_branch=$DefaultBranch"
  if ($LASTEXITCODE -ne 0) { throw "terraform apply failed" }

  Step "Reading terraform outputs"
  $tfOutput = terraform output -json | ConvertFrom-Json
  $uamiClientId = $tfOutput.uami_client_id.value
  $caFqdn = $tfOutput.container_app_fqdn.value
  $swaHost = $tfOutput.static_web_app_default_hostname.value
}
finally { Pop-Location }

# -- github repo secrets + environments -----------------------------------
Step "Setting GitHub repo secrets and environments"

# Tenant + subscription only need to be set once
gh secret set AZURE_TENANT_ID --repo $GitHubRepo --body $tenantId | Out-Null
gh secret set AZURE_SUBSCRIPTION_ID --repo $GitHubRepo --body $subscriptionId | Out-Null

# Per-env client ID
$envUpper = $Environment.ToUpper()
gh secret set "AZURE_CLIENT_ID_$envUpper" --repo $GitHubRepo --body $uamiClientId | Out-Null

# APP_NAME repo variable so workflows know what to build
gh variable set APP_NAME --repo $GitHubRepo --body $AppName 2>$null | Out-Null

# Create the GitHub Environment with appropriate protection rules
Step "Creating GitHub Environment '$Environment'"
if ($Environment -eq 'prod') {
  $userId = (gh api user | ConvertFrom-Json).id
  $envBody = @{
    wait_timer = 0
    reviewers = @(@{ type = 'User'; id = $userId })
    deployment_branch_policy = @{
      protected_branches = $false
      custom_branch_policies = $true
    }
  } | ConvertTo-Json -Depth 10 -Compress
  $envBody | gh api -X PUT "repos/$GitHubRepo/environments/$Environment" --input - | Out-Null
} else {
  # Non-prod envs: empty PUT creates the environment with default settings (no body needed)
  gh api -X PUT "repos/$GitHubRepo/environments/$Environment" --silent 2>$null
}

# For prod, also restrict to v* tags
if ($Environment -eq 'prod') {
  $branchPolicy = @{ name = 'v*'; type = 'tag' } | ConvertTo-Json -Compress
  $branchPolicy | gh api -X POST "repos/$GitHubRepo/environments/prod/deployment-branch-policies" --input - 2>$null | Out-Null
}

Write-Host ""
Write-Host "===============================================================" -ForegroundColor Green
Write-Host "Bootstrap complete: $AppName / $Environment" -ForegroundColor Green
Write-Host "===============================================================" -ForegroundColor Green
Write-Host "Container App FQDN:   $caFqdn"
Write-Host "Static Web App host:  $swaHost"
Write-Host "UAMI client ID:       $uamiClientId"
Write-Host "Set as repo secret:   AZURE_CLIENT_ID_$envUpper"
Write-Host ""
Write-Host "Add these GoDaddy DNS records when ready:"
Write-Host "  CNAME  $AppName-$Environment.managedplatform.com      -> $swaHost"
Write-Host "  CNAME  $AppName-api-$Environment.managedplatform.com  -> $caFqdn"
Write-Host ""
