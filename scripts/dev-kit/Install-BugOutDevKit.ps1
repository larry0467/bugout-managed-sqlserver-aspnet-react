<#
.SYNOPSIS
  Sets up a developer's machine to work Bug Out tickets in their own Claude Code session.

.DESCRIPTION
  1. Copies the kit (BugOutDev.psm1 + the fix dispatcher) to %USERPROFILE%\.bugout\kit.
  2. Saves your personal Bug Out service key to %USERPROFILE%\.bugout\service-key.json,
     with your Bug Out email (so "mine" finds the tickets sent to you) and your name.
  3. Installs the /bugout skill for Claude Code (%USERPROFILE%\.claude\skills\bugout).
  4. Writes %USERPROFILE%\.bugout\fix-dispatcher.json with your repository paths (the skill
     reads them; the optional dispatcher uses them).
  5. Checks: the key works, Claude Code is installed, Git can reach Azure DevOps.

  The key is never printed. Delete the downloaded service-key.json after this runs.

.EXAMPLE
  .\Install-BugOutDevKit.ps1 -KeyFile "$env:USERPROFILE\Downloads\service-key.json" `
      -Email dilpreet@protocall.co -Name Dilpreet -ApiRepo C:\src\ServiceManagerUI -WebRepo C:\src\ServiceManagedWeb

.EXAMPLE
  .\Install-BugOutDevKit.ps1 -Email dilpreet@protocall.co -Name Dilpreet   # prompts for the key (hidden)
#>
[CmdletBinding()]
param(
    [string]$KeyFile,
    [Parameter(Mandatory)][string]$Email,
    [Parameter(Mandatory)][string]$Name,
    [string]$ApiRepo,
    [string]$WebRepo,
    [string]$ApiBase = 'https://bugout-api.managedplatform.com'
)

$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
$bugout = Join-Path $env:USERPROFILE '.bugout'
$kit = Join-Path $bugout 'kit'

function Step([string]$m) { Write-Host ''; Write-Host "== $m" -ForegroundColor Cyan }
function Ok([string]$m) { Write-Host "   OK  $m" -ForegroundColor Green }
function Warn([string]$m) { Write-Host "   !!  $m" -ForegroundColor Yellow }

# ---------- 1. kit files ----------
Step 'Copying the kit'
foreach ($d in @($bugout, $kit, (Join-Path $kit 'fix-dispatcher'))) {
    if (-not (Test-Path -LiteralPath $d)) { New-Item -ItemType Directory -Path $d -Force | Out-Null }
}
Copy-Item -LiteralPath (Join-Path $here 'BugOutDev.psm1') -Destination (Join-Path $kit 'BugOutDev.psm1') -Force
foreach ($f in @('BugOutFixDispatcher.ps1', 'Register-FixDispatcherTask.ps1', 'fix-dispatcher.sample.json')) {
    Copy-Item -LiteralPath (Join-Path $here "fix-dispatcher\$f") -Destination (Join-Path $kit "fix-dispatcher\$f") -Force
}
Ok "kit in $kit"
Import-Module (Join-Path $kit 'BugOutDev.psm1') -Force

# ---------- 2. key ----------
Step 'Saving your Bug Out key'
$key = $null
if ($KeyFile) {
    if (-not (Test-Path -LiteralPath $KeyFile)) { throw "Key file not found: $KeyFile" }
    $kf = Get-Content -LiteralPath $KeyFile -Raw -Encoding UTF8 | ConvertFrom-Json
    $key = [string]$kf.key
    if ($kf.PSObject.Properties.Name -contains 'apiBase' -and $kf.apiBase) { $ApiBase = [string]$kf.apiBase }
}
else {
    $secure = Read-Host -AsSecureString 'Paste your Bug Out service key (bsk_...), then Enter'
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { $key = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}
if (-not $key -or -not $key.StartsWith('bsk_')) { throw 'That is not a Bug Out service key (it starts with bsk_). Ask Larry for yours.' }
Set-BugOutDevConfig -Key $key -ApiBase $ApiBase -Me $Email -Name $Name | Out-Null
$key = $null
Ok "saved to $(Join-Path $bugout 'service-key.json') (me = $Email, name = $Name)"

try {
    $stages = @(Get-BugOutStages)
    $mine = @(Get-BugOutFixQueue -Mine)
    Ok "Bug Out accepted the key ($($stages.Count) stages); $($mine.Count) ticket(s) waiting for you"
}
catch { Warn "Bug Out did not accept the key: $($_.Exception.Message)" }

# ---------- 3. Claude Code skill ----------
Step 'Installing the /bugout skill for Claude Code'
$skillDir = Join-Path $env:USERPROFILE '.claude\skills\bugout'
if (-not (Test-Path -LiteralPath $skillDir)) { New-Item -ItemType Directory -Path $skillDir -Force | Out-Null }
Copy-Item -LiteralPath (Join-Path $here 'skills\bugout\SKILL.md') -Destination (Join-Path $skillDir 'SKILL.md') -Force
Ok "skill in $skillDir (type /bugout in Claude Code)"

$claude = Get-Command claude -ErrorAction SilentlyContinue
if ($claude) { Ok "Claude Code found: $($claude.Source)" }
else { Warn 'Claude Code (claude) is not on PATH. Install it and sign in with YOUR Claude account: https://docs.claude.com/en/docs/claude-code' }

# ---------- 4. repositories ----------
Step 'Recording your repository paths'
$cfgPath = Join-Path $bugout 'fix-dispatcher.json'
$sample = Get-Content -LiteralPath (Join-Path $kit 'fix-dispatcher\fix-dispatcher.sample.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$sample.worker = $Name
$sample.assignedTo = $Email
$sample.workRoot = (Join-Path $bugout 'work')
$repos = @($sample.apps.'service-managed'.repos)
foreach ($r in $repos) {
    if ($r.name -eq 'ServiceManagerUI' -and $ApiRepo) { $r.git = (Resolve-Path -LiteralPath $ApiRepo).Path }
    if ($r.name -eq 'ServiceManagedWeb' -and $WebRepo) { $r.git = (Resolve-Path -LiteralPath $WebRepo).Path }
}
if ((Test-Path -LiteralPath $cfgPath) -and -not ($ApiRepo -or $WebRepo)) {
    Ok "kept your existing $cfgPath"
}
else {
    [System.IO.File]::WriteAllText($cfgPath, ($sample | ConvertTo-Json -Depth 12), (New-Object System.Text.UTF8Encoding($false)))
    Ok "wrote $cfgPath"
}

foreach ($r in $repos) {
    if (-not (Test-Path -LiteralPath $r.git)) { Warn "$($r.name): $($r.git) does not exist. Re-run with -ApiRepo / -WebRepo pointing at your clones."; continue }
    try {
        $tok = Get-BugOutDevOpsToken -RepoPath $r.git
        if ($tok) { Ok "$($r.name): Git Credential Manager can reach Azure DevOps ($($r.git))" }
        $tok = $null
    }
    catch { Warn "$($r.name): $($_.Exception.Message)" }
}

Step 'Done'
Write-Host '   1. Delete the service-key.json you downloaded (your copy now lives in .bugout).'
Write-Host '   2. Open Claude Code in your ServiceManagerUI or ServiceManagedWeb folder and type:  /bugout mine'
Write-Host '   3. Optional, drafts fixes on its own while you work: see section 8 of the workflow PDF.'
