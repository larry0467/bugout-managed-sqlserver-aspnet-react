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
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$Key,
        [string]$ApiBase = $script:DefaultApiBase,
        [string]$Org,
        [string]$Path = $script:DefaultConfigPath
    )
    if (-not $Key.StartsWith('bsk_')) { throw "That does not look like a Bug Out service key (expected the bsk_ prefix)." }
    $dir = Split-Path -Parent $Path
    if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    $obj = [ordered]@{ key = $Key; apiBase = $ApiBase.TrimEnd('/') }
    if ($Org) { $obj.org = $Org }
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
    Invoke-BugOutDev -Method POST -Path 'orders' -Body $body -ConfigPath $ConfigPath
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
    [CmdletBinding()]
    param(
        [string]$ProjectSlug,
        [ValidateSet('REQUESTED', 'CLAIMED', 'READY_TO_TEST', 'FAILED', 'APPROVED', 'REJECTED')][string]$Status = 'REQUESTED',
        [int]$Take = 20,
        [string]$ConfigPath = $script:DefaultConfigPath
    )
    $q = @{ status = $Status; take = $Take }
    if ($ProjectSlug) { $q.projectSlug = $ProjectSlug }
    Invoke-BugOutDev -Method GET -Path 'fixes/queue' -Query $q -ConfigPath $ConfigPath
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
    [CmdletBinding()] param([Parameter(Mandatory)][long]$Id, [string]$Worker = "devbox $env:COMPUTERNAME", [string]$ConfigPath = $script:DefaultConfigPath)
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
    New-BugOutOrder -ProjectSlug $ProjectSlug -Title $Title -Summary $Summary -VideoUrl $VideoUrl -Transcript $transcript `
        -SessionLogUrl $SessionLogUrl -SessionId $SessionId -OrderedBy $OrderedBy -Stage $Stage -Links $Links -ConfigPath $ConfigPath
}

Export-ModuleMember -Function Get-BugOutDevConfig, Set-BugOutDevConfig, Invoke-BugOutDev,
    Get-BugOutProjects, Set-BugOutProject, Get-BugOutStages,
    Get-BugOutOrders, Get-BugOutOrder, New-BugOutOrder, Set-BugOutOrderStage, Update-BugOutOrder,
    Add-BugOutOrderLink, Remove-BugOutOrderLink, Get-BugOutShipped,
    Get-BugOutFixQueue, Get-BugOutFix, Get-BugOutFixApps, Request-BugOutFix, Start-BugOutFix, Reset-BugOutFix, Complete-BugOutFix,
    Get-VideosManagedRecording, ConvertFrom-WebVtt, New-BugOutOrderFromVideo
