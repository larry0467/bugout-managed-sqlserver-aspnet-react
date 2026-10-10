# BugOutDev.psm1 - talk to the Bug Out Managed development tracker from PowerShell.
#
# For Claude Code sessions (and humans) that log development orders: the video
# that ordered the work, the branches and PRs, the stage, the session log.
#
#   Import-Module C:\Users\larryadmin\bugs-managed-sqlserver-aspnet-react\scripts\BugOutDev.psm1
#   Set-BugOutDevConfig -Key 'bsk_...' -ApiBase 'https://bugout-api.managedplatform.com'   # once
#   $order = New-BugOutOrderFromVideo -VideoUrl 'https://videos-dev.managedplatform.com/larry-baxter/r/<slug>' `
#              -ProjectSlug service-managed -Title 'NTE history button' -Summary 'Button beside the NTE...'
#   Add-BugOutOrderLink -Id $order.order.id -Kind PR -Repo ServiceManagerUI -Name 'PR 4349' -Url 'https://...'
#   Set-BugOutOrderStage -Id $order.order.id -Stage PR_OPEN -Note 'both PRs open'
#   Update-BugOutOrder -Id $order.order.id -SessionLogUrl 'https://1drv.ms/...'
#
# Auth: the X-BOM-Service-Key header, read from %USERPROFILE%\.bugout\service-key.json
# ({ "key": "bsk_...", "apiBase": "https://bugout-api.managedplatform.com" }).
# Create the key in Bug Out > Settings > Service Keys. It works on /api/development/* only.
#
# Windows PowerShell 5.1 compatible (no ternary, no ??).

Set-StrictMode -Version 2.0

$script:DefaultConfigPath = Join-Path $env:USERPROFILE '.bugout\service-key.json'
$script:DefaultApiBase = 'https://bugout-api.managedplatform.com'
$script:VideosApiBase = 'https://videos-api-dev.managedplatform.com'

function Get-BugOutDevConfig {
    [CmdletBinding()]
    param([string]$Path = $script:DefaultConfigPath)

    if (-not (Test-Path -LiteralPath $Path)) {
        throw "No service key file at $Path. Create a key in Bug Out > Settings > Service Keys, then run Set-BugOutDevConfig -Key 'bsk_...'."
    }
    $cfg = Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json
    if (-not $cfg.key) { throw "Service key file $Path has no 'key' property." }
    if (-not ($cfg.PSObject.Properties.Name -contains 'apiBase') -or -not $cfg.apiBase) {
        $cfg | Add-Member -NotePropertyName apiBase -NotePropertyValue $script:DefaultApiBase -Force
    }
    $cfg.apiBase = ([string]$cfg.apiBase).TrimEnd('/')
    return $cfg
}

function Set-BugOutDevConfig {
    # -Me is your Bug Out login email: tickets handed to you at triage are the
    # ones "Get-BugOutFixQueue -Mine" returns. -Name labels your claims
    # ("Dilpreet - laptop"). Omitted values keep what the file already has.
    [CmdletBinding()]
    param(
        [string]$Key,
        [string]$ApiBase,
        [string]$Org,
        [string]$Me,
        [string]$Name,
        [string]$Path = $script:DefaultConfigPath
    )
    $existing = $null
    if (Test-Path -LiteralPath $Path) {
        try { $existing = Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json } catch { $existing = $null }
    }
    function Old([string]$n) { if ($null -ne $existing -and ($existing.PSObject.Properties.Name -contains $n)) { return [string]$existing.$n } return $null }

    if (-not $Key) { $Key = Old 'key' }
    if (-not $Key) { throw 'Pass -Key (the bsk_ service key) the first time.' }
    if (-not $Key.StartsWith('bsk_')) { throw "That does not look like a Bug Out service key (expected the bsk_ prefix)." }
    if (-not $ApiBase) { $ApiBase = Old 'apiBase' }
    if (-not $ApiBase) { $ApiBase = $script:DefaultApiBase }
    if (-not $Org) { $Org = Old 'org' }
    if (-not $Me) { $Me = Old 'me' }
    if (-not $Name) { $Name = Old 'name' }

    $dir = Split-Path -Parent $Path
    if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    $obj = [ordered]@{ key = $Key; apiBase = $ApiBase.TrimEnd('/') }
    if ($Org) { $obj.org = $Org }
    if ($Me) { $obj.me = $Me.Trim() }
    if ($Name) { $obj.name = $Name.Trim() }
    $json = $obj | ConvertTo-Json
    # Absolute path + explicit UTF-8 without BOM: Set-Content in 5.1 writes ANSI.
    $full = [System.IO.Path]::GetFullPath($Path)
    [System.IO.File]::WriteAllText($full, $json, (New-Object System.Text.UTF8Encoding($false)))
    Write-Verbose "Saved service key config to $full"
    return (Get-BugOutDevConfig -Path $Path)
}

function Invoke-BugOutDev {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][ValidateSet('GET', 'POST', 'PUT', 'PATCH', 'DELETE')][string]$Method,
        [Parameter(Mandatory)][string]$Path,
        $Body,
        [hashtable]$Query,
        [string]$ConfigPath = $script:DefaultConfigPath
    )
    $cfg = Get-BugOutDevConfig -Path $ConfigPath
    $uri = $cfg.apiBase + '/api/development/' + $Path.TrimStart('/')
    if ($Query -and $Query.Count -gt 0) {
        $pairs = @()
        foreach ($k in $Query.Keys) {
            if ($null -ne $Query[$k] -and "$($Query[$k])" -ne '') {
                $pairs += ('{0}={1}' -f [uri]::EscapeDataString($k), [uri]::EscapeDataString("$($Query[$k])"))
            }
        }
        if ($pairs.Count -gt 0) { $uri += '?' + ($pairs -join '&') }
    }
    $headers = @{ 'X-BOM-Service-Key' = $cfg.key; 'Accept' = 'application/json' }
    $req = @{ Method = $Method; Uri = $uri; Headers = $headers; ErrorAction = 'Stop' }
    if ($null -ne $Body) {
        $req.ContentType = 'application/json; charset=utf-8'
        $req.Body = [System.Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Depth 12))
    }
    try {
        $result = Invoke-RestMethod @req
        # Windows PowerShell 5.1 hands a JSON array back as one Object[]; emit
        # the elements so callers get the usual per-item pipeline.
        if ($result -is [System.Array]) { foreach ($item in $result) { $item } }
        elseif ($null -ne $result) { $result }
        return
    }
    catch {
        $detail = $null
        try { if ($_.ErrorDetails -and $_.ErrorDetails.Message) { $detail = ($_.ErrorDetails.Message | ConvertFrom-Json).message } } catch { $detail = $_.ErrorDetails.Message }
        $status = $null
        try { $status = [int]$_.Exception.Response.StatusCode } catch { }
        if ($status -eq 401) { throw "Bug Out rejected the service key (401). Is it revoked, or is apiBase wrong? $detail" }
        if ($status -eq 403) { throw "Bug Out refused the call (403): $detail" }
        if ($detail) { throw "Bug Out $Method $Path failed ($status): $detail" }
        throw
    }
}

# ---------- reference data ----------

function Get-BugOutProjects {
    [CmdletBinding()] param([string]$ConfigPath = $script:DefaultConfigPath)
    Invoke-BugOutDev -Method GET -Path 'projects' -ConfigPath $ConfigPath
}

function Set-BugOutProject {
    # Ensure an application exists (returns the existing one when the slug or name matches).
    [CmdletBinding()]
    param([Parameter(Mandatory)][string]$Name, [string]$Slug, [string]$ConfigPath = $script:DefaultConfigPath)
    $body = @{ name = $Name }
    if ($Slug) { $body.slug = $Slug }
    Invoke-BugOutDev -Method POST -Path 'projects' -Body $body -ConfigPath $ConfigPath
}

function Get-BugOutStages {
    [CmdletBinding()] param([string]$ConfigPath = $script:DefaultConfigPath)
    Invoke-BugOutDev -Method GET -Path 'stages' -ConfigPath $ConfigPath
}

# ---------- orders ----------

function Get-BugOutOrders {
    [CmdletBinding()]
    param(
        [string]$ProjectSlug,
        [long]$ProjectId,
        [string[]]$Stage,
        [string]$Search,
        [switch]$NeedsAnnouncement,
        # Announced items are included by default (the API's default too).
        [switch]$HideAnnounced,
        [string]$ConfigPath = $script:DefaultConfigPath
    )
    $q = @{}
    if ($ProjectSlug) { $q.projectSlug = $ProjectSlug }
    if ($ProjectId) { $q.projectId = $ProjectId }
    if ($Stage) { $q.stage = ($Stage -join ',') }
    if ($Search) { $q.search = $Search }
    if ($NeedsAnnouncement) { $q.needsAnnouncement = 'true' }
    if ($HideAnnounced) { $q.includeAnnounced = 'false' }
    Invoke-BugOutDev -Method GET -Path 'orders' -Query $q -ConfigPath $ConfigPath
}

function Get-BugOutOrder {
    [CmdletBinding()] param([Parameter(Mandatory)][long]$Id, [string]$ConfigPath = $script:DefaultConfigPath)
    Invoke-BugOutDev -Method GET -Path "orders/$Id" -ConfigPath $ConfigPath
}

function New-BugOutOrder {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$ProjectSlug,
        [Parameter(Mandatory)][string]$Title,
        [string]$Summary,
        [string]$VideoUrl,
        [string]$Transcript,
        [string]$SessionLogUrl,
        [string]$SessionId,
        [string]$OrderedBy,
        [ValidateSet('ORDERED', 'IN_PROGRESS', 'LOCAL_DEMO', 'PR_OPEN', 'MERGED_DEV', 'BETA', 'PRODUCTION', 'ANNOUNCED')]
        [string]$Stage = 'ORDERED',
        [ValidateSet('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')][string]$Priority = 'MEDIUM',
        # Array of hashtables: @{ kind='PR'; repo='ServiceManagerUI'; name='PR 4347'; url='https://...'; note='' }
        [object[]]$Links,
        # The next video of an existing effort: log it as the next phase of that initiative.
        [long]$ParentOrderId,
        # The order this one is stacked on / waits for, and how far that one must get first.
        [long]$DependsOnOrderId,
        [ValidateSet('IN_PROGRESS', 'LOCAL_DEMO', 'PR_OPEN', 'MERGED_DEV', 'BETA', 'PRODUCTION')]
        [string]$DependsOnStage,
        # Test checklist: strings, or hashtables @{ text='...'; expected='...'; environment='LOCAL|DEV|BETA|ANY' }
        [object[]]$Tests,
        [string]$ConfigPath = $script:DefaultConfigPath
    )
    $body = @{ projectSlug = $ProjectSlug; title = $Title; stage = $Stage; priority = $Priority }
    if ($Summary) { $body.summary = $Summary }
    if ($VideoUrl) { $body.videoUrl = $VideoUrl }
    if ($Transcript) { $body.transcript = $Transcript }
    if ($SessionLogUrl) { $body.sessionLogUrl = $SessionLogUrl }
    if ($SessionId) { $body.sessionId = $SessionId }
    if ($OrderedBy) { $body.orderedBy = $OrderedBy }
    if ($Links) { $body.links = @($Links | ForEach-Object { ConvertTo-BugOutLinkBody $_ }) }
    if ($ParentOrderId) { $body.parentOrderId = $ParentOrderId }
    if ($DependsOnOrderId) { $body.dependsOnOrderId = $DependsOnOrderId }
    if ($DependsOnStage) { $body.dependsOnStage = $DependsOnStage }
    if ($Tests) { $body.tests = @($Tests | ForEach-Object { ConvertTo-BugOutTestBody $_ }) }
    Invoke-BugOutDev -Method POST -Path 'orders' -Body $body -ConfigPath $ConfigPath
}

# ---------- initiatives (one effort, several videos = numbered phases) ----------

function New-BugOutInitiative {
    # Groups existing orders, in the order given, as phases of a new initiative.
    # Each phase builds on the one before it unless -NoChain (stacked branches merge in phase order).
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$Title,
        [Parameter(Mandatory)][long[]]$OrderIds,
        [string]$Summary,
        [string]$ProjectSlug,
        [switch]$NoChain,
        [string]$ConfigPath = $script:DefaultConfigPath
    )
    $body = @{ title = $Title; orderIds = @($OrderIds); chain = (-not $NoChain) }
    if ($Summary) { $body.summary = $Summary }
    if ($ProjectSlug) { $body.projectSlug = $ProjectSlug }
    Invoke-BugOutDev -Method POST -Path 'initiatives' -Body $body -ConfigPath $ConfigPath
}

function Add-BugOutPhase {
    # Appends orders to an existing initiative; the first one builds on its current last phase unless -NoChain.
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][long]$InitiativeId,
        [Parameter(Mandatory)][long[]]$OrderIds,
        [switch]$NoChain,
        [string]$ConfigPath = $script:DefaultConfigPath
    )
    $body = @{ initiativeId = $InitiativeId; orderIds = @($OrderIds); chain = (-not $NoChain) }
    Invoke-BugOutDev -Method POST -Path 'initiatives' -Body $body -ConfigPath $ConfigPath
}

function Set-BugOutOrderPlacement {
    # Full replacement of where an order sits: -InitiativeId (omit = standalone), -PhaseNumber
    # (omit = last), -DependsOnOrderId (omit = builds on nothing), -DependsOnStage (default MERGED_DEV).
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][long]$Id,
        [long]$InitiativeId,
        [int]$PhaseNumber,
        [long]$DependsOnOrderId,
        [ValidateSet('IN_PROGRESS', 'LOCAL_DEMO', 'PR_OPEN', 'MERGED_DEV', 'BETA', 'PRODUCTION')]
        [string]$DependsOnStage,
        [string]$ConfigPath = $script:DefaultConfigPath
    )
    $body = @{ parentOrderId = $null; phaseNumber = $null; dependsOnOrderId = $null; dependsOnStage = $null }
    if ($InitiativeId) { $body.parentOrderId = $InitiativeId }
    if ($PhaseNumber) { $body.phaseNumber = $PhaseNumber }
    if ($DependsOnOrderId) { $body.dependsOnOrderId = $DependsOnOrderId }
    if ($DependsOnStage) { $body.dependsOnStage = $DependsOnStage }
    Invoke-BugOutDev -Method PUT -Path "orders/$Id/placement" -Body $body -ConfigPath $ConfigPath
}

# ---------- test checklist (what the tester checks when it is ready to try) ----------

function ConvertTo-BugOutTestBody {
    param([Parameter(Mandatory)]$Test)
    if ($Test -is [string]) { return @{ text = $Test } }
    $h = @{}
    foreach ($k in 'text', 'expected', 'environment') {
        $v = $null
        if ($Test -is [hashtable]) { if ($Test.ContainsKey($k)) { $v = $Test[$k] } }
        elseif ($Test.PSObject.Properties.Name -contains $k) { $v = $Test.$k }
        if ($null -ne $v -and "$v" -ne '') { $h[$k] = "$v" }
    }
    if (-not $h.ContainsKey('text')) { throw 'A test needs at least text.' }
    return $h
}

function Get-BugOutTests {
    [CmdletBinding()] param([Parameter(Mandatory)][long]$Id, [string]$ConfigPath = $script:DefaultConfigPath)
    Invoke-BugOutDev -Method GET -Path "orders/$Id/tests" -ConfigPath $ConfigPath
}

function Add-BugOutTests {
    # Strings or @{ text; expected; environment = LOCAL | DEV | BETA | ANY }. -Replace rewrites the whole list.
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][long]$Id,
        [Parameter(Mandatory)][object[]]$Tests,
        [switch]$Replace,
        [string]$ConfigPath = $script:DefaultConfigPath
    )
    $body = @{ items = @($Tests | ForEach-Object { ConvertTo-BugOutTestBody $_ }); replace = [bool]$Replace }
    Invoke-BugOutDev -Method POST -Path "orders/$Id/tests" -Body $body -ConfigPath $ConfigPath
}

function Set-BugOutTestResult {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][long]$Id,
        [Parameter(Mandatory)][long]$ItemId,
        [Parameter(Mandatory)][ValidateSet('PASS', 'FAIL', '')][AllowEmptyString()][string]$Result,
        [string]$Note,
        [ValidateSet('LOCAL', 'DEV', 'BETA')][string]$TestedIn,
        [string]$ConfigPath = $script:DefaultConfigPath
    )
    $body = @{ result = $Result }
    if ($Note) { $body.note = $Note }
    if ($TestedIn) { $body.testedIn = $TestedIn }
    Invoke-BugOutDev -Method PUT -Path "orders/$Id/tests/$ItemId/result" -Body $body -ConfigPath $ConfigPath
}

function Start-BugOutTestRound {
    # Clears every result (e.g. local passed, now test in beta); the old ones stay in the activity feed.
    [CmdletBinding()] param([Parameter(Mandatory)][long]$Id, [string]$Note, [string]$ConfigPath = $script:DefaultConfigPath)
    Invoke-BugOutDev -Method POST -Path "orders/$Id/tests/new-round" -Body @{ note = $Note } -ConfigPath $ConfigPath
}

function Get-BugOutTestChecklistMarkdown {
    # The checklist as markdown for a PR description: testers tick it on the board, not in the PR.
    [CmdletBinding()] param([Parameter(Mandatory)][long]$Id, [string]$ConfigPath = $script:DefaultConfigPath)
    $o = Get-BugOutOrder -Id $Id -ConfigPath $ConfigPath
    $items = @($o.tests)
    $lines = @("## Test checklist", "", "Record each result on the board: $($o.order.boardUrl)", "")
    if ($items.Count -eq 0) { $lines += '_No checklist yet._' }
    $n = 0
    foreach ($i in $items) {
        $n++
        $where = if ($i.environment -and $i.environment -ne 'ANY') { " _($($i.environmentLabel))_" } else { '' }
        $lines += "- [ ] $n. $($i.text)$where"
        if ($i.expected) { $lines += "  - Expect: $($i.expected)" }
    }
    return ($lines -join "`n")
}

function Set-BugOutOrderStage {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][long]$Id,
        [Parameter(Mandatory)]
        [ValidateSet('ORDERED', 'IN_PROGRESS', 'LOCAL_DEMO', 'PR_OPEN', 'MERGED_DEV', 'BETA', 'PRODUCTION', 'ANNOUNCED')]
        [string]$Stage,
        [string]$Note,
        [string]$ConfigPath = $script:DefaultConfigPath
    )
    $body = @{ stage = $Stage }
    if ($Note) { $body.note = $Note }
    Invoke-BugOutDev -Method PUT -Path "orders/$Id/stage" -Body $body -ConfigPath $ConfigPath
}

function Update-BugOutOrder {
    # Only the parameters you pass are sent. Pass '' to clear a field.
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][long]$Id,
        [string]$Title,
        [string]$Summary,
        [string]$VideoUrl,
        [string]$Transcript,
        [string]$SessionLogUrl,
        [string]$SessionId,
        [string]$AnnouncementVideoUrl,
        [ValidateSet('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')][string]$Priority,
        [string]$OrderedBy,
        [string]$ConfigPath = $script:DefaultConfigPath
    )
    $map = @{
        Title = 'title'; Summary = 'summary'; VideoUrl = 'videoUrl'; Transcript = 'transcript'
        SessionLogUrl = 'sessionLogUrl'; SessionId = 'sessionId'; AnnouncementVideoUrl = 'announcementVideoUrl'
        Priority = 'priority'; OrderedBy = 'orderedBy'
    }
    $body = @{}
    foreach ($p in $map.Keys) {
        if ($PSBoundParameters.ContainsKey($p)) { $body[$map[$p]] = $PSBoundParameters[$p] }
    }
    if ($body.Count -eq 0) { throw 'Nothing to update: pass at least one field.' }
    Invoke-BugOutDev -Method PATCH -Path "orders/$Id" -Body $body -ConfigPath $ConfigPath
}

function Add-BugOutOrderLink {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][long]$Id,
        [Parameter(Mandatory)][ValidateSet('BRANCH', 'PR', 'COMMIT', 'DOC', 'VIDEO')][string]$Kind,
        [string]$Repo,
        [Parameter(Mandatory)][string]$Name,
        [string]$Url,
        [string]$Note,
        [string]$ConfigPath = $script:DefaultConfigPath
    )
    $body = ConvertTo-BugOutLinkBody @{ kind = $Kind; repo = $Repo; name = $Name; url = $Url; note = $Note }
    Invoke-BugOutDev -Method POST -Path "orders/$Id/links" -Body $body -ConfigPath $ConfigPath
}

function Remove-BugOutOrderLink {
    [CmdletBinding()]
    param([Parameter(Mandatory)][long]$Id, [Parameter(Mandatory)][long]$LinkId, [string]$ConfigPath = $script:DefaultConfigPath)
    Invoke-BugOutDev -Method DELETE -Path "orders/$Id/links/$LinkId" -ConfigPath $ConfigPath | Out-Null
}

function Get-BugOutShipped {
    [CmdletBinding()] param([string]$Date, [string]$ConfigPath = $script:DefaultConfigPath)
    $q = @{}
    if ($Date) { $q.date = $Date }
    Invoke-BugOutDev -Method GET -Path 'shipped' -Query $q -ConfigPath $ConfigPath
}

function ConvertTo-BugOutLinkBody {
    param([Parameter(Mandatory)]$Link)
    $h = @{}
    foreach ($k in 'kind', 'repo', 'name', 'url', 'note') {
        $v = $null
        if ($Link -is [hashtable]) { if ($Link.ContainsKey($k)) { $v = $Link[$k] } }
        elseif ($Link.PSObject.Properties.Name -contains $k) { $v = $Link.$k }
        if ($null -ne $v -and "$v" -ne '') { $h[$k] = "$v" }
    }
    if (-not $h.ContainsKey('kind') -or -not $h.ContainsKey('name')) { throw 'A link needs at least kind and name.' }
    $h.kind = $h.kind.ToUpperInvariant()
    return $h
}

# ---------- drafted-fix queue (the devbox dispatcher's verbs) ----------

function Get-BugOutFixQueue {
    # -Mine: tickets triage handed to you (the "me" email in your key file).
    # -AssignedTo none: tickets not handed to anybody (what the devbox takes).
    [CmdletBinding()]
    param(
        [string]$ProjectSlug,
        [ValidateSet('REQUESTED', 'CLAIMED', 'READY_TO_TEST', 'FAILED', 'APPROVED', 'REJECTED')][string]$Status = 'REQUESTED',
        [int]$Take = 20,
        [string]$AssignedTo,
        [switch]$Mine,
        [string]$ConfigPath = $script:DefaultConfigPath
    )
    $q = @{ status = $Status; take = $Take }
    if ($ProjectSlug) { $q.projectSlug = $ProjectSlug }
    if ($Mine) {
        $cfg = Get-BugOutDevConfig -Path $ConfigPath
        if (-not ($cfg.PSObject.Properties.Name -contains 'me') -or -not $cfg.me) { throw "Your key file has no 'me' email. Run: Set-BugOutDevConfig -Me 'you@protocall.co'" }
        $AssignedTo = $cfg.me
    }
    if ($AssignedTo) { $q.assignedTo = $AssignedTo }
    Invoke-BugOutDev -Method GET -Path 'fixes/queue' -Query $q -ConfigPath $ConfigPath
}

function Get-BugOutWorkerName {
    # "Dilpreet - LAPTOP-7" from the key file's name, else "<user> on <computer>".
    param([string]$ConfigPath = $script:DefaultConfigPath)
    $name = $null
    try {
        $cfg = Get-BugOutDevConfig -Path $ConfigPath
        if ($cfg.PSObject.Properties.Name -contains 'name' -and $cfg.name) { $name = [string]$cfg.name }
    } catch { }
    if ($name) { return "$name - $env:COMPUTERNAME" }
    return "$env:USERNAME on $env:COMPUTERNAME"
}

function Get-BugOutFix {
    [CmdletBinding()] param([Parameter(Mandatory)][long]$Id, [string]$ConfigPath = $script:DefaultConfigPath)
    Invoke-BugOutDev -Method GET -Path "fixes/$Id" -ConfigPath $ConfigPath
}

function Get-BugOutFixApps {
    [CmdletBinding()] param([string]$ConfigPath = $script:DefaultConfigPath)
    Invoke-BugOutDev -Method GET -Path 'fixes/apps' -ConfigPath $ConfigPath
}

function Request-BugOutFix {
    # Queue any ticket for a drafted fix (what "Request Claude fix" does in the UI).
    [CmdletBinding()] param([Parameter(Mandatory)][long]$Id, [string]$Note, [string]$ConfigPath = $script:DefaultConfigPath)
    $body = @{}
    if ($Note) { $body.note = $Note }
    Invoke-BugOutDev -Method POST -Path "fixes/$Id/request" -Body $body -ConfigPath $ConfigPath
}

function Start-BugOutFix {
    # Claim a REQUESTED ticket for this worker. 409 when someone else got it first.
    [CmdletBinding()] param([Parameter(Mandatory)][long]$Id, [string]$Worker, [string]$ConfigPath = $script:DefaultConfigPath)
    if (-not $Worker) { $Worker = Get-BugOutWorkerName -ConfigPath $ConfigPath }
    Invoke-BugOutDev -Method POST -Path "fixes/$Id/claim" -Body @{ worker = $Worker } -ConfigPath $ConfigPath
}

function Reset-BugOutFix {
    # Give a CLAIMED ticket back to the queue (worker gave up or died).
    [CmdletBinding()] param([Parameter(Mandatory)][long]$Id, [string]$ConfigPath = $script:DefaultConfigPath)
    Invoke-BugOutDev -Method POST -Path "fixes/$Id/release" -Body @{} -ConfigPath $ConfigPath
}

function Complete-BugOutFix {
    # Report the outcome. READY_TO_TEST puts the ticket on the Development board at PR open.
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][long]$Id,
        [Parameter(Mandatory)][ValidateSet('READY_TO_TEST', 'FAILED')][string]$Outcome,
        [string]$Summary,
        [string]$TestingNotes,
        [object[]]$Links,
        [string]$ConfigPath = $script:DefaultConfigPath
    )
    $body = @{ outcome = $Outcome }
    if ($Summary) { $body.summary = $Summary }
    if ($TestingNotes) { $body.testingNotes = $TestingNotes }
    if ($Links) { $body.links = @($Links | ForEach-Object { ConvertTo-BugOutLinkBody $_ }) }
    Invoke-BugOutDev -Method POST -Path "fixes/$Id/result" -Body $body -ConfigPath $ConfigPath
}

# ---------- working a ticket in your own session ----------

function Export-BugOutTicketBrief {
    # Writes TICKET.md (what the reporter said and saw, console/network errors,
    # page, tenant, triage guidance, feedback from a rejected attempt) and
    # downloads the screenshots, so a Claude Code session reads one file instead
    # of the API. Default folder: %USERPROFILE%\.bugout\tickets\<id>.
    [CmdletBinding()]
    param([Parameter(Mandatory)][long]$Id, [string]$Folder, [string]$ConfigPath = $script:DefaultConfigPath)
    $t = Get-BugOutFix -Id $Id -ConfigPath $ConfigPath
    if (-not $Folder) { $Folder = Join-Path $env:USERPROFILE (".bugout\tickets\{0}" -f $Id) }
    $att = Join-Path $Folder 'attachments'
    if (-not (Test-Path -LiteralPath $att)) { New-Item -ItemType Directory -Path $att -Force | Out-Null }

    function V($o, [string]$n) { if ($null -ne $o -and ($o.PSObject.Properties.Name -contains $n) -and $null -ne $o.$n) { return [string]$o.$n } return '' }

    $attLines = @()
    foreach ($a in @($t.attachments)) {
        if ($null -eq $a) { continue }
        $file = (V $a 'fileName') -replace '[^\w\.\-]', '_'
        if (V $a 'url') {
            try { Invoke-WebRequest -Uri $a.url -OutFile (Join-Path $att $file) -UseBasicParsing -TimeoutSec 60; $attLines += "- attachments\$file ($(V $a 'contentType'))" }
            catch { $attLines += "- $(V $a 'fileName'): could not download ($($_.Exception.Message))" }
        }
        else { $attLines += "- $(V $a 'fileName') (no url)" }
    }
    $links = @($t.links | Where-Object { $_ } | ForEach-Object { "- $($_.kind) $(V $_ 'repo') $($_.name) $(V $_ 'url')" })
    $fence = '```'
    $md = @"
# Bug Out ticket #$Id - $(V $t 'title')

- App: $(V $t 'projectName') ($(V $t 'projectSlug'))
- Type / priority / status: $(V $t 'ticketType') / $(V $t 'priority') / $(V $t 'status') - fix status $(V $t 'fixStatus')
- Reported by: $(V $t 'submittedBy') at $(V $t 'createdAt')
- Page: $(V $t 'currentPageName') - $(V $t 'currentPageUrl')
- Browser: $(V $t 'browserInfo') ($(V $t 'screenWidth')x$(V $t 'screenHeight'))
- Tenant: $(V $t 'tenantName') ($(V $t 'tenantId')) db $(V $t 'databaseName') - app version $(V $t 'applicationVersion') - environment $(V $t 'environment')
- Recording: $(V $t 'videoUrl')
- Assigned to: $(V $t 'assignedTo')
- Board: $(V $t 'boardUrl')
- Triage: $(V $t 'triageDecisionLabel') by $(V $t 'triagedBy') at $(V $t 'triagedAt')

## Guidance / feedback from the person who sent this (overrides the original report where they conflict)
$(V $t 'fixFeedback')

## How it should work (second video)
$(V $t 'guidanceVideoUrl')

$(V $t 'guidanceTranscript')

## Description
$(V $t 'description')

## What the reporter said (voice transcript of the screen recording)
$(V $t 'transcript')

## Console errors
$fence
$(V $t 'consoleErrors')
$fence

## Network errors
$fence
$(V $t 'networkErrors')
$fence

## Attachments
$($attLines -join "`n")

## Previous attempt
$(V $t 'fixSummary')

## Links already on the ticket
$($links -join "`n")

## Testing notes so far
$(V $t 'testingNotes')
"@
    $path = Join-Path $Folder 'TICKET.md'
    [System.IO.File]::WriteAllText([System.IO.Path]::GetFullPath($path), $md, (New-Object System.Text.UTF8Encoding($false)))
    return [pscustomobject]@{ ticketId = $Id; folder = (Resolve-Path -LiteralPath $Folder).Path; brief = (Resolve-Path -LiteralPath $path).Path; ticket = $t }
}

function Get-BugOutDevOpsToken {
    # The Azure DevOps credential Git Credential Manager already holds for this
    # repository's remote (the one `git push` uses). The request (just the
    # remote url, no secret) goes to `git credential fill` from a temp file via
    # cmd's < redirect: PowerShell's pipe mangles the trailing blank line the
    # protocol needs, and .NET's stdin writer prepends a byte-order mark that
    # corrupts the first field. The answer is read from a pipe, never written
    # to disk, never printed. $env:AZURE_DEVOPS_EXT_PAT wins when set.
    [CmdletBinding()] param([Parameter(Mandatory)][string]$RepoPath)
    if ($env:AZURE_DEVOPS_EXT_PAT) { return $env:AZURE_DEVOPS_EXT_PAT }
    $remote = (& git -C $RepoPath remote get-url origin 2>$null | Select-Object -First 1)
    if (-not $remote) { throw "No 'origin' remote in $RepoPath" }
    $request = [System.IO.Path]::GetTempFileName()
    [System.IO.File]::WriteAllText($request, "url=$remote`n`n", (New-Object System.Text.UTF8Encoding($false)))
    try {
        $psi = New-Object System.Diagnostics.ProcessStartInfo
        $psi.FileName = 'cmd.exe'
        $psi.Arguments = ('/d /c git credential fill < "{0}"' -f $request)
        $psi.WorkingDirectory = (Resolve-Path -LiteralPath $RepoPath).Path
        $psi.UseShellExecute = $false
        $psi.CreateNoWindow = $true
        $psi.RedirectStandardOutput = $true
        $psi.RedirectStandardError = $true
        $psi.EnvironmentVariables['GCM_INTERACTIVE'] = 'never'
        $psi.EnvironmentVariables['GIT_TERMINAL_PROMPT'] = '0'
        $p = [System.Diagnostics.Process]::Start($psi)
        $out = $p.StandardOutput.ReadToEnd()
        [void]$p.StandardError.ReadToEnd()
        $p.WaitForExit(30000) | Out-Null
    }
    finally { [System.IO.File]::Delete($request) }
    foreach ($line in ($out -split "`n")) {
        if ($line.StartsWith('password=')) { return $line.Substring(9).Trim() }
    }
    throw "Git Credential Manager has no credential for $remote. Run 'git fetch' in $RepoPath once (it signs you in), or set `$env:AZURE_DEVOPS_EXT_PAT."
}

function Get-BugOutDevOpsRepo {
    # org / project / repository from an Azure DevOps remote:
    #   https://protocall@dev.azure.com/protocall/WebbasedLLC/_git/ServiceManagerUI
    #   https://protocall.visualstudio.com/WebbasedLLC/_git/ServiceManagerUI
    [CmdletBinding()] param([Parameter(Mandatory)][string]$RepoPath)
    $remote = (& git -C $RepoPath remote get-url origin 2>$null | Select-Object -First 1)
    $m = [regex]::Match("$remote", 'dev\.azure\.com/(?<org>[^/]+)/(?<project>[^/]+)/_git/(?<repo>[^/?#]+)')
    if (-not $m.Success) { $m = [regex]::Match("$remote", '//(?:[^@/]+@)?(?<org>[^./]+)\.visualstudio\.com/(?:DefaultCollection/)?(?<project>[^/]+)/_git/(?<repo>[^/?#]+)') }
    if (-not $m.Success) { throw "origin of $RepoPath is not an Azure DevOps repository: $remote" }
    $repoName = ($m.Groups['repo'].Value -replace '\.git$', '')
    return [pscustomobject]@{
        org = [uri]::UnescapeDataString($m.Groups['org'].Value)
        project = [uri]::UnescapeDataString($m.Groups['project'].Value)
        repo = [uri]::UnescapeDataString($repoName)
    }
}

function New-BugOutPullRequest {
    # Opens the pull request for -Branch into -Target, or returns the one that
    # is already open for that branch (re-runs and rework update the same PR:
    # pushing to the branch is what updates it). Returns id, url, existing.
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$RepoPath,
        [Parameter(Mandatory)][string]$Branch,
        [string]$Target = 'dev',
        [Parameter(Mandatory)][string]$Title,
        [string]$Description = ''
    )
    $r = Get-BugOutDevOpsRepo -RepoPath $RepoPath
    $pat = Get-BugOutDevOpsToken -RepoPath $RepoPath
    $auth = 'Basic ' + [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes(":$pat"))
    $base = 'https://dev.azure.com/{0}/{1}/_apis/git/repositories/{2}/pullrequests' -f [uri]::EscapeDataString($r.org), [uri]::EscapeDataString($r.project), [uri]::EscapeDataString($r.repo)
    $web = 'https://dev.azure.com/{0}/{1}/_git/{2}/pullrequest/' -f $r.org, $r.project, $r.repo

    $find = '{0}?searchCriteria.sourceRefName={1}&searchCriteria.targetRefName={2}&searchCriteria.status=active&api-version=7.1' -f $base, [uri]::EscapeDataString("refs/heads/$Branch"), [uri]::EscapeDataString("refs/heads/$Target")
    $open = Invoke-RestMethod -Method Get -Uri $find -Headers @{ Authorization = $auth }
    if ($open.count -gt 0) {
        $pr = @($open.value)[0]
        return [pscustomobject]@{ id = $pr.pullRequestId; url = "$web$($pr.pullRequestId)"; repo = $r.repo; existing = $true }
    }
    if ($Description.Length -gt 3900) { $Description = $Description.Substring(0, 3900) + "`n..." }
    if ($Title.Length -gt 250) { $Title = $Title.Substring(0, 250) }
    $body = @{ sourceRefName = "refs/heads/$Branch"; targetRefName = "refs/heads/$Target"; title = $Title; description = $Description } | ConvertTo-Json -Depth 4
    $resp = Invoke-RestMethod -Method Post -Uri "$base`?api-version=7.1" -Headers @{ Authorization = $auth } -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($body))
    return [pscustomobject]@{ id = $resp.pullRequestId; url = "$web$($resp.pullRequestId)"; repo = $r.repo; existing = $false }
}

# ---------- Videos Managed ----------

function Get-VideosManagedRecording {
    # Reads a recording through the public API. The share page itself is a JS app.
    #   https://videos-dev.managedplatform.com/<account>/r/<slug>
    #   -> https://videos-api-dev.managedplatform.com/public/<account>/r/<slug>
    [CmdletBinding()]
    param([Parameter(Mandatory)][string]$Url, [string]$VideosApiBase = $script:VideosApiBase)

    $m = [regex]::Match($Url, '^https?://[^/]+/(?<account>[^/]+)/r/(?<slug>[^/?#]+)')
    if (-not $m.Success) { throw "Not a Videos Managed share link: $Url (expected https://videos-dev.managedplatform.com/<account>/r/<slug>)" }
    $api = '{0}/public/{1}/r/{2}' -f $VideosApiBase.TrimEnd('/'), $m.Groups['account'].Value, $m.Groups['slug'].Value
    $rec = Invoke-RestMethod -Method GET -Uri $api -ErrorAction Stop
    $text = $null
    if ($rec.PSObject.Properties.Name -contains 'captionsVtt' -and $rec.captionsVtt) { $text = ConvertFrom-WebVtt $rec.captionsVtt }
    $rec | Add-Member -NotePropertyName shareUrl -NotePropertyValue $Url -Force
    $rec | Add-Member -NotePropertyName transcriptText -NotePropertyValue $text -Force
    return $rec
}

function ConvertFrom-WebVtt {
    # Strips WEBVTT headers, cue timings and cue ids; collapses repeated lines.
    param([Parameter(Mandatory)][string]$Vtt)
    $lines = @()
    $last = $null
    foreach ($raw in ($Vtt -split "`r?`n")) {
        $line = $raw.Trim()
        if ($line -eq '' -or $line -eq 'WEBVTT' -or $line -match '^\d+$' -or $line -match '-->' -or $line -match '^(NOTE|STYLE|REGION)\b') { continue }
        $line = [regex]::Replace($line, '<[^>]+>', '')
        if ($line -eq $last) { continue }
        $lines += $line
        $last = $line
    }
    return ($lines -join ' ')
}

function New-BugOutOrderFromVideo {
    # The session protocol's first step in one call: read the recording, log the
    # order with the share link, the captions and the title (unless you give one).
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$VideoUrl,
        [Parameter(Mandatory)][string]$ProjectSlug,
        [string]$Title,
        [string]$Summary,
        [string]$SessionLogUrl,
        [string]$SessionId,
        [string]$OrderedBy,
        [ValidateSet('ORDERED', 'IN_PROGRESS', 'LOCAL_DEMO', 'PR_OPEN', 'MERGED_DEV', 'BETA', 'PRODUCTION', 'ANNOUNCED')]
        [string]$Stage = 'ORDERED',
        [object[]]$Links,
        [long]$ParentOrderId,
        [long]$DependsOnOrderId,
        [ValidateSet('IN_PROGRESS', 'LOCAL_DEMO', 'PR_OPEN', 'MERGED_DEV', 'BETA', 'PRODUCTION')]
        [string]$DependsOnStage,
        [object[]]$Tests,
        [string]$ConfigPath = $script:DefaultConfigPath
    )
    $transcript = $null
    $recTitle = $null
    try {
        $rec = Get-VideosManagedRecording -Url $VideoUrl
        if ($rec.PSObject.Properties.Name -contains 'captionsVtt') { $transcript = $rec.captionsVtt }
        if ($rec.PSObject.Properties.Name -contains 'title') { $recTitle = $rec.title }
    }
    catch {
        Write-Warning "Could not read the recording ($($_.Exception.Message)); logging the order with the link only."
    }
    if (-not $Title) {
        if ($recTitle) { $Title = $recTitle } else { throw 'Pass -Title: the recording has no title.' }
    }
    $extra = @{}
    foreach ($p in 'ParentOrderId', 'DependsOnOrderId', 'DependsOnStage', 'Tests') {
        if ($PSBoundParameters.ContainsKey($p)) { $extra[$p] = $PSBoundParameters[$p] }
    }
    New-BugOutOrder -ProjectSlug $ProjectSlug -Title $Title -Summary $Summary -VideoUrl $VideoUrl -Transcript $transcript `
        -SessionLogUrl $SessionLogUrl -SessionId $SessionId -OrderedBy $OrderedBy -Stage $Stage -Links $Links -ConfigPath $ConfigPath @extra
}

Export-ModuleMember -Function Get-BugOutDevConfig, Set-BugOutDevConfig, Invoke-BugOutDev,
    Get-BugOutProjects, Set-BugOutProject, Get-BugOutStages,
    Get-BugOutOrders, Get-BugOutOrder, New-BugOutOrder, Set-BugOutOrderStage, Update-BugOutOrder,
    Add-BugOutOrderLink, Remove-BugOutOrderLink, Get-BugOutShipped,
    New-BugOutInitiative, Add-BugOutPhase, Set-BugOutOrderPlacement,
    Get-BugOutTests, Add-BugOutTests, Set-BugOutTestResult, Start-BugOutTestRound, Get-BugOutTestChecklistMarkdown,
    Get-BugOutFixQueue, Get-BugOutFix, Get-BugOutFixApps, Request-BugOutFix, Start-BugOutFix, Reset-BugOutFix, Complete-BugOutFix,
    Get-BugOutWorkerName, Export-BugOutTicketBrief, Get-BugOutDevOpsToken, Get-BugOutDevOpsRepo, New-BugOutPullRequest,
    Get-VideosManagedRecording, ConvertFrom-WebVtt, New-BugOutOrderFromVideo
