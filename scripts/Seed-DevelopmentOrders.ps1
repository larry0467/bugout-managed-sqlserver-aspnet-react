<#
.SYNOPSIS
  Seeds the Development board: one application per Managed Platform app, and the
  first development orders (the Service Managed work from the 2026-10-08 session).

.DESCRIPTION
  Idempotent: applications are created only when the slug is missing, and an order
  is created only when no order with the same title exists for that app. Safe to
  re-run. Uses the service key in %USERPROFILE%\.bugout\service-key.json (or -ConfigPath).

.EXAMPLE
  .\scripts\Seed-DevelopmentOrders.ps1
  .\scripts\Seed-DevelopmentOrders.ps1 -ConfigPath "$env:USERPROFILE\.bugout\service-key.local.json" -SkipVideoFetch
#>
[CmdletBinding()]
param(
    [string]$ConfigPath = (Join-Path $env:USERPROFILE '.bugout\service-key.json'),
    # Where the 2026-10-08 session markdown lives (OneDrive share link preferred so it opens from any machine).
    [string]$SessionLogUrl = 'file:///C:/Users/larryadmin/OneDrive/Desktop/Claude%20Files/SESSION-2026-10-08-SM-estimates-nte-followups-banfield.md',
    [string]$SessionId = '65cf630d-63e2-4412-ae55-7b1b0f607dad',
    [string]$OrderedBy = 'Larry Baxter',
    # Skip reading the Videos Managed recording (offline / no network to videos-api-dev).
    [switch]$SkipVideoFetch
)

$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'BugOutDev.psm1') -Force

$cfg = Get-BugOutDevConfig -Path $ConfigPath
Write-Host "Seeding development board at $($cfg.apiBase)" -ForegroundColor Cyan

# ---------- applications ----------
$apps = @(
    @{ name = 'Service Managed';          slug = 'service-managed' }
    @{ name = 'Utilities Managed';        slug = 'utilities-managed' }
    @{ name = 'Forsor';                   slug = 'forsor' }
    @{ name = 'Videos Managed';           slug = 'videos-managed' }
    @{ name = 'Financials Managed';       slug = 'financials-managed' }
    @{ name = 'Groundbeds Managed';       slug = 'groundbeds-managed' }
    @{ name = 'Bug Out Managed';          slug = 'bug-out-managed' }
    @{ name = 'Comms Managed';            slug = 'comms-managed' }
    @{ name = 'Voices Managed';           slug = 'voices-managed' }
    @{ name = 'Hancock';                  slug = 'hancock' }
    @{ name = 'Freight Managed';          slug = 'freight-managed' }
    @{ name = 'Rx Managed';               slug = 'rx-managed' }
    @{ name = 'Managed Platform Console'; slug = 'managed-platform-console' }
)

$existing = @(Get-BugOutProjects -ConfigPath $ConfigPath)
foreach ($a in $apps) {
    $hit = $existing | Where-Object { $_.slug -eq $a.slug -or $_.name -eq $a.name } | Select-Object -First 1
    if ($hit) { Write-Host "  app ok      $($a.name)" -ForegroundColor DarkGray; continue }
    try {
        $p = Set-BugOutProject -Name $a.name -Slug $a.slug -ConfigPath $ConfigPath
        Write-Host "  app created $($p.name) ($($p.slug))" -ForegroundColor Green
    }
    catch {
        Write-Warning "  app $($a.name): $($_.Exception.Message)"
    }
}

# ---------- orders ----------
$devops = 'https://dev.azure.com/protocall/WebbasedLLC/_git'
function PrLink([string]$repo, [int]$id) { @{ kind = 'PR'; repo = $repo; name = "PR $id"; url = "$devops/$repo/pullrequest/$id" } }
function BranchLink([string]$repo, [string]$branch) { @{ kind = 'BRANCH'; repo = $repo; name = $branch; url = "$devops/$repo?version=GB$branch" } }

$video1 = 'https://videos-dev.managedplatform.com/larry-baxter/r/first-ai-drafted-estimate'

$orders = @(
    @{
        title   = 'Estimates + change orders + AI estimate agent'
        stage   = 'LOCAL_DEMO'
        summary = 'Quotes become estimates (customer approves an estimate, job bills actual T&M, estimate total = WO NTE) with change orders raising the NTE through the e-sign flow. Two AI agents: an estimate drafter (Expedite-Quote flag or "Draft Estimate with AI") and an overrun watch (labor at 80% of estimated hours or a billable material not on the estimate -> red bar + DSM/RVP decision in the WO Google Chat: change order / NTE increase / absorb). Video 1 rules built: say Estimate not Quote, estimate disclaimer, standard items are per-use truck-tool fees (nitrogen, recovery, vacuum, welding, fuel surcharge incl. return trip), compressor checklist, technician hours first with rationale, agent asks its questions in the WO chat, 24-month finished-jobs lookback. Migration_Estimates_ChangeOrders.sql before the API; Anthropic key in Third Party Settings; running on the local test stack (Start-Estimates-LocalTest.cmd).'
        video   = $video1
        links   = @(
            (BranchLink 'ServiceManagerUI' 'Larry_Estimates_ChangeOrders'),
            (BranchLink 'ServiceManagedWeb' 'Larry_Estimates_ChangeOrders'),
            (PrLink 'ServiceManagerUI' 4347),
            (PrLink 'ServiceManagedWeb' 4348),
            @{ kind = 'DOC'; name = 'Migration_Estimates_ChangeOrders.sql'; note = 'run before the API deploy' }
        )
        stageNote = 'running on the local test stack for Larry; PRs 4347/4348 open against dev'
    }
    @{
        title   = 'NTE history button'
        stage   = 'PR_OPEN'
        summary = 'History button beside the NTE on the work order showing every NTE change (who, when, from/to, reason). Migration_NTE_History.sql (ALTER PROC) before the API deploy. Not on LocalDB.'
        links   = @(
            (BranchLink 'ServiceManagerUI' 'Larry_NTE_History'),
            (BranchLink 'ServiceManagedWeb' 'Larry_NTE_History'),
            (PrLink 'ServiceManagerUI' 4349),
            (PrLink 'ServiceManagedWeb' 4350),
            @{ kind = 'DOC'; name = 'Migration_NTE_History.sql'; note = 'ALTER PROC; run before the API deploy' }
        )
        stageNote = 'PRs 4349/4350 open against dev; team merges'
    }
    @{
        title   = 'Third-party follow-up reminders'
        stage   = 'PR_OPEN'
        summary = 'A promise from a third party becomes a dated reminder on the Third Party tab; a 5-day stale nudge when nothing has moved. Migration_ThirdParty_FollowUps.sql before the API deploy.'
        links   = @(
            (BranchLink 'ServiceManagerUI' 'Larry_Third_Party_Follow_Ups'),
            (BranchLink 'ServiceManagedWeb' 'Larry_Third_Party_Follow_Ups'),
            (PrLink 'ServiceManagerUI' 4351),
            (PrLink 'ServiceManagedWeb' 4352),
            @{ kind = 'DOC'; name = 'Migration_ThirdParty_FollowUps.sql'; note = 'run before the API deploy' }
        )
        stageNote = 'PRs 4351/4352 open against dev; merge before Banfield (4353/4354)'
    }
    @{
        title   = 'Banfield email communications'
        stage   = 'PR_OPEN'
        summary = 'Customer emails from Banfield land in the work order Communications; notes are emailed back. Stacked on the third-party follow-ups branch: merge 4351/4352 first. Pipeline not enabled anywhere yet (no migration).'
        links   = @(
            (BranchLink 'ServiceManagerUI' 'Larry_Banfield_Email_Communications'),
            (BranchLink 'ServiceManagedWeb' 'Larry_Banfield_Email_Communications'),
            (PrLink 'ServiceManagerUI' 4353),
            (PrLink 'ServiceManagedWeb' 4354),
            @{ kind = 'DOC'; name = 'Stacked on Larry_Third_Party_Follow_Ups'; note = 'merge PRs 4351/4352 first' }
        )
        stageNote = 'PRs 4353/4354 open against dev, stacked on 4351/4352'
    }
)

$current = @(Get-BugOutOrders -ProjectSlug 'service-managed' -ConfigPath $ConfigPath)
foreach ($o in $orders) {
    $hit = $current | Where-Object { $_.title -eq $o.title } | Select-Object -First 1
    if ($hit) { Write-Host "  order ok    #$($hit.id) $($o.title) [$($hit.stage)]" -ForegroundColor DarkGray; continue }

    $transcript = $null
    if ($o.ContainsKey('video') -and $o.video -and -not $SkipVideoFetch) {
        try {
            $rec = Get-VideosManagedRecording -Url $o.video
            if ($rec.PSObject.Properties.Name -contains 'captionsVtt') { $transcript = $rec.captionsVtt }
            Write-Host "  video read  $($rec.title) ($($rec.durationSeconds)s)" -ForegroundColor DarkGray
        }
        catch { Write-Warning "  could not read the video ($($_.Exception.Message)); linking without transcript" }
    }

    $videoUrl = $null
    if ($o.ContainsKey('video')) { $videoUrl = $o.video }

    # Create at ORDERED so the stage history shows the real path, then move.
    $created = New-BugOutOrder -ProjectSlug 'service-managed' -Title $o.title -Summary $o.summary -VideoUrl $videoUrl `
        -Transcript $transcript -SessionLogUrl $SessionLogUrl -SessionId $SessionId -OrderedBy $OrderedBy `
        -Stage 'ORDERED' -Links $o.links -ConfigPath $ConfigPath
    $id = $created.order.id
    if ($o.stage -ne 'ORDERED') {
        Set-BugOutOrderStage -Id $id -Stage $o.stage -Note $o.stageNote -ConfigPath $ConfigPath | Out-Null
    }
    Write-Host "  order new   #$id $($o.title) [$($o.stage)]  $($created.order.boardUrl)" -ForegroundColor Green
}

Write-Host 'Done.' -ForegroundColor Cyan
