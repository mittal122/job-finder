# Changelog

All notable changes to this project are documented here. Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

## 2026-06-21 — Multi-user SaaS platform

The project's single biggest architectural gap — no concept of "a user" anywhere — is closed. Every account is now a fully isolated tenant: own profile, own Gmail credentials, own AI key, own campaigns, own history, own suppression list. See `docs/authentication.md` and `docs/multi-tenancy.md` for the full picture; this entry summarizes what changed and how it was verified.

### Added
- **Accounts.** Email+password signup/login (bcrypt-hashed) and optional "Sign in with Google" (`google-auth-library`, entirely optional infrastructure — email+password works standalone if `GOOGLE_CLIENT_ID`/`SECRET` aren't set). New `frontend/login.html`/`signup.html`.
- **Server-side sessions**, not JWT — a `sessions` table keyed by a random 64-character ID in an httpOnly/`SameSite=Lax` cookie. Chosen specifically so logout is a real, immediate revocation (`DELETE FROM sessions`), not just a client-side cookie clear. `requireAuth` middleware gates every route except `/api/auth/*`, `/api/unsubscribe`, and `/api/health`.
- **Complete data isolation.** Every table that used to hold one implicit operator's data (`candidate_profiles`, `campaigns`, `email_logs`, `app_settings`, `mapping_configs`, `send_history`, `suppressions`) now has `user_id NOT NULL`, and every route scopes every query by it. Bulk Send/Template Map's in-memory sessions (not DB rows) store `userId` and check it on `/stop` and `/progress`, returning `404` for both "doesn't exist" and "belongs to someone else."
- **Encryption at rest.** Gmail App Passwords and AI API keys are now AES-256-GCM encrypted in the database (`backend/utils/crypto.js`), keyed by a new required `ENCRYPTION_KEY` env var — the app fails fast at boot if it's missing.
- **A minimal migration runner** (`backend/db/migrate.js`, numbered `.sql` files, a `schema_migrations` tracking table) — introduced specifically because the multi-tenant schema change (rename existing tables, create new ones) is a one-way, sequenced operation that doesn't fit the existing idempotent-`CREATE TABLE IF NOT EXISTS` pattern.
- **Per-user unsubscribe tokens** — signed over `(userId, email)` together instead of just `email`, so suppression is correctly per-sender (one account's recipient unsubscribing never affects another account's ability to email that address) and a token can't be replayed across accounts.
- **CORS restricted** to the app's own configured origin (previously wide open — harmless with no sessions to protect, a real gap with real cookies now) and a dedicated, tighter rate limit on `/api/auth/login`/`signup`.

### Changed
- **Migration strategy for existing deployments: start fresh, by design.** Every existing single-tenant table is renamed to a `_legacy` suffix — untouched, nothing deleted — and fresh `user_id`-scoped tables are created. There is no automatic "claim my old data" flow; sign up for a new account and your old data remains reachable only via direct database access. This was a deliberate choice (confirmed explicitly before implementation) over either auto-creating an account with a generated password or attempting a nullable-`user_id` in-place migration, both of which would have either been less safe or permanently complicated every future query with legacy-row edge cases.
- `/api/logs` is now behind `requireAuth` (previously fully public) — a real improvement, though it's not yet per-tenant scoped (documented as a known gap requiring a future roles system).

### Verified
Every milestone was built and verified in a fully isolated environment (separate Docker project/ports/volumes) before any change touched the real running instance, continuing this project's established testing discipline:
- The multi-tenant migration was tested against simulated pre-existing data (not just a fresh database), confirming legacy data survives byte-for-byte and the same migration is idempotent across restarts. This caught a real bug before it ever reached production: the old baseline schema script's leftover seed `INSERT` would otherwise have failed on every restart once `candidate_profiles` had been renamed out from under it.
- Two real accounts (created via curl and, separately, via the actual browser UI) were used to confirm zero cross-account visibility across every feature — profile, campaigns, settings (including that each account's encrypted Gmail credentials decrypt independently), mapping configs, bulk-send session control, history, and unsubscribe tokens.
- All attempted test sends used fake Gmail credentials, confirmed via the real `BadCredentials` rejection from Google in each case — no real email was sent during any part of this verification.
- The full browser auth flow (signup → dashboard → settings save → logout → session genuinely invalidated server-side → login again → wrong-password error) was driven end-to-end with zero console errors.

### Known, deliberately out of scope
- No password reset / email verification flow — would need a transactional email sender independent of any user's own Gmail credentials.
- No roles/permissions/teams — every account has identical capabilities today; the schema doesn't block adding these later.
- Bulk Send/Template Map sessions remain in-memory only, not durable across a restart — unrelated to multi-tenancy, already tracked in `docs/refactoring-roadmap.md`.

## 2026-06-20 — Transform into a professional SaaS product

A professional-polish and reliability/security-hardening pass within the app's existing single-operator architecture. Authentication and multi-tenancy remain deliberately out of scope here — they're large, multi-session structural changes the project's own roadmap already sequences into dedicated later phases, and attempting them incompletely in this pass would risk leaving the project partially working, which this phase's brief explicitly ruled out.

### Added
- **Unsubscribe links + a suppression list**, across all three send flows. Every outgoing email now carries a signed, per-recipient unsubscribe link (text and HTML body) plus a `List-Unsubscribe` header so Gmail/Outlook show their native one-click unsubscribe UI. The signing secret is auto-generated on first boot and never asked of the user. A suppressed recipient is skipped before AI generation even runs, recorded with a clear reason rather than a generic failure. Verified end-to-end with zero real emails sent, using all-suppressed recipient batches so the actual send call was never reached.
- **Rate limiting** on every endpoint that triggers a real send, AI call, or file upload, via `express-rate-limit` — protects the configured Gmail account and AI API budget from a runaway script or bug. Verified via response headers showing real request counting.
- **Magic-byte file validation** on Excel and resume uploads — content is now checked against the actual file format, not just the client-supplied extension. CSV (which has no reliable binary signature) is deliberately left to the existing parser-based validation. Verified with six scenarios: valid/invalid Excel, valid/invalid resume, and the CSV carve-out.
- **A favicon and meta description**, applied across all 10 pages — no visual branding existed before this.
- **A real Getting Started checklist** on the Dashboard (connect Gmail, fill in profile, send a first email), replacing a banner that only ever nagged about one thing and never went away. Disappears entirely once all three steps are done.

### Fixed
- **nodemailer and uuid upgraded** to resolve known CVEs (nodemailer carried several high-severity advisories including SMTP command injection; uuid had a moderate buffer-bounds issue) — both previously flagged and deliberately deferred pending a safe way to verify a major-version bump. Verified using `transporter.verify()` (a real SMTP login handshake that sends zero messages) against the actual configured Gmail account, plus a full upload/campaign smoke test.
- An inconsistency in `routes/bulk.js`, which read `UPLOAD_DIR` directly from `process.env` with its own separate hardcoded fallback, bypassing `config.js`'s auto-detection entirely — found while adding rate limiting to the same file.

### Known, deliberately out of scope
- Authentication/authorization, durable job processing for Bulk Send/Template Map, and full multi-tenancy remain on `docs/refactoring-roadmap.md` as dedicated future phases — see that document for why these specifically need isolated treatment rather than being folded into a polish pass.
- `xlsx`'s prototype-pollution/ReDoS advisories still have no fix available from the maintainer.
- Secrets in `app_settings` (Gmail App Password, NVIDIA key, the new unsubscribe-signing secret) are still stored in plaintext, not encrypted at rest — tracked in `docs/security-audit.md` finding #10.

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
