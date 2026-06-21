# Job Finder

Multi-user AI-assisted bulk email outreach tool. Anyone can sign up, connect their own Gmail account, upload a recruiter list (or paste emails directly), generate a personalized message per recipient, and send it — with configurable pacing, live progress, and a unified history of everything ever sent. Every account's data, credentials, and activity are completely isolated from every other account's.

## Features

- **Accounts** — email+password signup/login, or optional "Sign in with Google." Every account is a fully independent tenant — see [docs/multi-tenancy.md](docs/multi-tenancy.md).
- **Campaigns** — upload an Excel list of recruiters, attach a resume, track send status per recipient, retry failures, export results to CSV/Excel.
- **Bulk Send** — paste a list of emails directly, compose a template, optionally let an LLM swap in each recipient's company name, control delay/batch-size/break timing, stop or refresh mid-send.
- **Template Map** — upload an Excel file and map `{{placeholder}}` tokens to columns for full control over per-recipient personalization, with saveable mapping presets.
- **History** — a single place to search and filter every email ever sent, across all three flows above.
- **Profile & Settings** — your bio/skills/projects (used as the email template for Campaigns), Gmail address/App Password with a one-click test send, your NVIDIA API key (used for AI personalization in Bulk Send/Template Map), and your Campaign send-pace — all encrypted at rest, all yours alone.
- **Unsubscribe & suppression** — every outgoing email carries a working, signed unsubscribe link (plus a native one-click `List-Unsubscribe` header in Gmail/Outlook); anyone who unsubscribes is automatically skipped by every future send from that account across all three flows.
- **Getting Started checklist** — the Dashboard guides a new user through connecting Gmail, filling in their profile, and sending their first email, then gets out of the way once all three are done.

## Quick start

```bash
cp .env.example .env
openssl rand -hex 32   # paste the output into .env as ENCRYPTION_KEY
docker compose up -d
```

Open **http://localhost:8000**, sign up, and finish setup from inside the app — go to **Profile & Settings** to add your Gmail address and App Password (the page links you straight to where to get one). No file editing beyond the one key above.

See [SETUP.md](SETUP.md) for full setup instructions (where to get a Gmail App Password and an NVIDIA API key, optional Google sign-in, running without Docker, Excel file format).

## Project structure

```
backend/    Express API + Postgres access (routes/ + services/)
frontend/   Plain HTML/CSS/JS, no build step
docs/       Architecture, security, and code-quality audit + roadmap
```

See [CLAUDE.md](CLAUDE.md) for a guided tour of how the request/email flow actually works, and [docs/](docs/) for a deeper audit and the active refactoring roadmap.

## Status

This project is in active, structured development — see [docs/refactoring-roadmap.md](docs/refactoring-roadmap.md) for what's done and what's next, and [CHANGELOG.md](CHANGELOG.md) for what's shipped. Authentication and full multi-tenant data isolation are done (see [docs/authentication.md](docs/authentication.md) and [docs/multi-tenancy.md](docs/multi-tenancy.md)). Known, deliberately deferred gaps: no roles/permissions yet (every account has identical capabilities — see the `/api/logs` note in `docs/multi-tenancy.md`), Bulk Send/Template Map sessions are still in-memory only (not durable across a restart), and no password-reset flow exists yet.

## License

No license file is currently present — until one is added, this code is not licensed for reuse by others.
