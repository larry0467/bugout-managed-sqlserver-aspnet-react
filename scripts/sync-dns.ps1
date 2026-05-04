<#
.SYNOPSIS
  Reads `terraform output -json dns_records` and prints them in copy-paste form
  for manual entry in GoDaddy DNS Manager.

.DESCRIPTION
  managedplatform.com DNS is on GoDaddy, not Cloudflare. GoDaddy's DNS API
  requires a paid tier and is brittle, so this script defaults to printing
  records for manual entry. Replace this with API calls if you ever move DNS
  to a provider with a stable free API (e.g. Cloudflare).

  Run after `terraform apply` finishes. Logs the records you need to add.
#>

[CmdletBinding()]
param(
  [string] $InfraDir = (Join-Path $PSScriptRoot (Join-Path ".." "infra")),
  [string] $Zone = "managedplatform.com"
)

$ErrorActionPreference = 'Stop'

Push-Location $InfraDir
try {
  $records = terraform output -json dns_records | ConvertFrom-Json
} finally { Pop-Location }

Write-Host ""
Write-Host "==============================================================" -ForegroundColor Yellow
Write-Host " GoDaddy DNS records to add for $Zone" -ForegroundColor Yellow
Write-Host "==============================================================" -ForegroundColor Yellow
Write-Host ""
Write-Host "Sign in to GoDaddy → My Products → $Zone → DNS → Manage DNS"
Write-Host "Add or update each record below. TTL = 1 hour (default) unless noted."
Write-Host ""

foreach ($r in $records) {
  Write-Host "  Type:  $($r.type)"
  Write-Host "  Name:  $($r.name)"
  Write-Host "  Value: $($r.value)"
  Write-Host "  TTL:   1 hour"
  Write-Host ""
}

Write-Host "After adding the CNAMEs, register the custom domain in:" -ForegroundColor Cyan
Write-Host "  Azure portal → Container App → Custom domains"
Write-Host "  Azure portal → Static Web App → Custom domains"
Write-Host "Both will auto-provision a managed cert once DNS resolves."
