<#
.SYNOPSIS
  Registers (or refreshes) the Windows scheduled task that runs the Bug Out fix
  dispatcher every few minutes while this user is logged on.

.DESCRIPTION
  Runs as the current user without a stored password ("run only when user is logged
  on"), which is what Claude Code's subscription login needs: its credentials live in
  this user's profile. The devbox stays logged on between RDP sessions, so the task
  keeps running after you disconnect; it stops when the VM is powered off and resumes
  on the next logon.

.EXAMPLE
  .\Register-FixDispatcherTask.ps1                 # every 10 minutes
  .\Register-FixDispatcherTask.ps1 -Minutes 5
  .\Register-FixDispatcherTask.ps1 -Remove
#>
[CmdletBinding()]
param(
    [int]$Minutes = 10,
    [string]$TaskName = 'BugOut-FixDispatcher',
    [switch]$Remove
)

$ErrorActionPreference = 'Stop'
$script = Join-Path $PSScriptRoot 'BugOutFixDispatcher.ps1'
if (-not (Test-Path $script)) { throw "Dispatcher script not found at $script" }

if ($Remove) {
    schtasks /Delete /TN $TaskName /F | Out-Null
    Write-Host "Removed task $TaskName"
    return
}

$cmd = 'powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "{0}"' -f $script
# /NP = no password stored, which also means "run only when the user is logged on"
# (schtasks refuses /IT together with /NP); /RL LIMITED = no elevation; /F = replace.
schtasks /Create /TN $TaskName /SC MINUTE /MO $Minutes /TR $cmd /RU $env:USERNAME /NP /RL LIMITED /F | Out-Null
if ($LASTEXITCODE -ne 0) { throw "schtasks /Create failed ($LASTEXITCODE)" }
Write-Host "Task $TaskName runs every $Minutes minute(s) as $env:USERNAME while logged on."
Write-Host "Run now:   schtasks /Run /TN $TaskName"
Write-Host "Status:    schtasks /Query /TN $TaskName /V /FO LIST"
Write-Host "Logs:      $env:USERPROFILE\.bugout\logs\"
