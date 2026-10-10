---
name: bugout
description: Work Bug Out Managed tickets and development orders from this Claude Code session on the developer's own Claude plan. List the tickets assigned to me, take one (claim it, read the brief, branch), finish it (write the test checklist, push, open or update the Azure DevOps PR, report "fix ready to test"), release it, rework it after a rejection, log my own work (as a phase of an initiative when it continues one) and move stages on the Development board. Use when the user mentions Bug Out, a ticket number to fix, the Development board, a test checklist, or says mine / take / done / release / log / stage.
---

# Bug Out: working tickets in your own Claude Code session

Bug Out Managed (https://bugout.managedplatform.com) tracks every bug report and every piece of
ordered development from the screen recording that asked for it to production. Larry or a
developer watches the recording and decides; tickets sent to a developer land in that
developer's queue. This skill does the developer's side: take the ticket, fix it here, open the
pull request, and report back so Larry can approve it. Bug Out only tracks; all code work happens
in this session, on this developer's Claude plan.

The user says what they want after `/bugout`, for example `mine`, `take 1234`, `done 1234`,
`release 1234`, `log`, or `stage 1234 MERGED_DEV`. If they did not say, show `mine`.

## Setup facts (installed by Install-BugOutDevKit.ps1)

- All calls go through the PowerShell module. Start every PowerShell command with:
  `Import-Module "$env:USERPROFILE\.bugout\kit\BugOutDev.psm1" -Force`
- The Bug Out key lives in `%USERPROFILE%\.bugout\service-key.json` (with the developer's `me` email
  and `name`). Azure DevOps access comes from Git Credential Manager (the same login `git push` uses).
- **Never print, echo, log, commit or paste the Bug Out key or the Azure DevOps token.** Never put
  them in files, PR text or chat. The module reads them itself.
- Repository paths per app: `%USERPROFILE%\.bugout\fix-dispatcher.json` -> `apps.<slug>.repos[]`
  (`name`, `git` = local path, `baseBranch`, `build`). Service Managed is `service-managed`:
  `ServiceManagerUI` (API, C#) and `ServiceManagedWeb` (web, React). If the file is missing, use the
  repository this session is open in and ask for the other path when the fix needs it.
- Windows PowerShell 5.1: no ternary, no `??`, no `&&` between cmdlets.

## mine

```powershell
Get-BugOutFixQueue -Mine                       # sent to me, not started
Get-BugOutFixQueue -Mine -Status CLAIMED       # I am working on these
Get-BugOutFixQueue -Mine -Status READY_TO_TEST # waiting for Larry's approval
Get-BugOutFixQueue -Mine -Status APPROVED      # approved: merge the PR
```

Show a short table: ticket id, app, title, status, when it was requested. Mention that unassigned
tickets (`Get-BugOutFixQueue -AssignedTo none`) belong to the devbox unless Larry says otherwise.

## take <id>

1. `$t = Get-BugOutFix -Id <id>`.
   - `fixStatus` REQUESTED: claim it with `Start-BugOutFix -Id <id>`. A 409 means someone else got it
     first: stop and say who (`fixClaimedBy`).
   - CLAIMED by this developer (`fixClaimedBy` starts with the `name` in the key file): carry on.
   - Not queued (empty): ask the user before queueing it with `Request-BugOutFix -Id <id> -Note '...'`.
2. `$b = Export-BugOutTicketBrief -Id <id>` and read `$b.brief` (TICKET.md). Look at the screenshots in
   the `attachments` folder next to it. The **guidance / feedback** section overrides the original
   report where they conflict (it is what Larry or a developer decided after watching the video).
3. In each repository you will change: the working tree must be clean (if not, ask the user to commit
   or stash; never discard their work). Then:
   ```
   git fetch origin
   git ls-remote --heads origin BugOut_Fix_<id>
   ```
   - Branch exists on origin: `git switch BugOut_Fix_<id>` (or `git switch -c BugOut_Fix_<id> --track origin/BugOut_Fix_<id>`).
     This is **rework**: read the feedback and the earlier commits (`git log origin/dev..HEAD`); change only
     what the feedback asks for, with new commits on top.
   - Otherwise: `git switch -c BugOut_Fix_<id> origin/dev`.
4. Reproduce from the transcript, page URL, console and network errors and screenshots. Find the root
   cause before changing anything. Follow the repository's CLAUDE.md. Make the smallest correct change;
   no unrelated refactors or new packages. A schema change needs a migration script in the same PR and a
   "run the migration first" line in the testing notes.
5. Build what you touched (the repo's `build` command) and run the quick tests near the change.
6. Write the **test checklist** for whoever tests it: 3-10 concrete lines from what you actually changed, each
   with what to do, what they should see, and where it can be tried (LOCAL, DEV, BETA or ANY). Include the
   regression check next to the change (what must still work). Real record numbers when you know them.
   ```powershell
   Add-BugOutTests -Id <id> -Replace -Tests @(
     @{ text = 'Open WO 90001 > Estimates, click Draft with AI'; expected = 'The draft lists This price assumes / Not included'; environment = 'LOCAL' },
     @{ text = 'Approve the quote, then reopen it'; expected = 'Totals unchanged (regression)'; environment = 'ANY' }
   )
   ```
7. Show the user the diff, a two-line summary and the checklist, and **wait for their OK** before pushing.
   The developer owns what goes up.

## done <id> (after the user said OK)

1. Commit in each changed repository: `git commit -m "BugOut #<id>: <short description>"`.
2. Push: `git push -u origin BugOut_Fix_<id>`. **Never force-push.** Never push to dev, beta or master.
3. For each pushed repository:
   ```powershell
   $pr = New-BugOutPullRequest -RepoPath '<repo path>' -Branch 'BugOut_Fix_<id>' -Target dev `
           -Title 'BugOut #<id>: <ticket title>' -Description $body
   ```
   `$body` (markdown) must contain: what was wrong and what changed; the test checklist from
   `Get-BugOutTestChecklistMarkdown -Id <id>` (testers record Pass / Fail on the board, not in the PR);
   the line `Deploy target: beta`; `**Ticket:** <boardUrl>`; `**Recording:** <videoUrl>` when there is one;
   and end with `Generated with Claude Code`. If `$pr.existing` is true the PR was already open and the
   push updated it.
4. Report:
   ```powershell
   Complete-BugOutFix -Id <id> -Outcome READY_TO_TEST -Summary $summary -TestingNotes $steps -Links @(
     @{ kind = 'BRANCH'; repo = 'ServiceManagerUI'; name = 'BugOut_Fix_<id>'; url = 'https://dev.azure.com/protocall/WebbasedLLC/_git/ServiceManagerUI?version=GBBugOut_Fix_<id>' },
     @{ kind = 'PR'; repo = 'ServiceManagerUI'; name = "PR $($pr.id)"; url = $pr.url; note = 'into dev' }
   )
   ```
   One BRANCH and one PR link per repository you pushed. The ticket shows **Fix ready to test** and sits on
   the Development board at PR open; Larry approves or rejects it on the ticket.
5. If you could not find the cause, or the fix needs a product decision, do not guess: push nothing and
   report `Complete-BugOutFix -Id <id> -Outcome FAILED -Summary '<what you learned and what a person must decide>'`.

## release <id>

`Reset-BugOutFix -Id <id>` puts a claimed ticket back in the queue (you are stopping or handing it on).

## After Larry decides

- **Approved**: the go-ahead to merge. Merge the PR into dev in Azure DevOps the usual way. The board moves
  itself (Merged to dev, then Beta and Production on the deployments) once the Azure DevOps webhook is
  connected. Until then move it by hand: `Set-BugOutOrderStage -Id <id> -Stage MERGED_DEV -Note 'PR <n> merged'`.
- **Rejected and re-queued**: the ticket is back in `mine` with the feedback. `take <id>` again: you continue
  on the same branch, the push updates the same PR, and `done <id>` reports it ready again.
- **Rejected, not re-queued**: nothing to do unless Larry asks.
- Review comments on the PR: push more commits to the same branch; the PR updates and Bug Out needs nothing.

## log (work that did not start as a ticket)

```powershell
# Larry ordered it in a Videos Managed recording:
$o = New-BugOutOrderFromVideo -VideoUrl '<share link>' -ProjectSlug service-managed -Title '<title>' -Summary '<what was asked>' -Stage IN_PROGRESS
# or a plain task:
$o = New-BugOutOrder -ProjectSlug service-managed -Title '<title>' -Summary '<what and why>' -Stage IN_PROGRESS
$o.order.boardUrl   # put this in the PR description; the webhook then links the PR by itself
```

Add links by hand when needed: `Add-BugOutOrderLink -Id <id> -Kind PR -Repo ServiceManagerUI -Name 'PR 4401' -Url '<url>' -Note 'into dev'`.

**One effort, several videos = one initiative.** Before logging, look for an existing initiative or order the new
video continues (`Get-BugOutOrders -ProjectSlug <app> -Search '<keyword>'`; initiatives have `isInitiative`). If it
continues one, log it as the next phase and say what it is stacked on (the order whose branch you branch from):

```powershell
$o = New-BugOutOrderFromVideo -VideoUrl '<share link>' -ProjectSlug service-managed -ParentOrderId <initiative id> -DependsOnOrderId <base order id>
# Related orders that are not grouped yet:
New-BugOutInitiative -Title '<the whole effort>' -OrderIds <oldest>, <next>, <next>    # each builds on the one before
# Waits for another order to be LIVE (a mobile build on its API), not just merged:
Set-BugOutOrderPlacement -Id <id> -InitiativeId <initiative id> -DependsOnOrderId <api order> -DependsOnStage PRODUCTION
```

The board flags a phase **ahead of** its base (merged or deployed before what it is stacked on); merge in phase order.
An initiative's stage follows its phases: move the phases, never the initiative.

Every logged order gets a test checklist (`Add-BugOutTests`, see `take` step 6) before it reaches local demo / PR open.

## stage <id> <STAGE>

`Set-BugOutOrderStage -Id <id> -Stage <STAGE> -Note '<why>'` with one of
ORDERED, IN_PROGRESS, LOCAL_DEMO, PR_OPEN, MERGED_DEV, BETA, PRODUCTION, ANNOUNCED.

## Rules

- Never merge, deploy, force-push or push to dev / beta / master. People merge; pipelines deploy.
- One ticket, one branch: `BugOut_Fix_<id>`. Do not mix tickets in a branch.
- Never print or store secrets (Bug Out key, Azure DevOps token).
- If a module call fails with 401 the key is wrong or revoked: tell the user to ask Larry for a new one.
