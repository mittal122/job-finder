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
| `GEMINI_API_KEY` | Gemini API key (used in `aiService.js`) |
| `GMAIL_ADDRESS` | Gmail sender address |
| `GMAIL_APP_PASSWORD` | 16-char Google App Password |

The database schema is created automatically on startup via `initDb()` in `db.js` — no migrations to run manually.

## Architecture

**Single-process design:** The backend is a plain Express server (`server.js`) that also serves the frontend as static files. Campaign processing runs in-process as a fire-and-forget async loop — there is no worker process, Redis, or queue despite `bull` being in `package.json`.

**Request → email flow:**
1. User uploads Excel + resume → `POST /api/upload` → `excelService.parseAndValidate()` creates `campaigns` and `email_logs` rows in Postgres
2. User clicks Start → `POST /api/campaigns/:id/start` → `processCampaign()` runs async in background
3. For each pending email: Claude generates subject+body → Gmail SMTP sends → DB row updated → random 30–60s delay before next

**Frontend:** Vanilla HTML/CSS/JS, no build step. All pages load `frontend/js/api.js` which exports a shared `api` object and UI helpers (`showAlert`, `badge`, `fmt`, `escHtml`, `spinner`, etc.) as `window.*` globals. `frontend/js/layout.js` injects shared nav. Pages poll the backend directly via `fetch`.

**Key files:**
- `backend/server.js` — entrypoint, mounts routes, serves `../frontend` as static
- `backend/db.js` — schema DDL + `pool` export; schema auto-applied at startup
- `backend/config.js` — all env var reads in one place
- `backend/services/campaignProcessor.js` — main email sending loop
- `backend/services/aiService.js` — calls Gemini (`gemini-2.0-flash`) to generate email JSON
- `backend/services/emailService.js` — nodemailer Gmail SMTP sender
- `backend/services/excelService.js` — Excel parse with flexible column-name aliasing
- `frontend/js/api.js` — shared API client + UI utility functions

**AI email generation:** `aiService.js` calls Gemini `generateContent` with `gemini-2.0-flash`. It expects a JSON object `{ "subject": "...", "body": "..." }` and retries up to 3 times with backoff on failure.

**Email statuses:** `PENDING` → `GENERATED` → `SENT` (or `FAILED` at either step). Retry resets `FAILED` rows back to `PENDING` and re-runs `processCampaign`.
