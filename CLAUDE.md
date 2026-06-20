# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the App

```bash
cd backend
npm install
node server.js        # production
npm run dev           # development with nodemon auto-reload
```

Server starts at **http://localhost:8000** and also serves the frontend from there.

**Docker (full stack):**
```bash
docker compose up -d
```

There are no tests or linters configured.

## Environment Setup

```bash
cp .env.example .env
```

Required variables:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `GMAIL_ADDRESS` | Gmail sender address |
| `GMAIL_APP_PASSWORD` | 16-char Google App Password |
| `NVIDIA_API_KEY` | NVIDIA NIM API key — only needed for AI-personalized sends in Bulk Send/Template Map (see below). Can alternatively be set via the Settings page UI, but **the env var overwrites the UI-saved value on every restart** if both are set (`db.js`'s `initDb()` re-seeds it from `process.env` unconditionally on boot) — pick one source of truth. |

The database schema is created automatically on startup via `initDb()` in `db.js` — no migrations to run manually.

## Architecture

**Single-process design:** The backend is a plain Express server (`server.js`) that also serves the frontend as static files. There is no worker process, no queue, no Redis — everything runs in-process.

**Three parallel ways to send bulk personalized email exist** — know which one a task is actually about before changing shared-looking code:

1. **Campaign flow** (`upload.html` → `campaigns.html`/`campaign.html`) — Excel-driven, DB-backed (`campaigns` + `email_logs`), durable across restarts.
   - `POST /api/upload` → `excelService.parseAndValidate()` creates `campaigns` and `email_logs` rows in Postgres.
   - `POST /api/campaigns/:id/start` → `processCampaign()` (`services/campaignProcessor.js`) runs async in the background: for each pending row, **`services/aiService.js` makes no AI call at all** — it template-fills the candidate's own `bio` field with `[Company Name]`/`[Recruiter Name]`-style substitution — then sends via Gmail SMTP, updates the DB row, waits a random `EMAIL_DELAY_MIN`–`EMAIL_DELAY_MAX` (default 30–60s) before the next row.
   - Email statuses: `PENDING` → `GENERATED` → `SENT` (or `FAILED` at either step). Retry resets `FAILED` rows back to `PENDING` and re-runs `processCampaign`.
2. **Bulk Send flow** (`bulk.html`) — paste emails in a textarea, **in-memory only** (a process-local `Map` in `routes/bulk.js` — lost on restart/crash, not durable).
   - `POST /api/bulk/generate` calls `services/bulkAiService.js`'s `personalizeEmail()`, which does pure string substitution **unless** the template has no placeholder to swap a company name into — only then does it call the NVIDIA NIM API (`meta/llama-3.3-70b-instruct`, OpenAI-compatible client) to do the substitution. The NVIDIA key comes from the `app_settings` DB table via `services/settingsService.js`, not from `config.js`.
   - `POST /api/bulk/send` starts a background send loop with configurable `delaySeconds`/`batchSize`/`breakMinutes`, broadcasting live progress over SSE (`GET /api/bulk/progress/:sessionId`). `POST /api/bulk/stop/:sessionId` can interrupt it mid-run.
3. **Template Map flow** (`template-map.html`) — Excel + `{{placeholder}}` column mapping (`routes/template-map.js`, pure string templating, no AI, no DB write for the generated content). Sends through the **same** `POST /api/bulk/send` endpoint as Bulk Send, distinguished only by a `source` form field. Mapping presets are durable (`mapping_configs` table); the actual send is not.

**History** (`history.html`, `routes/history.js`, `services/historyService.js`) is a write-through audit log (`send_history` table) that all three flows above write to after every individual send attempt — it's the only place to see "everything ever sent" across all three flows, since two of them aren't otherwise durable. Writing to it never blocks or fails a real send (`historyService.js` swallows its own errors).

**Frontend:** Vanilla HTML/CSS/JS, no build step. All pages load `frontend/js/api.js` (shared `api` object + UI helpers — `showAlert`, `badge`, `fmt`, `escHtml`, `spinner`, etc. — as `window.*` globals) and `frontend/js/layout.js` (injects shared nav). `frontend/js/sendProgress.js` holds the SSE/progress/stop/break-banner logic shared by `bulk.html` and `template-map.html` — don't duplicate it back into either page. The Campaign flow's pages (`campaign.html`, `preview.html`, `index.html`) poll the backend on a timer instead of using SSE; Bulk Send/Template Map/History use SSE or on-demand fetch.

**`preview.html` does not actually gate sending on review.** Clicking "Generate All Emails" calls the same `startCampaign()` endpoint as `campaign.html`'s "Start Sending" button — generation and sending happen in the same `processCampaign()` pass, so by the time "Approve & Start Sending" appears, sending has typically already happened. Don't assume this page previews before sending without checking current behavior.

**Key files:**
- `backend/server.js` — entrypoint, mounts routes + error-handling middleware, serves `../frontend` as static
- `backend/db.js` — schema DDL + `pool` export; schema auto-applied at startup
- `backend/config.js` — infra-level env var reads (port, DB URL, Gmail creds, upload dir, delay range)
- `backend/middleware/errorHandler.js` — JSON 404 for unmatched `/api/*` paths + last-resort error handler
- `backend/services/campaignProcessor.js` — Campaign flow's main send loop
- `backend/services/aiService.js` — Campaign flow's email body generator; **template substitution only, no AI call**
- `backend/services/bulkAiService.js` — Bulk Send/Template Map's generator; the only place that calls the NVIDIA LLM, and only conditionally
- `backend/services/settingsService.js` — DB-backed app settings (currently just the NVIDIA key)
- `backend/services/historyService.js` — write-through `send_history` logger used by all three send flows
- `backend/services/emailService.js` — nodemailer Gmail SMTP sender (hardcoded to `smtp.gmail.com:587`)
- `backend/services/excelService.js` — Excel parse with flexible column-name aliasing
- `frontend/js/api.js` — shared API client + UI utility functions
- `frontend/js/sendProgress.js` — shared live send-progress UI (SSE, stop/refresh, break banner)

## Where to find deeper context

A full architecture/security/performance/code-quality audit and phased refactoring roadmap live in `docs/` — read those before making non-trivial changes, especially `docs/architecture.md` and `docs/refactoring-roadmap.md`, which are kept more current and more detailed than this file.
