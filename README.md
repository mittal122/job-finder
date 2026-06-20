# Job Finder

AI-assisted bulk email outreach tool. Upload a recruiter list (or paste emails directly), generate a personalized message per recipient, and send it through your own Gmail account — with configurable pacing, live progress, and a unified history of everything ever sent.

## Features

- **Campaigns** — upload an Excel list of recruiters, attach a resume, track send status per recipient, retry failures, export results to CSV/Excel.
- **Bulk Send** — paste a list of emails directly, compose a template, optionally let an LLM swap in each recipient's company name, control delay/batch-size/break timing, stop or refresh mid-send.
- **Template Map** — upload an Excel file and map `{{placeholder}}` tokens to columns for full control over per-recipient personalization, with saveable mapping presets.
- **History** — a single place to search and filter every email ever sent, across all three flows above.
- **Profile & Settings** — your bio/skills/projects (used as the email template for Campaigns) and your NVIDIA API key (used for AI personalization in Bulk Send/Template Map).

## Quick start

```bash
cp .env.example .env   # fill in your Gmail App Password (see SETUP.md)
docker compose up -d
```

Open **http://localhost:8000**.

See [SETUP.md](SETUP.md) for full setup instructions (environment variables, where to get a Gmail App Password and an NVIDIA API key, running without Docker, Excel file format).

## Project structure

```
backend/    Express API + Postgres access (routes/ + services/)
frontend/   Plain HTML/CSS/JS, no build step
docs/       Architecture, security, and code-quality audit + roadmap
```

See [CLAUDE.md](CLAUDE.md) for a guided tour of how the request/email flow actually works, and [docs/](docs/) for a deeper audit and the active refactoring roadmap.

## Status

This project is in active, structured cleanup/hardening — see [docs/refactoring-roadmap.md](docs/refactoring-roadmap.md) for what's done and what's next, and [CHANGELOG.md](CHANGELOG.md) for what's shipped. Notably: there is currently no authentication on any route — this is a known, tracked gap (see [docs/security-audit.md](docs/security-audit.md)), not an oversight, and is being addressed in a later roadmap phase.

## License

No license file is currently present — until one is added, this code is not licensed for reuse by others.
