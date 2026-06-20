# Changelog

All notable changes to this project are documented here. Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

## 2026-06-20 — Zero Manual Code Changes

A fresh clone now needs zero file edits to reach a usable state: `cp .env.example .env && docker compose up -d` starts the app with no required values beyond Postgres defaults that already work as-is, and everything else is configured from inside the running app.

### Changed
- **Gmail credentials and Campaign send-delay range** moved from a hard `.env` requirement into DB-backed settings (`app_settings`, the same mechanism already used for the NVIDIA key), editable from Settings → Email Sending. `.env` variables for these now only act as an optional one-time seed for headless deployments, never a hard requirement.
- **Fixed the env-overwrites-saved-setting bug**: `db.js` previously re-seeded the NVIDIA key from `.env` unconditionally on every boot, silently discarding anything saved through the UI. `seedSettingIfEmpty()` now seeds only if the setting has no value yet, applied uniformly across all five DB-backed settings. Verified by setting a value via the API, restarting, and confirming it persisted.
- **Sender display name** in outgoing email now comes from your Profile's Full Name field automatically, instead of a dead `config.gmailSenderName` reference that was never defined anywhere and always fell back to a hardcoded stranger's name regardless of who configured the app.
- **`UPLOAD_DIR`** now auto-detects via `os.tmpdir()` instead of a hardcoded `/tmp` path — identical behavior under Docker, but no longer broken if ever run natively on Windows.
- **`JobFinder.desktop`** is now self-healing: `start.sh` regenerates its `Exec=` path on every run, so cloning to any location works without hand-editing the file. Verified by deliberately corrupting the path and confirming it repairs itself.
- Removed the hardcoded personal-name defaults in `db.js`'s schema and `campaignProcessor.js`'s fallback profile — an unconfigured profile now stays honestly empty instead of silently impersonating the original developer.
- Rewrote `.env.example` and `SETUP.md`, which (despite being flagged as inaccurate in the original Prompt 1 audit) still named the wrong AI-provider variable until now — corrected, and restructured around "what's actually required to start" vs. "what's configured in-app."

### Added
- `/api/settings` GET/PUT now covers Gmail credentials (masked app password), the NVIDIA key, and the send-delay range in one contract, replacing the NVIDIA-only-shaped response.
- `POST /api/settings/test-email` — sends a real verification email using whatever is currently typed in the Settings form, so credentials can be confirmed before saving rather than discovered broken mid-campaign.
- A Dashboard banner that appears only when Gmail isn't configured yet, linking straight to Settings.

### Deliberately left manual, with justification
- `DATABASE_URL`/`POSTGRES_*` — the app stores its own configuration in Postgres, so it can't look up how to reach Postgres from Postgres. Has working defaults; no edit needed unless using a non-default database.
- `PORT` — must be known before the process can bind a socket to serve anything, including the UI that would otherwise configure it. Has a working default.

See `docs/manual-configurations.md` for the full current picture, and `docs/refactoring-roadmap.md` for what's still ahead (authentication, encrypted secret storage, durable job processing for Bulk Send/Template Map).

## 2026-06-20 — Repository cleanup & architecture refactoring (Prompt 2)

A full audit (see `docs/`) was completed first with no code changes; this phase implements the cheap, low-risk fixes it identified, with functionality kept identical throughout — verified after every change via a running instance, never just by reading the diff.

### Fixed
- **Security:** `backend/routes/upload.js`'s campaign-creation insert was building SQL via manual string escaping instead of parameterized queries — the one place in the codebase that didn't follow the pattern used everywhere else. Replaced with a proper parameterized multi-row `INSERT`. Verified against a row containing single quotes and SQL-injection-shaped text.
- **Bug:** `bulk.html`/`template-map.html` referenced five CSS custom properties (`--primary`, `--text-muted`, `--card-bg`, `--input-bg`, `--primary-dim`) in 112 places that were never defined anywhere — most visibly, the active-step indicator's highlight color was simply missing. Added as aliases of the existing palette in `style.css`.
- **API:** unmatched `/api/*` routes fell through to Express's default HTML 404 page, which breaks every frontend call site (`api.js` always calls `res.json()` on the response) — the same failure mode behind a previous "Unexpected token '<'" incident. Added `backend/middleware/errorHandler.js` for a JSON 404 on unmatched API paths and a last-resort error handler that never leaks internals.

### Changed
- Removed the unused `bull` npm dependency, the dead `redisUrl`/`nvidiaApiKey` keys in `config.js` (never read anywhere — the real NVIDIA key lookup goes through the `app_settings` DB table), and the `worker` npm script (pointed at a `worker.js` that doesn't exist).
- Removed the obsolete `version` key from `docker-compose.yml`.
- Moved `getSetting()` out of `routes/settings.js` into a new `services/settingsService.js` — a service was importing a function from a route file, backwards from the layering used everywhere else.
- Extracted the ~85 lines of SSE-connection/stop/refresh/break-banner logic duplicated almost verbatim between `bulk.html` and `template-map.html` into a shared `frontend/js/sendProgress.js`, after standardizing the two pages' element IDs to match.
- Replaced the default email body template's hardcoded personal content (a real name, university, **phone number, and personal Gmail address**) in `template-map.html` with generic `[Your Name]`-style placeholders.
- Rewrote `CLAUDE.md`, which had fallen significantly out of date — it described an AI provider (Gemini) and call pattern the code hadn't used in some time, and was missing Bulk Send, Template Map, and History entirely.

### Known, deliberately deferred (not done in this phase)
- `npm audit` found nodemailer (high severity, multiple CVEs including SMTP command injection) and `uuid` (moderate) both need major-version upgrades to resolve — not done here because verifying "email still sends correctly" after a major nodemailer bump requires a real send, which wasn't done autonomously. Needs dedicated, supervised testing.
- `xlsx`'s known prototype-pollution/ReDoS advisories have no fix available from the maintainer at the currently pinned version.
- The dead `config.gmailSenderName` reference in `emailService.js` (every email currently shows a hardcoded sender name regardless of the user's actual profile) is real but requires new configuration plumbing — deferred to the configuration-system phase rather than patched ad hoc here.
- A full `backend/src/`-style folder reorganization was scoped in the audit but not executed — high blast radius across every `require()` path with no test suite to catch a regression, for low payoff at the project's current size.

See `docs/refactoring-roadmap.md` for the full phase plan this work is drawn from.

## Earlier history

Prior to this changelog's existence: initial bulk-email-outreach app (Campaign flow, Excel upload, AI-templated emails, Gmail SMTP), followed by Bulk Send, Template Map, Stop/Refresh controls, a Linux one-click launcher, and the unified History feature. See `git log` for the detailed commit history.
