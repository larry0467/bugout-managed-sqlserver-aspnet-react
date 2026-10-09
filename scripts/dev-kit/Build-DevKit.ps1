<#
.SYNOPSIS
  Packages the Bug Out developer kit as a zip to hand to the team.

.EXAMPLE
  .\Build-DevKit.ps1 -OutFile "$env:USERPROFILE\OneDrive\Desktop\Claude Files\BugOut-Dev-Kit.zip"
#>
[CmdletBinding()]
param([Parameter(Mandatory)][string]$OutFile)

$ErrorActionPreference = 'Stop'
$scripts = Split-Path -Parent $PSScriptRoot
$stage = Join-Path ([System.IO.Path]::GetTempPath()) ('bugout-dev-kit-' + [guid]::NewGuid().ToString('N'))
$root = Join-Path $stage 'BugOut-Dev-Kit'
New-Item -ItemType Directory -Path (Join-Path $root 'fix-dispatcher') -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $root 'skills\bugout') -Force | Out-Null

Copy-Item (Join-Path $scripts 'BugOutDev.psm1') $root
Copy-Item (Join-Path $PSScriptRoot 'Install-BugOutDevKit.ps1') $root
Copy-Item (Join-Path $PSScriptRoot 'README.txt') $root
Copy-Item (Join-Path $PSScriptRoot 'skills\bugout\SKILL.md') (Join-Path $root 'skills\bugout')
foreach ($f in 'BugOutFixDispatcher.ps1', 'Register-FixDispatcherTask.ps1', 'fix-dispatcher.sample.json') {
    Copy-Item (Join-Path $scripts "fix-dispatcher\$f") (Join-Path $root 'fix-dispatcher')
}

$full = [System.IO.Path]::GetFullPath($OutFile)
if (Test-Path -LiteralPath $full) { [System.IO.File]::Delete($full) }
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory($stage, $full)
[System.IO.Directory]::Delete($stage, $true)
Write-Host "Kit written to $full"
