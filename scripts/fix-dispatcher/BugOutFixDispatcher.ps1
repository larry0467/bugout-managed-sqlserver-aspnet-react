<#
.SYNOPSIS
  Devbox dispatcher for Bug Out's drafted-fix queue.

.DESCRIPTION
  Polls Bug Out (through the service key) for tickets flagged "fix requested" on the
  configured apps, claims the oldest, prepares git worktrees for the app's repos on a
  branch BugOut_Fix_<ticketId> (from origin/dev, or continuing that branch when an
  earlier attempt already pushed it), writes the ticket context to a folder, runs
  Claude Code headlessly there, then pushes what this run committed (never force),
  opens the Azure DevOps pull request against dev (or reuses the one already open)
  and reports READY_TO_TEST (or FAILED) back to Bug Out. It never merges. One ticket
  per run; a scheduled task runs it every few minutes.

  Any developer can run it on their own machine: Claude Code runs under whoever is
  logged in, so it uses that person's Claude plan. Set "assignedTo" in the config to
  your Bug Out email to take only the tickets triage handed to you ("none" on the
  shared devbox = only tickets nobody was assigned).

  Config: %USERPROFILE%\.bugout\fix-dispatcher.json (see fix-dispatcher.sample.json).
  Key:    %USERPROFILE%\.bugout\service-key.json
  Logs:   %USERPROFILE%\.bugout\logs\

.EXAMPLE
  .\BugOutFixDispatcher.ps1                 # normal scheduled pass
  .\BugOutFixDispatcher.ps1 -DryRun         # show the queue and what would run, change nothing
  .\BugOutFixDispatcher.ps1 -TicketId 431   # work this ticket (it must be REQUESTED)
#>
[CmdletBinding()]
param(
    [string]$ConfigPath = (Join-Path $env:USERPROFILE '.bugout\fix-dispatcher.json'),
    [string]$KeyPath = (Join-Path $env:USERPROFILE '.bugout\service-key.json'),
    [long]$TicketId = 0,
    [switch]$DryRun,
    [switch]$KeepWorktrees
)

$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot '..\BugOutDev.psm1') -Force

# ---------- setup ----------
$bugoutDir = Join-Path $env:USERPROFILE '.bugout'
$logDir = Join-Path $bugoutDir 'logs'
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
$script:LogFile = Join-Path $logDir ("dispatcher-{0:yyyyMMdd}.log" -f (Get-Date))

function Log([string]$Message) {
    $line = '{0:yyyy-MM-dd HH:mm:ss} {1}' -f (Get-Date), $Message
    Write-Host $line
    Add-Content -LiteralPath $script:LogFile -Value $line -Encoding UTF8
}

function Prop($Object, [string]$Name, $Default) {
    if ($null -eq $Object) { return $Default }
    if ($Object -is [hashtable]) { if ($Object.ContainsKey($Name)) { return $Object[$Name] } else { return $Default } }
    if ($Object.PSObject.Properties.Name -contains $Name -and $null -ne $Object.$Name) { return $Object.$Name }
    return $Default
}

function Invoke-Git([string]$Dir, [string[]]$GitArgs) {
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $out = & git -C $Dir @GitArgs 2>&1 | ForEach-Object { "$_" }
        $code = $LASTEXITCODE
    }
    finally { $ErrorActionPreference = $prev }
    if ($code -ne 0) { throw "git $($GitArgs -join ' ') failed ($code) in ${Dir}: $($out -join ' | ')" }
    return $out
}

function Write-Utf8([string]$Path, [string]$Content) {
    [System.IO.File]::WriteAllText([System.IO.Path]::GetFullPath($Path), $Content, (New-Object System.Text.UTF8Encoding($false)))
}

# Pull requests go through New-BugOutPullRequest (BugOutDev.psm1): it reads
# the credential for the repository's own remote and returns the PR that is
# already open for the branch instead of failing on a duplicate, so a re-run
# after "Reject and re-queue" updates the same PR.

function Test-RemoteBranch([string]$Dir, [string]$Branch) {
    $out = @(Invoke-Git $Dir @('ls-remote', '--heads', 'origin', $Branch))
    return (@($out | Where-Object { $_ -match "refs/heads/$([regex]::Escape($Branch))$" }).Count -gt 0)
}

function Resolve-ClaudeCommand {
    $cmd = Get-Command claude -ErrorAction SilentlyContinue
    if (-not $cmd) { throw 'claude (Claude Code CLI) is not on PATH for this user' }
    return $cmd.Source
}

# ---------- config ----------
if (-not (Test-Path -LiteralPath $ConfigPath)) {
    throw "No dispatcher config at $ConfigPath. Copy scripts\fix-dispatcher\fix-dispatcher.sample.json there and adjust the repo paths."
}
$cfg = Get-Content -LiteralPath $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
$worker = '{0} {1}' -f (Prop $cfg 'worker' 'devbox'), $env:COMPUTERNAME
$pollProjects = @(Prop $cfg 'pollProjects' @())
$maxPerDay = [int](Prop $cfg 'maxPerDay' 6)
$maxMinutes = [int](Prop $cfg 'maxMinutesPerFix' 45)
$workRoot = Prop $cfg 'workRoot' (Join-Path $env:USERPROFILE '.bugout\work')
$claudeCfg = Prop $cfg 'claude' $null
$devops = Prop $cfg 'devops' $null
# Who this dispatcher works for: "none" = tickets nobody was assigned (the
# devbox), an email = tickets triage handed to that developer (their machine,
# their Claude plan). Empty = every queued ticket (the old behaviour).
$assignedTo = [string](Prop $cfg 'assignedTo' '')

# ---------- lock + daily cap ----------
$lock = Join-Path $bugoutDir 'fix-dispatcher.lock'
if (Test-Path $lock) {
    $age = (Get-Date) - (Get-Item $lock).LastWriteTime
    if ($age.TotalMinutes -lt ($maxMinutes * 2)) { Log "another dispatcher run is active ($([int]$age.TotalMinutes) min old lock); exiting"; exit 0 }
    Log 'stale lock removed'
    Remove-Item $lock -Force
}
if (-not $DryRun) { Set-Content -LiteralPath $lock -Value $PID }

try {
    $today = (Get-Date).Date
    $doneToday = @(Get-ChildItem $logDir -Filter 'fix-*.log' -ErrorAction SilentlyContinue | Where-Object { $_.LastWriteTime -ge $today }).Count
    if ($doneToday -ge $maxPerDay -and -not $DryRun -and $TicketId -eq 0) {
        Log "daily cap reached ($doneToday of $maxPerDay); exiting"
        exit 0
    }

    # ---------- pick a ticket ----------
    $item = $null
    if ($TicketId -gt 0) {
        $item = Get-BugOutFix -Id $TicketId -ConfigPath $KeyPath
        if ($item.fixStatus -ne 'REQUESTED') { throw "Ticket #$TicketId is '$($item.fixStatus)', not REQUESTED" }
    }
    else {
        $queue = @()
        foreach ($slug in $pollProjects) {
            if ($assignedTo) { $queue += @(Get-BugOutFixQueue -ProjectSlug $slug -Status REQUESTED -Take 20 -AssignedTo $assignedTo -ConfigPath $KeyPath) }
            else { $queue += @(Get-BugOutFixQueue -ProjectSlug $slug -Status REQUESTED -Take 20 -ConfigPath $KeyPath) }
        }
        # Belt and braces: an older API ignores assignedTo, so filter here too.
        if ($assignedTo -eq 'none') { $queue = @($queue | Where-Object { -not ((Prop $_ 'assigneeType' $null) -eq 'HUMAN' -and (Prop $_ 'assignedTo' $null)) }) }
        elseif ($assignedTo) { $queue = @($queue | Where-Object { (Prop $_ 'assigneeType' $null) -eq 'HUMAN' -and ([string](Prop $_ 'assignedTo' '')).ToLower() -eq $assignedTo.ToLower() }) }
        $queue = @($queue | Sort-Object fixRequestedAt)
        if ($DryRun) {
            Log "queue: $($queue.Count) item(s)"
            foreach ($q in $queue) { Log ("  #{0} [{1}] {2}: {3}" -f $q.ticketId, $q.projectSlug, $q.fixRequestedAt, $q.title) }
        }
        foreach ($q in $queue) {
            if ($null -ne (Prop (Prop $cfg 'apps' $null) $q.projectSlug $null)) { $item = $q; break }
            Log "skipping #$($q.ticketId): app '$($q.projectSlug)' has no repo mapping in $ConfigPath"
        }
    }
    if ($null -eq $item) { if (-not $DryRun) { Log 'queue empty' }; exit 0 }

    $app = Prop (Prop $cfg 'apps' $null) $item.projectSlug $null
    if ($null -eq $app) { throw "app '$($item.projectSlug)' has no repo mapping" }
    $repos = @(Prop $app 'repos' @())
    if ($repos.Count -eq 0) { throw "app '$($item.projectSlug)' has no repos configured" }

    $id = [long]$item.ticketId
    $branch = "BugOut_Fix_$id"
    $ticketRoot = Join-Path $workRoot "$id"
    Log "ticket #$id [$($item.projectSlug)] '$($item.title)' -> $ticketRoot (branch $branch)"
    if ($DryRun) { Log 'dry run: not claiming'; exit 0 }

    $fixLog = Join-Path $logDir "fix-$id.log"
    Add-Content -LiteralPath $fixLog -Value ("{0:o} claimed by {1}" -f (Get-Date), $worker) -Encoding UTF8

    # ---------- claim ----------
    $claimed = Start-BugOutFix -Id $id -Worker $worker -ConfigPath $KeyPath
    Log "claimed #$id (status $($claimed.fixStatus))"
    $item = $claimed

    $outcome = 'FAILED'
    $summary = $null
    $testingNotes = $null
    $links = @()

    try {
        # ---------- worktrees ----------
        if (Test-Path $ticketRoot) { Remove-Item $ticketRoot -Recurse -Force -ErrorAction SilentlyContinue }
        New-Item -ItemType Directory -Path $ticketRoot -Force | Out-Null
        $wtPaths = @()
        $startShas = @{}
        $continued = @()
        foreach ($repo in $repos) {
            $wt = Join-Path $ticketRoot $repo.folder
            Invoke-Git $repo.git @('fetch', 'origin', $repo.baseBranch, '--quiet') | Out-Null
            Invoke-Git $repo.git @('worktree', 'prune') | Out-Null
            # A previous attempt (or a developer) already pushed this branch:
            # continue on it so rework lands in the same branch and PR.
            if (Test-RemoteBranch $repo.git $branch) {
                Invoke-Git $repo.git @('fetch', 'origin', "+refs/heads/${branch}:refs/remotes/origin/$branch", '--quiet') | Out-Null
                Log "worktree $($repo.name): $wt continuing origin/$branch"
                Invoke-Git $repo.git @('worktree', 'add', '-B', $branch, $wt, "origin/$branch", '--quiet') | Out-Null
                $continued += $repo.name
            }
            else {
                Log "worktree $($repo.name): $wt from origin/$($repo.baseBranch)"
                Invoke-Git $repo.git @('worktree', 'add', '-B', $branch, $wt, "origin/$($repo.baseBranch)", '--quiet') | Out-Null
            }
            $startShas[$repo.name] = (@(Invoke-Git $wt @('rev-parse', 'HEAD')) | Select-Object -First 1).Trim()
            $wtPaths += $wt
        }

        # ---------- context files ----------
        $attDir = Join-Path $ticketRoot 'attachments'
        New-Item -ItemType Directory -Path $attDir -Force | Out-Null
        $attLines = @()
        foreach ($a in @(Prop $item 'attachments' @())) {
            if ($a.url) {
                $safe = ($a.fileName -replace '[^\w\.\-]', '_')
                try { Invoke-WebRequest -Uri $a.url -OutFile (Join-Path $attDir $safe) -UseBasicParsing -TimeoutSec 60; $attLines += "- attachments\$safe ($($a.contentType), $($a.sizeBytes) bytes$(if ($a.fromChat) { ', from chat' }))" }
                catch { $attLines += "- $($a.fileName): could not download ($($_.Exception.Message))" }
            }
            else { $attLines += "- $($a.fileName) (no url)" }
        }

        $ticketMd = @"
# Bug Out ticket #$id — $($item.title)

- App: $($item.projectName) ($($item.projectSlug))
- Type / priority / status: $($item.ticketType) / $($item.priority) / $($item.status)
- Reported by: $($item.submittedBy) at $($item.createdAt)
- Page: $($item.currentPageName) — $($item.currentPageUrl)
- Browser: $($item.browserInfo) ($($item.screenWidth)x$($item.screenHeight))
- Tenant: $($item.tenantName) ($($item.tenantId)) db $($item.databaseName) · app version $($item.applicationVersion) · environment $($item.environment)
- Bug Out board: $($item.boardUrl)
$(if ($item.triageDecision) { "- Triage: $($item.triageDecisionLabel) by $($item.triagedBy) at $($item.triagedAt)" })
$(if ($item.fixFeedback) { "- Guidance from the person who sent this (or feedback on a previous attempt): $($item.fixFeedback)" })

## Description
$($item.description)
$(if ($item.guidanceVideoUrl) { "`n## How it should work (a second video recorded by Larry or a developer)`nVideo: $($item.guidanceVideoUrl)`n`n$(if ($item.guidanceTranscript) { $item.guidanceTranscript } else { '(no transcript available; follow the guidance note above)' })`n`nThis video describes the intended behaviour and overrides anything in the original report that conflicts with it." })

## What the reporter said (voice transcript of the screen recording)
$($item.transcript)

## Console errors
``````
$($item.consoleErrors)
``````

## Network errors
``````
$($item.networkErrors)
``````

## Attachments (screenshots and files; images can be read directly)
$($attLines -join "`n")

$(if ($item.testingNotes) { "## Existing testing notes`n$($item.testingNotes)" })
"@
        Write-Utf8 (Join-Path $ticketRoot 'TICKET.md') $ticketMd

        $repoLines = foreach ($r in $repos) {
            $from = if ($continued -contains $r.name) { "continuing the existing ``origin/$branch`` (a previous attempt)" } else { "from ``origin/$($r.baseBranch)``" }
            "- ``$($r.folder)\`` = $($r.name) ($($r.kind)), branch ``$branch`` $from. Build: ``$($r.build)``"
        }
        $reworkNote = ''
        if ($continued.Count -gt 0) {
            $reworkNote = "`nThis is REWORK: a previous attempt is already on the branch and its PR is open. Read the feedback in TICKET.md, look at what the earlier commits did (git log origin/$($repos[0].baseBranch)..HEAD), and change only what the feedback asks for. Add new commits; do not rewrite or revert history unless the feedback says the earlier approach was wrong.`n"
        }
        $instructions = @"
You are drafting a fix for Bug Out ticket #$id in $($item.projectName). Read TICKET.md in this folder first; screenshots are in attachments\.
$reworkNote
Repositories (git worktrees in this folder; each is already on branch $branch):
$($repoLines -join "`n")

$(Prop $app 'context' '')

Rules
1. Reproduce from the transcript, page URL, console errors and screenshots; find the root cause before changing anything. Read the repo's CLAUDE.md if it has one and follow its conventions.
2. Make the smallest correct change. No new packages, no refactors beyond the fix, no schema changes unless the bug cannot be fixed without one (then say so in the summary).
3. Build what you touched with the build command above and fix compile errors. Run existing tests near the change when they are quick.
4. Commit in each repo you changed, on the current branch: git add -A && git commit -m "BugOut #${id}: <short description>". Do NOT push, do NOT switch branches, do NOT touch files outside this folder.
5. If you cannot find the cause, or the fix needs a product decision, do not guess: report FAILED with what you learned and what a human should decide.
6. Finish within $maxMinutes minutes by writing RESULT.json in this folder, UTF-8, exactly this shape:
   { "outcome": "READY_TO_TEST" | "FAILED",
     "summary": "<markdown: what was wrong, what changed, which files>",
     "testingNotes": "<what a tester should open, do and expect>",
     "reason": "<only for FAILED>" }
"@
        Write-Utf8 (Join-Path $ticketRoot 'INSTRUCTIONS.md') $instructions

        # ---------- run Claude Code ----------
        $claudePath = Resolve-ClaudeCommand
        $model = Prop $claudeCfg 'model' 'sonnet'
        $permission = Prop $claudeCfg 'permissionMode' 'acceptEdits'
        $tools = @(Prop $claudeCfg 'allowedTools' @('Read', 'Edit', 'Write', 'Glob', 'Grep', 'Bash(git *)', 'Bash(dotnet *)', 'Bash(npm *)'))

        $argList = @('-p', '"Read INSTRUCTIONS.md in the current folder and do exactly what it says."',
            '--output-format', 'json', '--permission-mode', $permission, '--model', $model)
        foreach ($p in $wtPaths) { $argList += @('--add-dir', ('"{0}"' -f $p)) }
        $argList += '--allowedTools'
        foreach ($t in $tools) { $argList += ('"{0}"' -f $t) }

        $stdout = Join-Path $ticketRoot 'claude-output.json'
        $stderr = Join-Path $ticketRoot 'claude-stderr.txt'
        Log "running Claude Code ($model, up to $maxMinutes min)"
        $started = Get-Date
        if ($claudePath.ToLower().EndsWith('.cmd') -or $claudePath.ToLower().EndsWith('.bat')) {
            $proc = Start-Process -FilePath 'cmd.exe' -ArgumentList (@('/d', '/c', ('"{0}"' -f $claudePath)) + $argList) -WorkingDirectory $ticketRoot -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru -NoNewWindow
        }
        else {
            $proc = Start-Process -FilePath $claudePath -ArgumentList $argList -WorkingDirectory $ticketRoot -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru -NoNewWindow
        }
        $finished = $proc.WaitForExit($maxMinutes * 60 * 1000)
        if (-not $finished) {
            Log 'Claude Code exceeded the time budget; stopping it'
            & taskkill /PID $proc.Id /T /F 2>&1 | Out-Null
            throw "Claude Code did not finish within $maxMinutes minutes"
        }
        $elapsed = [int]((Get-Date) - $started).TotalMinutes
        Log "Claude Code exited $($proc.ExitCode) after $elapsed min"

        # ---------- result ----------
        $resultPath = Join-Path $ticketRoot 'RESULT.json'
        if (Test-Path $resultPath) {
            $result = Get-Content -LiteralPath $resultPath -Raw -Encoding UTF8 | ConvertFrom-Json
            $summary = [string](Prop $result 'summary' '')
            $testingNotes = [string](Prop $result 'testingNotes' '')
            $declared = [string](Prop $result 'outcome' 'FAILED')
            $reason = [string](Prop $result 'reason' '')
        }
        else {
            $declared = 'FAILED'
            $reason = 'Claude Code finished without writing RESULT.json'
            try { $raw = Get-Content -LiteralPath $stdout -Raw -Encoding UTF8 | ConvertFrom-Json; $summary = [string](Prop $raw 'result' '') } catch { $summary = '' }
        }

        # ---------- push + PRs ----------
        $touched = @()
        foreach ($repo in $repos) {
            $wt = Join-Path $ticketRoot $repo.folder
            # Only what THIS run committed counts (a continued branch already has commits).
            $ahead = @(Invoke-Git $wt @('log', '--oneline', "$($startShas[$repo.name])..HEAD")) | Where-Object { $_ }
            if ($ahead.Count -gt 0) { $touched += [pscustomobject]@{ repo = $repo; wt = $wt; commits = $ahead } }
        }

        if ($declared -eq 'READY_TO_TEST' -and $touched.Count -eq 0) {
            $declared = 'FAILED'
            $reason = 'Claude reported a fix but committed nothing'
        }

        if ($declared -eq 'READY_TO_TEST') {
            foreach ($t in $touched) {
                Log "pushing $($t.repo.name) $branch ($($t.commits.Count) new commit(s))"
                # Plain push, never force: the branch either did not exist or we
                # built on top of it, so this is a fast-forward and nobody's
                # commits are overwritten.
                Invoke-Git $t.wt @('push', '-u', 'origin', $branch, '--quiet') | Out-Null
                $links += @{ kind = 'BRANCH'; repo = $t.repo.name; name = $branch; url = "https://dev.azure.com/$($devops.org)/$($devops.project)/_git/$($t.repo.name)?version=GB$branch" }

                $prTitle = "BugOut #${id}: $($item.title)"
                if ($prTitle.Length -gt 250) { $prTitle = $prTitle.Substring(0, 250) }
                $prBody = @"
Drafted by Claude Code ($worker) from Bug Out ticket #$id ($($item.projectName)). **Review before merging** — nothing is merged or deployed automatically.

Deploy target: beta

**Ticket:** $($item.boardUrl)
**Reported by:** $($item.submittedBy) — "$($item.title)"

## What changed
$summary

## How to test
$testingNotes

Commits: $($t.commits -join '; ')

🤖 Generated with [Claude Code](https://claude.com/claude-code)
"@
                try {
                    $pr = New-BugOutPullRequest -RepoPath $t.wt -Branch $branch -Target $t.repo.baseBranch -Title $prTitle -Description $prBody
                    if ($pr.existing) { Log "PR $($pr.id) already open; the push updated it: $($pr.url)" } else { Log "PR $($pr.id) opened: $($pr.url)" }
                    $links += @{ kind = 'PR'; repo = $t.repo.name; name = "PR $($pr.id)"; url = $pr.url; note = "into $($t.repo.baseBranch)" }
                }
                catch {
                    Log "PR creation failed for $($t.repo.name): $($_.Exception.Message) — branch is pushed; open the PR by hand"
                    $summary += "`n`nNote: the branch $branch is pushed to $($t.repo.name) but the pull request could not be created automatically ($($_.Exception.Message))."
                }
            }
            $outcome = 'READY_TO_TEST'
        }
        else {
            $outcome = 'FAILED'
            if (-not $summary) { $summary = $reason } elseif ($reason) { $summary = "$reason`n`n$summary" }
        }
    }
    catch {
        $outcome = 'FAILED'
        $summary = "Dispatcher error: $($_.Exception.Message)"
        Log $summary
    }

    # ---------- report ----------
    try {
        $reported = Complete-BugOutFix -Id $id -Outcome $outcome -Summary $summary -TestingNotes $testingNotes -Links $links -ConfigPath $KeyPath
        Log "reported #$id as $($reported.fixStatus) with $($links.Count) link(s)"
    }
    catch {
        Log "could not report the result ($($_.Exception.Message)); releasing the claim"
        try { Reset-BugOutFix -Id $id -ConfigPath $KeyPath | Out-Null } catch { Log "release failed too: $($_.Exception.Message)" }
    }
    Add-Content -LiteralPath $fixLog -Value ("{0:o} {1}`n{2}" -f (Get-Date), $outcome, $summary) -Encoding UTF8

    # ---------- cleanup (disk is tight on the devbox) ----------
    if (-not $KeepWorktrees) {
        foreach ($repo in $repos) {
            $wt = Join-Path $ticketRoot $repo.folder
            if (Test-Path $wt) { try { Invoke-Git $repo.git @('worktree', 'remove', '--force', $wt) | Out-Null } catch { Log "worktree remove failed: $($_.Exception.Message)" } }
        }
        try { Remove-Item $ticketRoot -Recurse -Force -ErrorAction SilentlyContinue } catch { }
        Log "cleaned $ticketRoot"
    }
    else { Log "kept worktrees under $ticketRoot" }
}
finally {
    if (-not $DryRun) { Remove-Item $lock -Force -ErrorAction SilentlyContinue }
}
