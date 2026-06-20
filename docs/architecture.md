# Architecture

## 1. System overview

```
┌─────────────────────────────────────────────────────────────────────┐
│ Browser (vanilla HTML/CSS/JS, no build step, no framework)          │
│   index.html  upload.html  campaigns.html  campaign.html            │
│   preview.html  bulk.html  template-map.html  history.html          │
│   logs.html  settings.html                                         │
│   shared: js/api.js (fetch client + UI helpers), js/layout.js (nav) │
└───────────────────────────────┬───────────────────────────────────────┘
                                 │ fetch() / EventSource() — same-origin
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Express app (backend/server.js) — single Node.js process            │
│  • express.static(../frontend)  → serves all HTML/CSS/JS            │
│  • express.json / urlencoded (50mb) + express-fileupload            │
│  • cors() — all origins, all methods, no restriction                │
│  routes/  profile  campaigns  emails  upload  settings  logs        │
│           bulk  template-map  history                               │
└───────┬───────────────────────────────────┬─────────────────────────┘
        │                                   │
        ▼                                   ▼
┌─────────────────────────┐      ┌────────────────────────────┐
│ PostgreSQL (db.js)      │      │ In-process state            │
│  candidate_profiles     │      │  bulk.js: Map<sessionId,..> │
│  campaigns              │      │  logger.js: ring buffer +   │
│  email_logs             │      │   Set<SSE clients>          │
│  app_settings           │      │  (NOT persisted; lost on    │
│  mapping_configs        │      │   restart/crash)            │
│  send_history            │      └────────────────────────────┘
└─────────────────────────┘
        │
        ▼
┌─────────────────────────┐      ┌────────────────────────────┐
│ Gmail SMTP (nodemailer)  │      │ NVIDIA NIM API (OpenAI SDK) │
│ emailService.js          │      │ bulkAiService.js            │
│ smtp.gmail.com:587,      │      │ baseURL integrate.api       │
│ hardcoded                │      │ .nvidia.com/v1               │
│                          │      │ model meta/llama-3.3-70b     │
└─────────────────────────┘      └────────────────────────────┘
```

No reverse proxy, no CDN, no queue, no cache layer, no auth layer. `bull` is a declared dependency (`backend/package.json:12`) and `redisUrl` is a defined config key (`backend/config.js:6`) but **neither is ever used** — there is no worker process and no `worker.js` file despite `package.json:9` defining a `"worker"` npm script that points at one.

## 2. The three (really four) email-sending flows

This is the most important architectural fact about the codebase: **there isn't one email pipeline, there are three, at different levels of maturity, that don't share code.**

### 2a. Campaign flow — durable, DB-backed
`upload.html` → `POST /api/upload` (`routes/upload.js`) → creates `campaigns` + `email_logs` rows → `campaign.html` → `POST /api/campaigns/:id/start` (`routes/campaigns.js:48-65`) → `processCampaign()` (`services/campaignProcessor.js:27-99`), which **loops sequentially**, per row:
1. Calls `generateEmail(profile, row)` — despite the file name `aiService.js`, this makes **no network/AI call at all**. It does placeholder substitution on the candidate's `bio` field (`services/aiService.js:4-39`). The "AI" is the user's own bio text with `[Company Name]`, `[Recruiter Name]`, etc. replaced.
2. Writes `status='GENERATED'` to `email_logs`.
3. Calls `sendEmail()` via Gmail SMTP.
4. Writes `status='SENT'`/`'FAILED'` + (as of the History feature) a row in `send_history` with `source='campaign'`.
5. Sleeps a random `EMAIL_DELAY_MIN`–`EMAIL_DELAY_MAX` seconds (default 30–60s) before the next row — `campaignProcessor.js:6-9,83-85`.

State survives process restarts because everything lives in Postgres; a restart mid-campaign leaves rows in whatever status they were last written as, and the campaign can be resumed/retried via `routes/campaigns.js:67-83` (`retryFailed`).

### 2b. Bulk Send flow — ephemeral, in-memory
`bulk.html` → `POST /api/bulk/generate` (no DB writes — just calls `personalizeEmail()` per email and returns JSON to the browser) → user edits results client-side → `POST /api/bulk/send` (`routes/bulk.js:48-159`), which:
1. Creates a session object in a process-local `Map` (`sessions`, `routes/bulk.js:12`) — **not persisted anywhere**.
2. Runs an `(async () => { ... })()` IIFE that loops over items, sending via the same `sendEmail()`, broadcasting progress over Server-Sent Events to whichever browser tab opened `GET /api/bulk/progress/:sessionId`.
3. Honors configurable `delaySeconds` / `batchSize` / `breakMinutes` (added in a recent change) and a `session.stopped` flag polled every 500ms inside `pauseable()` (`routes/bulk.js:100-107`) so a `POST /api/bulk/stop/:sessionId` can interrupt mid-run.
4. Writes one `send_history` row per attempt via `recordHistory()` (`services/historyService.js`).
5. The session (including full results array) is deleted from memory exactly **one hour** after completion (`setTimeout(() => sessions.delete(sessionId), 3600000)`, `routes/bulk.js:155`) — there is no way to view a finished bulk-send's per-row detail after that window or after a restart; only the aggregate `send_history` rows survive.

`personalizeEmail()` (`services/bulkAiService.js:29-74`) only calls the NVIDIA LLM **if the template has no `[Company Name]`/`[Recruiter Name]` placeholder** — i.e., if the user wrote a template with the company name hardcoded somewhere in prose, the AI is asked to find-and-replace it while preserving everything else. If the template *does* have placeholders, it's pure string substitution, no AI call (`bulkAiService.js:32-38`).

### 2c. Template Map flow — also ephemeral, shares the send endpoint with 2b
`template-map.html` uploads an Excel file to `POST /api/template-map/parse` (parses with `xlsx`, returns all rows + a 5-row preview), lets the user map `{{Placeholder}}` tokens to columns, calls `POST /api/template-map/generate` (pure string templating, no AI, no DB write — `routes/template-map.js:34-78`) to produce per-row subject/body, then **sends through the exact same `POST /api/bulk/send` endpoint as the Bulk Send page**, with `source=template-map` in the form data as the only differentiator (`frontend/template-map.html:673`). Mapping presets can be saved/loaded from a real table (`mapping_configs`, `routes/template-map.js:80-113`) — this part is durable; the actual send is not.

### 2d. History — the unifying layer, added after the fact
`send_history` (`db.js`, new table) + `routes/history.js` + `services/historyService.js` is a write-through log that all three flows above call into after each individual send attempt. It is intentionally fire-and-forget (`recordHistory()` swallows its own errors, `historyService.js:6-14`) so a logging failure can never break a real send. It is the only place in the system where you can see "everything that was ever sent," but it stores **status and metadata only for the bulk/template-map flows** (since those are otherwise unpersisted) — for the Campaign flow it's a second, redundant copy of data that already lives durably in `email_logs`.

## 3. API surface

| Mount | File | Backed by |
|---|---|---|
| `/api/profile` | `routes/profile.js` | `candidate_profiles` (single row, `id=1`) |
| `/api/campaigns` | `routes/campaigns.js` | `campaigns` + `email_logs` |
| `/api/emails` | `routes/emails.js` | `email_logs` (list/filter/export CSV+XLSX) |
| `/api/upload` | `routes/upload.js` | creates campaign + email_logs rows |
| `/api/settings` | `routes/settings.js` | `app_settings` (just one key: `nvidia_api_key`, masked on read) |
| `/api/logs` | `routes/logs.js` | in-memory ring buffer (`services/logger.js`) + SSE |
| `/api/bulk` | `routes/bulk.js` | in-memory `Map` sessions + SSE |
| `/api/template-map` | `routes/template-map.js` | `mapping_configs`, and delegates sending to `/api/bulk` |
| `/api/history` | `routes/history.js` | `send_history` |
| `/api/health` | `server.js:41` | none — liveness only |

There is no API versioning, no OpenAPI/Swagger spec, and no consistent error-shape contract beyond `{ error: string }` on failure.

## 4. Authentication flow

**There is none.** No login page, no session, no JWT, no API key for the app's own endpoints, no cookies. `candidate_profiles` is hardcoded to a single row (`WHERE id=1` everywhere it's queried — `routes/profile.js:7,18`). This is consistent with the product's current scope (single operator, runs on their own machine), but it means every API route is fully open to anyone who can route to the port, and there is exactly one "account" the entire system can ever represent.

## 5. Email / generation flow caveats worth calling out explicitly

- **`aiService.js` does not use AI.** Despite the name and despite `CLAUDE.md`'s description ("calls Gemini `gemini-2.0-flash`"), the Campaign flow's email body comes from template-filling the user's own bio text. Only `bulkAiService.js` (Bulk Send / Template Map, and only conditionally) calls an actual LLM, and it's NVIDIA's hosted Llama 3.3 70B, not Gemini. `CLAUDE.md` is stale on this point and will mislead anyone (including a future AI assistant) who trusts it at face value.
- **`preview.html`'s two-step "Generate then Approve" UX does not match what the backend does.** `qs('#generate-all-btn')`'s click handler (`frontend/preview.html:102-123`) calls `api.startCampaign(campaignId)` — the exact same endpoint `campaign.html`'s "Start Sending" button calls — which runs `processCampaign()` end-to-end (generate **and send**, per row, immediately). The "Approve & Start Sending" button that appears afterward (`frontend/preview.html:24-27,154-163`) calls `startCampaign()` *again*, but by then sending is usually already complete or in progress, so in practice it's a confirm dialog over an action that already happened. A user who uses this page expecting to review AI output before anything goes out will be sending real email the moment they click "Generate."

## 6. Configuration flow

Three different places can hold "the same" piece of configuration simultaneously, with no single source of truth:

1. `.env` (read once, at process boot, via `dotenv` in `config.js:1`).
2. The `app_settings` Postgres table (read live, per-request, via `getSetting()` in `routes/settings.js:5-8`) — currently only used for `nvidia_api_key`.
3. `db.js:80-89`'s startup seed logic, which **overwrites** #2 from `process.env.NVIDIA_API_KEY` every single time the process boots, if that env var is set — meaning a value saved through the Settings UI (`frontend/settings.html`) silently reverts to the `.env` value on next restart if both are populated.

Full inventory of every value affected by this in [manual-configurations.md](manual-configurations.md).

## 7. Deployment flow

Two paths, not unified:
- **Docker Compose** (`docker-compose.yml`): Postgres + backend containers, frontend bind-mounted read-only into the backend container (`./frontend:/app/../frontend:ro`, a slightly unusual relative-path volume spec that works but is fragile to `WORKDIR` changes in the Dockerfile). `start.sh` / `start.bat` / `JobFinder.desktop` wrap this for non-technical, double-click use, with the `.desktop` file containing a machine-specific absolute path that must be hand-edited per clone.
- **Bare metal**: `cd backend && npm install && node server.js`, talking to a Postgres instance the developer must stand up themselves (`SETUP.md` documents both `createdb` and a raw `docker run` one-liner as alternatives — itself a sign the Docker Compose path and the manual path were documented by different people at different times).

No CI/CD pipeline exists (no `.github/workflows`, confirmed by directory listing). No staging/production environment distinction exists anywhere in config.

## 8. Data flow summary

```
Excel (.xlsx) ──upload.js/excelService.js──▶ campaigns + email_logs (Postgres)
                                                      │
                                       processCampaign │ (sequential, durable)
                                                      ▼
                                              Gmail SMTP ──▶ recipient
                                                      │
                                              send_history (Postgres, audit trail)

Pasted emails ──bulk.js/bulkAiService.js──▶ in-memory session (Map)
                                                      │
                                       background loop │ (sequential, ephemeral)
                                                      ▼
                                              Gmail SMTP ──▶ recipient
                                                      │
                                              send_history (Postgres, audit trail)

Excel (.xlsx) ──template-map.js (parse+generate, stateless)──▶ browser
                                                      │ (user reviews/edits in browser)
                                                      ▼
                                        same path as "Pasted emails" above
```

The Campaign flow is the only one where the Excel data itself (not just the outcome) is durably stored server-side. Both Bulk Send and Template Map treat the browser as the only place that ever holds the full per-row dataset between generation and send — if the tab is closed before clicking Send, the work is gone.
