# Manual Configurations

This document reflects the **current** state of what requires manual setup, as of the multi-user transformation (see `CHANGELOG.md`). It supersedes an earlier version of this same document written during the "Zero Manual Code Changes" pass, when settings were still app-wide rather than per-account — that history is preserved in `CHANGELOG.md` and git history rather than duplicated here.

## What's still genuinely manual, and why

| Item | Where | Why it can't be eliminated |
|---|---|---|
| `DATABASE_URL` / `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | `.env` | Chicken-and-egg: the app stores its configuration in Postgres, so it can't also look up *how to reach Postgres* from Postgres. Docker Compose's defaults work as-is; only override if running your own Postgres instance. |
| `ENCRYPTION_KEY` | `.env` | Encrypts Gmail App Passwords/API keys at rest. Cannot be auto-generated and stored in the database it protects — a DB dump would then contain both the ciphertext and the key. Generate with `openssl rand -hex 32`. The app refuses to start without it. |
| `PORT` (optional) | `.env` | The process has to know which port to bind before it can serve any UI to configure anything through. Has a working default (`8000`). |

That's the complete list of things that must be set before the app starts. `ENCRYPTION_KEY` is the one new genuinely-required value introduced by this phase — everything else still has a working default.

## Everything per-account is configured from inside the running app, after signing up

Every account configures its own copy of all of the following — nothing here is shared between accounts, and none of it requires touching a file:

| Setting | Where in the UI | Required? |
|---|---|---|
| Gmail address + App Password | Settings → Email Sending | Yes — nothing can be sent from that account until this is set. The Dashboard shows a banner linking here if it's missing. |
| Campaign send-delay range | Settings → Sending Pace | No — defaults to 30–60s |
| NVIDIA API key | Settings → AI Personalization | No — only used by Bulk Send/Template Map, and only when a template needs AI-based company-name substitution |
| Full name, email, phone, links, bio, skills, projects | Settings → Personal Information/Bio/Skills/Projects | Only required if using the Campaign flow, which uses the Bio field as its email template |

A **Send Test Email** button on the Email Sending card lets you verify Gmail credentials work before saving them. Gmail App Passwords and the NVIDIA key are encrypted at rest (AES-256-GCM, keyed by `ENCRYPTION_KEY`).

## What changed since the last version of this document

- **No more env-var seeding for Gmail/AI/delay settings.** The previous version of this app let `.env` pre-populate `GMAIL_ADDRESS`/`GMAIL_APP_PASSWORD`/`NVIDIA_API_KEY`/`EMAIL_DELAY_MIN`/`EMAIL_DELAY_MAX` once on first boot, as a convenience for headless deployments. **This no longer exists and these variables no longer do anything** — now that these settings are per-account rather than app-wide, there's no single value to seed before any accounts exist. Each account configures its own through Settings after signing up.
- **A new required secret** (`ENCRYPTION_KEY`) exists for the first time — see the table above.
- **Sign-up is now part of first-run setup.** Visiting the app for the first time lands on `/login.html`; click "Sign up" to create an account before anything else is configurable.

## Optional: Google sign-in

`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` in `.env` enable "Sign in with Google" as an alternative to email+password — entirely optional, requires registering an OAuth app in Google Cloud Console (unavoidable, Google requires it). Email+password works completely standalone if these are unset; the button simply doesn't render. See `docs/authentication.md`.

## Remaining known gaps (tracked, not silently ignored)

- `/api/logs` is gated behind login now, but not scoped per-tenant — see `docs/multi-tenancy.md`.
- No password reset / email verification flow exists — would need a transactional email sender independent of any user's own Gmail credentials.
- No roles/permissions — every account has identical capabilities.
- Upgrading an existing pre-multi-user deployment does not automatically migrate old data to a new account — see `docs/multi-tenancy.md` for why and how to reach old data directly if needed.
