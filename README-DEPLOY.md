# Azure Deploy Template

This is the deployment kit for a Managed Platform app. Copy this `.github/`, `infra/`, and `scripts/` into your app repo, set two repo variables, run one bootstrap, and `git push` deploys.

## Prerequisites (one-time on your machine)

- `az` (Azure CLI) — `winget install Microsoft.AzureCLI`
- `terraform` 1.6+ — `winget install Hashicorp.Terraform`
- `gh` (GitHub CLI) — `winget install GitHub.cli`
- PowerShell 7+

Run `az login` and `gh auth login` before bootstrapping.

## Layout

```
.github/workflows/
  deploy.yml          # multi-env: push→dev, dispatch→demo/beta, tag→prod (with approval)
  pr-validate.yml     # builds + terraform plan on PRs
infra/
  main.tf, variables.tf, outputs.tf, providers.tf, backend.tf
  envs/{dev,demo,beta,prod}.tfvars
  modules/app/        # the actual per-app TF
scripts/
  bootstrap.ps1           # one (app, env) at a time
  bootstrap-all-envs.ps1  # all four envs in sequence
  sync-dns.ps1            # prints GoDaddy DNS records to add manually
```

## Bootstrap a brand-new app

```powershell
# From the app repo root, after copying this template in
./scripts/bootstrap-all-envs.ps1 -AppName hancock -GitHubRepo managedplatform/hancock
```

That creates per-env Azure resource groups, UAMIs, federated GitHub OIDC creds, repo secrets, GitHub Environments (with prod approval gate), and runs the first `terraform apply` for each env with a placeholder image.

## Deploy

| Environment | Trigger |
|---|---|
| dev | `git push origin main` |
| demo | GitHub UI → Actions → Deploy → Run workflow → environment=demo |
| beta | GitHub UI → Actions → Deploy → Run workflow → environment=beta |
| prod | `git tag v1.2.3 && git push --tags` (then click Approve in GitHub) |

## Repo expectations

The workflow expects this layout in your app repo:

```
api/
  Dockerfile           # builds the .NET image, exposes port 8080
  *.csproj, etc.
web/
  package.json
  (vite project, builds to web/dist)
```

The Dockerfile must publish on port 8080 (set in the Container App ingress) and use `ASPNETCORE_URLS=http://+:8080`.

## Repo variables and secrets (set by bootstrap, no manual work)

Variables: `APP_NAME`
Secrets: `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`, `AZURE_CLIENT_ID_DEV`, `AZURE_CLIENT_ID_DEMO`, `AZURE_CLIENT_ID_BETA`, `AZURE_CLIENT_ID_PROD`

DNS: managedplatform.com is on **GoDaddy**. After each new env's first deploy, run `./scripts/sync-dns.ps1` locally — it prints the CNAMEs to paste into GoDaddy DNS Manager.
