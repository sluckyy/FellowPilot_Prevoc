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

## 1. GitHub environment and secrets

Repo → **Settings → Environments → New environment** → name `beta`.
Under **Deployment protection rules**, tick **Required reviewers** and add yourself, so nothing deploys
without your approval.

Then in the `beta` environment, add **Environment secrets**:

| Secret | Value |
| --- | --- |
| `AZURE_CLIENT_ID` | `5abe5757-757e-44b6-8257-f082239fb0a9` |
| `AZURE_TENANT_ID` | `73127c6e-f145-485b-aca3-9acd217aef4c` |
| `AZURE_SUBSCRIPTION_ID` | `baaab4c0-90a6-455f-9a75-2b9c83ea7763` |
| `POSTGRES_ADMIN_PASSWORD` | a new random password (see below) |
| `POSTGRES_APP_PASSWORD` | a different random password |
| `SESSION_SECRET` | a random string of at least 32 characters (also derives the reflection encryption keys: back it up) |
| `ANTHROPIC_API_KEY` | optional: switches on the "Ask why" tutor and the question-writing coach |

And two **Environment variables**: `AZURE_RESOURCE_GROUP` = `rg-fellowpilot-prevoc-beta`, and
`ADMIN_EMAIL` = the email of the first admin (their first sign-in creates the account; they invite everyone else).

To make the random values use a password manager's generator (24+ characters), or:

```bash
openssl rand -base64 30
```

Keep the admin password in your password manager; you'll want it if you ever connect to the database directly.

## 2. Deploy

Repo → **Actions** → **Deploy to Azure** → **Run workflow**, then approve it when asked.

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
