Bug Out developer kit
=====================

Work Bug Out tickets in your own Claude Code session, on your own Claude plan.
The full workflow is in "Bug Out Development - Team Workflow.pdf" (from Larry).

What you need first
- Your Bug Out login (role Developer) and your personal service key file
  (service-key.json) from Larry. Keep the key private: never paste it into chat,
  email, commits or PR text.
- Claude Code installed and signed in with YOUR Claude account.
- Your clones of ServiceManagerUI and ServiceManagedWeb, with "git fetch" working.

Install (Windows PowerShell, from this folder)
  powershell -ExecutionPolicy Bypass -File .\Install-BugOutDevKit.ps1 `
      -KeyFile "$env:USERPROFILE\Downloads\service-key.json" `
      -Email you@protocall.co -Name YourFirstName `
      -ApiRepo C:\path\to\ServiceManagerUI -WebRepo C:\path\to\ServiceManagedWeb

Then delete the downloaded service-key.json, open Claude Code in one of your
repositories and type:   /bugout mine

Everyday commands (typed in Claude Code)
  /bugout mine          tickets sent to you, in progress, waiting for approval
  /bugout take 1234     claim ticket 1234, read its brief, create BugOut_Fix_1234
  /bugout done 1234     push, open (or update) the PR into dev, report "fix ready to test"
  /bugout release 1234  give a ticket back to the queue
  /bugout log           put work that did not start as a ticket on the Development board
  /bugout stage 1234 MERGED_DEV   move a board item by hand

Files the installer creates
  %USERPROFILE%\.bugout\service-key.json      your key + email + name (private)
  %USERPROFILE%\.bugout\fix-dispatcher.json   your repository paths
  %USERPROFILE%\.bugout\kit\                  the PowerShell module and dispatcher
  %USERPROFILE%\.claude\skills\bugout\        the /bugout skill
