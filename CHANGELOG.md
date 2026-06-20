# Changelog

All notable changes to this project are documented here. Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

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
