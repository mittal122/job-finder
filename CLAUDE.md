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
| `ENCRYPTION_KEY` | Encrypts Gmail App Passwords/API keys at rest. App fails fast at boot if missing — generate with `openssl rand -hex 32`. Cannot be auto-generated and stored in the DB it protects. |

Gmail/NVIDIA/delay settings are **per-account** now (see Multi-tenancy below) — there is no app-wide env var for them anymore; each user configures their own from `/settings.html` after signing up. `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` are optional — only needed to enable "Sign in with Google" as an alternative to email+password.

The database schema and migrations are applied automatically on startup via `initDb()` in `db.js` (see `backend/db/migrate.js` and `backend/db/migrations/`) — no manual migration step.

## Architecture

**Single-process design:** The backend is a plain Express server (`server.js`) that also serves the frontend as static files. There is no worker process, no queue, no Redis — everything runs in-process.

**Authentication & multi-tenancy:** Every account is a fully isolated tenant — see `docs/authentication.md` and `docs/multi-tenancy.md` for the full picture. In short: email+password (bcrypt) or optional Google sign-in, both resulting in a server-side session (`sessions` table, random ID in an httpOnly cookie — not a JWT, specifically so logout/revocation is a simple `DELETE`). `requireAuth` middleware is mounted once in `server.js` for everything except `/api/auth/*`, `/api/unsubscribe`, and `/api/health`; every other route reads `req.user.id` and scopes its queries by it. **If you're adding a new route or table that holds user data, it needs a `user_id` column and a `WHERE user_id = $1` on every query** — there's no other enforcement layer. Secrets in `app_settings` (Gmail App Password, AI keys) are AES-256-GCM encrypted via `backend/utils/crypto.js`, keyed by `config.encryptionKey`.

**Three parallel ways to send bulk personalized email exist** — know which one a task is actually about before changing shared-looking code:

1. **Campaign flow** (`upload.html` → `campaigns.html`/`campaign.html`) — Excel-driven, DB-backed (`campaigns` + `email_logs`), durable across restarts.
   - `POST /api/upload` → `excelService.parseAndValidate()` creates `campaigns` and `email_logs` rows in Postgres.
   - `POST /api/campaigns/:id/start` → `processCampaign(userId, campaignId)` (`services/campaignProcessor.js`) runs async in the background: for each pending row, **`services/aiService.js` makes no AI call at all** — it template-fills the candidate's own `bio` field with `[Company Name]`/`[Recruiter Name]`-style substitution — then sends via Gmail SMTP, updates the DB row, waits a random delay (per-account `email_delay_min`/`email_delay_max` settings, default 30–60s) before the next row.
   - Email statuses: `PENDING` → `GENERATED` → `SENT` (or `FAILED` at either step). Retry resets `FAILED` rows back to `PENDING` and re-runs `processCampaign`.
2. **Bulk Send flow** (`bulk.html`) — paste emails in a textarea, **in-memory only** (a process-local `Map` in `routes/bulk.js` — lost on restart/crash, not durable).
   - `POST /api/bulk/generate` calls `services/bulkAiService.js`'s `personalizeEmail(userId, ...)`, which does pure string substitution **unless** the template has no placeholder to swap a company name into — only then does it call the NVIDIA NIM API (`meta/llama-3.3-70b-instruct`, OpenAI-compatible client) to do the substitution. The NVIDIA key comes from that user's own row in the `app_settings` DB table via `services/settingsService.js`, encrypted at rest — not from `config.js`, and not shared across accounts.
   - `POST /api/bulk/send` starts a background send loop with configurable `delaySeconds`/`batchSize`/`breakMinutes`, broadcasting live progress over SSE (`GET /api/bulk/progress/:sessionId`). `POST /api/bulk/stop/:sessionId` can interrupt it mid-run. The in-memory session object stores `userId`; both endpoints verify it matches the requester (404, not 403, if not) since this state isn't in a DB table that a `WHERE user_id` clause can protect.
3. **Template Map flow** (`template-map.html`) — Excel + `{{placeholder}}` column mapping (`routes/template-map.js`, pure string templating, no AI, no DB write for the generated content). Sends through the **same** `POST /api/bulk/send` endpoint as Bulk Send, distinguished only by a `source` form field. Mapping presets are durable (`mapping_configs` table, `user_id`-scoped); the actual send is not.

**History** (`history.html`, `routes/history.js`, `services/historyService.js`) is a write-through audit log (`send_history` table) that all three flows above write to after every individual send attempt — it's the only place to see "everything ever sent" across all three flows, since two of them aren't otherwise durable. Writing to it never blocks or fails a real send (`historyService.js` swallows its own errors).

**Frontend:** Vanilla HTML/CSS/JS, no build step. All pages load `frontend/js/api.js` (shared `api` object + UI helpers — `showAlert`, `badge`, `fmt`, `escHtml`, `spinner`, etc. — as `window.*` globals) and `frontend/js/layout.js` (injects shared nav). `frontend/js/sendProgress.js` holds the SSE/progress/stop/break-banner logic shared by `bulk.html` and `template-map.html` — don't duplicate it back into either page. The Campaign flow's pages (`campaign.html`, `preview.html`, `index.html`) poll the backend on a timer instead of using SSE; Bulk Send/Template Map/History use SSE or on-demand fetch.

**`preview.html` does not actually gate sending on review.** Clicking "Generate All Emails" calls the same `startCampaign()` endpoint as `campaign.html`'s "Start Sending" button — generation and sending happen in the same `processCampaign()` pass, so by the time "Approve & Start Sending" appears, sending has typically already happened. Don't assume this page previews before sending without checking current behavior.

**Key files:**
- `backend/server.js` — entrypoint, mounts public routes, the `requireAuth` gate, then every protected route + error-handling middleware; serves `../frontend` as static
- `backend/db.js` — baseline schema DDL + migration runner invocation + `pool` export
- `backend/db/migrate.js` + `backend/db/migrations/*.sql` — numbered, tracked, one-way schema migrations (used for the multi-tenant rename — see `docs/multi-tenancy.md`)
- `backend/config.js` — infra-level env var reads only (port, DB URL, encryption key, upload dir, public base URL, Google OAuth client config)
- `backend/middleware/requireAuth.js` — session-cookie auth check, attaches `req.user`
- `backend/middleware/errorHandler.js` — JSON 404 for unmatched `/api/*` paths + last-resort error handler
- `backend/middleware/rateLimiter.js` — `sendLimiter`/`uploadLimiter`/`authLimiter`
- `backend/services/authService.js` — password hashing, sessions, Google token verification
- `backend/utils/crypto.js` — AES-256-GCM encrypt/decrypt for secrets in `app_settings`
- `backend/services/campaignProcessor.js` — Campaign flow's main send loop, `(userId, campaignId)`-scoped
- `backend/services/aiService.js` — Campaign flow's email body generator; **template substitution only, no AI call**
- `backend/services/bulkAiService.js` — Bulk Send/Template Map's generator; the only place that calls the NVIDIA LLM, and only conditionally
- `backend/services/settingsService.js` — per-user, encrypted app settings (`getSetting(userId, key)`/`setSetting(userId, key, value)`)
- `backend/services/suppressionService.js` — per-user suppression list + unsubscribe token (signed over `userId:email`)
- `backend/services/historyService.js` — write-through `send_history` logger used by all three send flows
- `backend/services/emailService.js` — nodemailer Gmail SMTP sender (hardcoded to `smtp.gmail.com:587`), takes `userId` to resolve that account's credentials/sender name/unsubscribe link
- `backend/services/excelService.js` — Excel parse with flexible column-name aliasing
- `frontend/login.html` / `frontend/signup.html` — the only pages without the sidebar/topbar layout
- `frontend/js/api.js` — shared API client + UI utility functions; `apiFetch()` redirects to `/login.html` on any `401`
- `frontend/js/sendProgress.js` — shared live send-progress UI (SSE, stop/refresh, break banner)

## Where to find deeper context

A full architecture/security/performance/code-quality audit and phased refactoring roadmap live in `docs/` — read those before making non-trivial changes, especially `docs/architecture.md`, `docs/authentication.md`, `docs/multi-tenancy.md`, and `docs/refactoring-roadmap.md`, which are kept more current and more detailed than this file.
