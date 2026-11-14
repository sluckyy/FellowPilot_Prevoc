# FellowPilot Prevocational

A beta of the FellowPilot prevocational track for PGY1 and PGY2 doctors, starting with the Yorke and
Northern Local Health Network (SA): practice questions tagged to the AMC prevocational outcome
statements, a private reflective logbook, an onboarding goal plan with six-month check-ins, and a
gamification engine (XP and levels, badges, weekly goals with streak pauses, seasons, team challenges
and an outcome-statement progress map). Website first; mobile comes later.

It is a separate deployment from the ACRRM MCQ Coach (`sluckyy/GP_Trainer`) but seeded from the same
code and schema, so the two can become one site later: a tenant plus a track, not a rewrite.

Design: `FellowPilot Prevocational — Technical Specification` (Nov 2026). Deliberately out of scope for
this beta: voice and avatars, AI simulated patients, the ward-call simulator, research linkage, Entra
SSO, and any AI processing of reflection text (the Anthropic API is US-hosted; see "AI and data" below).

## Repository

| Path | What it is |
| --- | --- |
| `db/migrations/` | Postgres schema. 001–006 are MCQ Coach's (tenants, invite-only sign-in, immutable item versions, append-only events, server-side marking, flags). 007 adds the prevocational track: tracks, AMC outcome-statement tags, PGY level, clinical experiences, setting, goal plans, encrypted reflections, streak pauses, seasons, teams. 008 loads the round 1 question bank. |
| `db/tests/` | Schema tests, run in CI on Postgres 16 |
| `packages/core/` | Dependency-free TypeScript shared with the web app: curriculum (28 outcome statements, 20 learning areas), scoring, event validation, selection, gamification (XP, levels, streaks with pauses, outcome map, seasons, achievements), reflections (prompts, keyword tag suggestions), goal plans, review import |
| `apps/web/` | Next.js app: sign-in, welcome, onboarding goal plan, practice loop, feedback and flags, logbook, progress, team, insights, study guide, question writing, admin (users, flags, achievements, seasons) |
| `pipeline/` | Question generation: prevocational blueprint, work orders, generator and critic prompts, automated gates, review docs, rounds |
| `infra/main.bicep` | Azure: App Service, PostgreSQL Flexible Server, Key Vault, Communication Services email, monitoring. Australia East |
| `.github/workflows/` | CI (core tests, schema tests, migrations twice, build, browser tests) and OIDC deploy to Azure |
| `docs/azure-setup.md` | One-off Azure and GitHub setup for this repo |

## Running the tests locally

```bash
cd packages/core && npm install --no-save typescript@5.6.3 @types/node@22.9.0 && npm test
```

```bash
createdb fp_test
psql -v ON_ERROR_STOP=1 -d fp_test -f db/migrations/001_init.sql
psql -v ON_ERROR_STOP=1 -d fp_test -f db/tests/001_init_test.sql
```

```bash
cd apps/web && npm install && npm run typecheck && npm run build
```

## The question bank

Round 1 is 250 items generated in the build session from `pipeline/rounds/round1/work_orders.json`
(20 learning areas, PGY1-weighted, 45% regional settings, at least 12% Aboriginal or Torres Strait
Islander patients). Each item was written by a generator agent (`prompts/gen-prevoc-v0.1.md`), checked
blind by a critic agent (`prompts/critic-prevoc-v0.1.md`), then run through `gates.py`. Items that
passed every automated check are live as `review_level = 'none'` and show an "AI-reviewed, not yet
clinically reviewed" tag; a trainee flag takes a question out until someone reviews it. Clinical
review can be layered on later through the Review Desk and `import-questions.yml`, exactly as in MCQ Coach.

## Key rules the code enforces

- The client never decides whether an answer is right; the database marks it from the stored key.
- Events are append-only and de-duplicated, so offline re-sends never double-count.
- Published question versions never change; edits create a new version with fresh statistics.
- XP rewards doing things, never being right. Scores feed the trainee's own feedback, not leaderboards.
- Reflection text is encrypted with a per-trainee key, never scored, and never leaves the platform.
  Only the outcome-statement tags the trainee confirms are counted.
- Team totals show only once a team has five members. Nothing connects to EPA or term assessment systems.

## AI and data

The deployed app can call the Anthropic API for the "Ask why" tutor and question-writing coach
(both optional, switched on by `ANTHROPIC_API_KEY`). Those calls carry question content and the
trainee's question only. Nothing from the logbook or the trainee's profile is ever sent to a model.
