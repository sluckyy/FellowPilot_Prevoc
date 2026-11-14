# Setting up Azure and GitHub for FellowPilot Prevocational (beta)

Most of this was done when the repo was created. What remains is adding secrets to GitHub and running
the first deploy. Afterwards, every merge to `main` that passes the tests deploys automatically, after
you approve it.

GitHub signs in to Azure with a short-lived token (OpenID Connect). No Azure password or key is stored
in GitHub.

## Already in place (Azure)

| Thing | Value |
| --- | --- |
| Subscription | `baaab4c0-90a6-455f-9a75-2b9c83ea7763` |
| Resource group | `rg-fellowpilot-prevoc-beta` (Australia East) |
| Deploy identity | user-assigned managed identity `id-fellowpilot-prevoc-deploy`, Contributor on the resource group |
| Its client ID | `5abe5757-757e-44b6-8257-f082239fb0a9` |
| Federated credential | `github-beta`, trusting `repo:sluckyy/FellowPilot_Prevoc:environment:beta` |
| Tenant | `73127c6e-f145-485b-aca3-9acd217aef4c` |

The deploy job must run with `environment: beta` (it does), or the sign-in fails.

## 1. Secrets: nothing to paste

The workflows carry the (non-secret) Azure IDs above, and the generated passwords are in the bootstrap
Key Vault `fpprevoc-boot-f6dc80` in the same resource group, readable by the deploy identity and by the subscription
owner. Nobody needs to type or keep a password:

| Key Vault secret | What it is |
| --- | --- |
| `postgres-admin-password` | Postgres administrator (used by migrations only) |
| `postgres-app-password` | the web app's least-privilege database login |
| `session-secret` | signs session cookies and derives the per-trainee reflection keys: never rotate it casually |
| `admin-email` (optional) | the first admin; their first sign-in creates the account |
| `anthropic-api-key` (optional) | switches on the "Ask why" tutor and the question-writing coach |

To see or change one: Azure portal, Key vaults, `fpprevoc-boot-f6dc80`, Secrets. GitHub secrets or repository variables
with the same names as the workflow's (`POSTGRES_ADMIN_PASSWORD`, `ADMIN_EMAIL`, `AZURE_CLIENT_ID` ...)
override these if you ever prefer them.

Recommended: in the repo, Settings, Environments, `beta`, tick **Required reviewers** and add yourself,
so nothing deploys without your approval.

## 2. Deploy

Every push to `main` that passes CI deploys automatically, unless it only touched `pipeline/` or docs. To deploy by hand: Repo → **Actions** → **Deploy to Azure** → **Run workflow**.

The first run takes about 15 minutes (the database is the slow part). It:

1. creates everything in `main.bicep` (web app, database, Key Vault, email, monitoring)
2. briefly opens the database firewall to the GitHub runner, runs the migrations (which also load the
   round 1 question bank), then closes it
3. deploys the web app and checks `/api/health`

The run summary lists the app's address (`https://fpprevoc-beta-web-….azurewebsites.net`).

## 3. First sign-in

Open the address, enter the admin email, follow the link in the email. Accept the terms, then use
**Admin** to invite trainees. Everyone invited joins the `ynlhn` tenant (`TENANT_SLUG` in `main.bicep`).

## What it costs

Roughly the same as the MCQ Coach beta: an App Service B1 plan and a Burstable B1ms Postgres server
are the two meaningful lines; Key Vault, email and monitoring are cents. Sharing MCQ Coach's Postgres
server would halve that but couple the two systems, so the beta keeps its own.

## Later

- Custom domain: set `publicUrl` in `infra/main.parameters.json` and add the domain to the web app.
- Entra ID SSO for SA Health staff: the user model keeps identity apart from analytics, so a second
  sign-in method slots in beside the magic links.
- Private networking (VNet integration and a private endpoint for Postgres) before handover.
