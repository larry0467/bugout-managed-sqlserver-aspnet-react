<#
.SYNOPSIS
  Convenience wrapper: bootstrap an app across all four environments.

.EXAMPLE
  ./bootstrap-all-envs.ps1 -AppName hancock -GitHubRepo managedplatform/hancock
#>

[CmdletBinding()]
param(
  [Parameter(Mandatory)] [string] $AppName,
  [Parameter(Mandatory)] [string] $GitHubRepo,
  [string[]] $Environments = @('dev','demo','beta','prod')
)

$ErrorActionPreference = 'Stop'

foreach ($env in $Environments) {
  Write-Host ""
  Write-Host "================================================================" -ForegroundColor Yellow
  Write-Host " Bootstrapping $AppName / $env" -ForegroundColor Yellow
  Write-Host "================================================================" -ForegroundColor Yellow
  & "$PSScriptRoot/bootstrap.ps1" -AppName $AppName -Environment $env -GitHubRepo $GitHubRepo
}

Write-Host ""
Write-Host "All environments bootstrapped for $AppName." -ForegroundColor Green
Write-Host "Now commit infra/, .github/, scripts/ to $GitHubRepo and push to main."
