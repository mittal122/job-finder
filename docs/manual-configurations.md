# Manual Configurations

This document reflects the **current** state of what requires manual setup, as of the "Zero Manual Code Changes" pass (see `CHANGELOG.md`). It superseded an earlier version of this same document written during the initial Prompt 1 audit, when almost everything below was still a `.env` edit or a hardcoded value — that history is preserved in `CHANGELOG.md` and git history rather than duplicated here.

## What's still genuinely manual, and why

| Item | Where | Why it can't be eliminated |
|---|---|---|
| `DATABASE_URL` / `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | `.env` | Chicken-and-egg: the app stores its configuration in Postgres, so it can't also look up *how to reach Postgres* from Postgres. This is the one setting that has to exist before the app can start at all. Docker Compose's defaults work as-is; only override if running your own Postgres instance. |
| `PORT` (optional) | `.env` | The process has to know which port to bind before it can serve any UI to configure anything through. Has a working default (`8000`) — only set this if that port is taken. |

That's the complete list of things that must be set before the app starts, and both have sensible defaults that work out of the box with `docker compose up -d` — a fresh clone needs zero `.env` edits to start successfully.

## Everything else is configured from inside the running app

All of the following are stored in the `app_settings` database table (or `candidate_profiles` for profile data) and edited through `/settings.html`. None require touching a file:

| Setting | Where in the UI | Required? |
|---|---|---|
| Gmail address + App Password | Settings → Email Sending | Yes — nothing can be sent until this is set. The Dashboard shows a banner linking here if it's missing. |
| Campaign send-delay range | Settings → Sending Pace | No — defaults to 30–60s |
| NVIDIA API key | Settings → AI Personalization | No — only used by Bulk Send/Template Map, and only when a template needs AI-based company-name substitution |
| Full name, email, phone, links, bio, skills, projects | Settings → Personal Information/Bio/Skills/Projects | Only required if using the Campaign flow, which uses the Bio field as its email template |

A **Send Test Email** button on the Email Sending card lets you verify Gmail credentials work before saving them, rather than discovering a typo only when a real campaign fails partway through.

## Optional env-var seeding, for headless/scripted deployments

`.env.example` documents `GMAIL_ADDRESS`/`GMAIL_APP_PASSWORD`/`NVIDIA_API_KEY`/`EMAIL_DELAY_MIN`/`EMAIL_DELAY_MAX` as commented-out, optional variables. If set, `db.js`'s `seedSettingIfEmpty()` uses them to pre-populate the matching Settings value **the first time the app starts with an empty value for that setting** — and never again after that. This means:
- A scripted/CI deployment can pre-seed everything via `.env` and skip the UI entirely.
- A value set through the Settings UI is never silently overwritten by `.env` on a later restart — this was a real bug in an earlier version of this app (see `CHANGELOG.md`) and is now fixed for all five seedable settings.

## Things that used to require a manual edit and no longer do

- **Gmail credentials** — previously a hard `.env` requirement; now optional env-seeding only, with the real configuration path being the Settings UI.
- **Campaign send-delay range** — same change.
- **Sender display name in outgoing email** — previously a dead `config.gmailSenderName` reference that silently fell back to a hardcoded stranger's name no matter what; now derived automatically from your Profile's Full Name field. Filling in your name once (which you'd do anyway, for the AI email template) fixes this with no separate input.
- **Upload directory** — previously hardcoded to a Unix-only `/tmp` path that broke if ever run natively on Windows without Docker; now auto-detected via `os.tmpdir()`.
- **`JobFinder.desktop`'s launcher path** — previously a static file with one machine's absolute path baked in, requiring a hand-edit on every other clone; `start.sh` now regenerates it correctly on every run.
- **Default identity content** (a hardcoded name baked into the database schema, the Campaign processor's fallback profile, and Template Map's sample email template, including — in the sample template's case — a real phone number and personal Gmail address) — all replaced with neutral/generic placeholders. An unconfigured profile now honestly looks unconfigured instead of silently impersonating the original developer.

## Remaining known gaps (tracked, not silently ignored)

- Secrets in `app_settings` (Gmail App Password, NVIDIA key) are stored in plaintext, not encrypted at rest — acceptable for a single-operator local/Docker deployment, flagged in `docs/security-audit.md` as needing real encryption before any multi-tenant/hosted deployment (`docs/refactoring-roadmap.md` Phase 7).
- No authentication exists yet, so "configured through the app" still means "configured by whoever can reach the app" — see `docs/security-audit.md` for the full security posture and `docs/refactoring-roadmap.md` Phase 3 for the planned fix.
