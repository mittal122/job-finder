# Security Audit

Findings are ranked by severity given the product's *intended* future (multi-user SaaS), not just its current single-operator deployment — several "low risk today" items become "critical" the moment this is exposed beyond one trusted person on localhost.

> **Status update:** Findings #2, #6, #7 (partially), #8, and #9 below have since been fixed — see `CHANGELOG.md`'s "Transform into a professional SaaS product" entry for what changed and how each fix was verified. The original findings are left as-written below for historical context (this audit is a point-in-time document); treat the CHANGELOG as the current source of truth on what's actually still open. #1, #3, #4, #5, and #10 remain open and unaddressed.

## Severity ranking

| # | Finding | Severity (today) | Severity (as SaaS) | Status |
|---|---|---|---|---|
| 1 | No authentication/authorization anywhere | Low (single operator) | **Critical** | Open — deliberately deferred, see `refactoring-roadmap.md` Phase 3 |
| 2 | SQL injection shape in `upload.js` | Medium | **Critical** | **Fixed** — parameterized query |
| 3 | Unrestricted CORS + no auth = CSRF-equivalent | Low | **High** | Open — depends on #1 |
| 4 | Unauthenticated console-log SSE stream | Low | **High** | Open — depends on #1 |
| 5 | NVIDIA API key dual-source-of-truth, masked-not-hashed | Low | Medium | Dual-source-of-truth bug fixed; still stored in plaintext (see #10) |
| 6 | No file-type/content validation on uploads | Low | Medium | **Fixed** — magic-byte checks on Excel/resume uploads |
| 7 | `xlsx` (SheetJS) 0.18.5 — check against known CVEs | Low–Medium | Medium | nodemailer/uuid CVEs **fixed**; xlsx itself still has no fix available upstream |
| 8 | No rate limiting on any route | Low | High | **Fixed** — express-rate-limit on send/upload/generate endpoints |
| 9 | No outbound email compliance (unsubscribe, suppression) | Medium (Gmail ToS / deliverability) | High (legal: CAN-SPAM/GDPR) | **Fixed** — signed unsubscribe links + suppression list on every send flow |
| 10 | Secrets only in `.env`, no secret-manager integration | Low | Medium (multi-env deployments) | Open — `app_settings` secrets (Gmail password, NVIDIA key, unsubscribe signing secret) remain plaintext at rest |

---

## 1. No authentication or authorization (Critical for SaaS)

There is no login, session, token, or API key check anywhere in `backend/server.js` or any route file. Every endpoint — including ones that:
- send real email through the operator's Gmail account (`/api/bulk/send`, `/api/campaigns/:id/start`),
- delete data (`/api/campaigns/:id` DELETE, `/api/history/:id` DELETE, `/api/template-map/configs/:id` DELETE),
- read the full send history and profile (`/api/history`, `/api/profile`),
- view a masked-but-still-fingerprintable API key status (`/api/settings` GET),

is reachable by any client that can route to the port. `candidate_profiles` is structurally single-row (`WHERE id=1`, `routes/profile.js:7`), so there is currently no data model for "more than one identity" even if auth were bolted on naively — this needs to be a first-class schema change (see [refactoring-roadmap.md](refactoring-roadmap.md)), not just a middleware add.

**Why it matters even pre-SaaS:** if this is ever run on a shared machine, a home network, or a cloud VM with the port open, anyone on that network can use someone else's Gmail account to send arbitrary email and read their entire outreach history.

## 2. SQL injection shape — `backend/routes/upload.js:50-56`

```js
const insertValues = validation.valid_rows.map(row =>
  `('${uuidv4()}', '${campaignId}', ${sqlStr(row.hr_name)}, '${esc(row.company_name)}', '${esc(row.email)}', ${sqlStr(row.job_role)}, 'PENDING')`
).join(',');

await pool.query(
  `INSERT INTO email_logs (id, campaign_id, hr_name, company_name, email, job_role, status) VALUES ${insertValues}`
);
```

This is the **only** query in the entire codebase that does not use `pool.query(text, params)` parameter placeholders. Instead it hand-rolls escaping via:
```js
function esc(v) { return String(v || '').replace(/'/g, "''"); }
```
This single-quote-doubling approach is the classic, historically-exploitable pattern for SQL injection: it does not account for encoding edge cases, NUL bytes, or driver/charset-specific escape rules, and — more importantly — it's simply unnecessary risk when `pg`'s parameterized queries (used correctly in every other file: `campaigns.js`, `emails.js`, `profile.js`, `history.js`, `template-map.js`, `settings.js`) already solve this safely.

**Attack surface:** every field comes straight from user-uploaded Excel cells (`excelService.js` does no sanitization beyond `String(v||'').trim()` and an email-format regex on the `email` column only — `hr_name`, `company_name`, and `job_role` are free text). Given there's also no auth (#1), anyone can upload a crafted `.xlsx` with a `company_name` cell like `Acme', 'x', 'x@x.com', 'x', 'PENDING'); DROP TABLE campaigns; --` and have it concatenated into a live INSERT statement. The `esc()` function would neutralize the literal single quotes in that *specific* string, but the underlying pattern is exactly the one that security reviews exist to catch — hand-written escaping should never substitute for parameterization when parameterization is this easy to use (it already is, two lines below it).

**Fix:** rewrite as a single parameterized multi-row insert (e.g. `INSERT ... VALUES ($1,$2,...),($7,$8,...)` with a flat params array, or loop with individual parameterized inserts inside a transaction). This is a small, contained, low-risk change — good candidate for the very first roadmap phase.

## 3. Open CORS + no auth = effective CSRF

`backend/server.js:22`: `app.use(cors())` with no options object — this defaults to `Access-Control-Allow-Origin: *` for every route. Combined with #1 (no auth, no CSRF token, no SameSite-cookie boundary because there are no cookies at all), any website a victim's browser visits could issue `fetch()` calls directly to this app's API from arbitrary origins and have them succeed, if the app is reachable from that browser (e.g., on a LAN, a tunnel, or a misconfigured public deployment). There's no session to "ride," but there's also nothing stopping a third-party page from triggering `/api/bulk/send` or `/api/campaigns/:id/start` against the app on a victim's behalf.

**Fix:** once auth exists, restrict CORS to known frontend origin(s) explicitly (`cors({ origin: [...] })`); until then, this is a true non-issue *only* because there's also no auth to forge against — but it must be fixed in the same phase as #1, not separately.

## 4. Unauthenticated console-log stream — `backend/services/logger.js` + `routes/logs.js`

`console.log/info/warn/error` are globally monkey-patched (`logger.js:30-38`) and every call is broadcast over an **unauthenticated** SSE endpoint (`GET /api/logs/stream`) and exposed at `/logs.html`. Today this mostly surfaces operational messages (`[bulk-send] Sending 3/40 to x@y.com`), but:
- `campaignProcessor.js` and `bulk.js` log raw `err.message` from nodemailer/AI-client failures (`console.error(\`[bulk-send] Failed ${it.email}: ${err.message}\`)`, `routes/bulk.js:127`) — SMTP auth failures, stack traces, or future bugs that accidentally log a request body could leak through this channel to anyone who can load `/logs.html`.
- There is no level filtering server-side (the buffer keeps everything; client-side filtering in `logs.html` is cosmetic only).

**Fix:** once auth exists, gate `/api/logs/*` behind it. Independently of auth, audit every `console.error(err.message)` call site to ensure no credential or PII ever ends up in `err.message` (mostly true today, but not guaranteed going forward without a lint rule or convention).

## 5. NVIDIA API key handling

- Read on the Settings page is masked (`key.slice(0,8) + '••••••••' + key.slice(-4)`, `routes/settings.js:14`) — reasonable for display, but the **full plaintext key is stored unencrypted** in `app_settings.value` (a plain `TEXT` column, `db.js:62-65`). For a single-operator local Postgres this is low risk; for a hosted multi-tenant version, secrets must move to an encrypted-at-rest store or a dedicated secrets manager, not a plain settings table.
- As documented in [architecture.md](architecture.md) §6, `.env`'s `NVIDIA_API_KEY` silently overwrites the DB value on every restart (`db.js:80-89`) — a confusing-but-not-exploitable footgun, included here because "silent overwrite of a credential" is exactly the kind of behavior that becomes a security incident report once there's more than one operator.

## 6. Upload validation gaps

- `frontend/upload.html:51,73` set `accept=".xlsx,.xls"` / `accept=".pdf,.doc,.docx"` — **client-side hints only**, trivially bypassed.
- Backend (`routes/upload.js:34-39`, `routes/bulk.js:60-73`) never checks the resume file's actual MIME type, magic bytes, or extension against an allow-list before writing it to disk and later attaching it to outgoing email. A user (and, per #1, *anyone*, since there's no auth) can upload an arbitrary file type.
- No virus/malware scanning of uploaded attachments before they're emailed out under the operator's identity.
- The Excel parser (`excelService.js`) only validates the `email` column format; `hr_name`, `company_name`, `job_role` are stored and later sent to recruiters as free text with no length cap and no content filtering.

**Fix:** validate uploaded file extension + sniffed MIME/magic-bytes server-side for both Excel and resume uploads; cap resume file size independently of the global 50MB body limit; consider a malware-scan hook (e.g., ClamAV sidecar) before attaching any third-party-originated file to outbound mail, since this becomes more important the moment "upload a resume" can be triggered by someone other than the account owner.

## 7. Dependency: `xlsx` (SheetJS) `^0.18.5`

`backend/package.json:21`. SheetJS's npm-published `xlsx` package has had publicly disclosed prototype-pollution and ReDoS issues in versions prior to `0.19.x` (SheetJS moved primary distribution off npm for a period). Given this package parses **untrusted, user-uploaded files** in two places (`excelService.js`, `routes/template-map.js:13`), it's a meaningful supply-chain/dependency-security item to formally verify against the currently pinned version and upgrade or pin to a patched release.

## 8. No rate limiting anywhere

No route — not `/api/upload`, not `/api/bulk/send`, not `/api/bulk/generate` (which fans out to a paid LLM API per email) — has any request-rate or concurrency limiting. Today this mostly risks the operator's own Gmail account being flagged/suspended by Google for sending volume, or burning through NVIDIA API credits; once multi-tenant, it's a direct cost-control and abuse-prevention gap (one tenant could exhaust a shared resource or another tenant's email reputation has no isolation).

## 9. Outbound compliance — no unsubscribe/suppression mechanism

This product's entire purpose is sending unsolicited-by-the-recipient bulk email ("cold outreach to recruiters"). There is no unsubscribe link generation, no suppression/do-not-contact list, and no physical-address/sender-identity footer logic anywhere in `emailService.js`. This is a genuine CAN-SPAM (US) / PECR or GDPR (EU, if recipients are there) exposure once volumes or audiences grow beyond "a few dozen recruiters a person knows they're allowed to email," and it's also a practical Gmail-deliverability risk (recipient spam-reports against a personal Gmail account can get that account rate-limited or suspended regardless of legal compliance). See [future-improvements.md](future-improvements.md) for a fuller treatment — this is flagged here because it is a security/risk item, not just a feature gap.

## 10. Secrets management

Only mechanism today is `.env` + `dotenv`, read once at boot. No integration with any secret manager (AWS Secrets Manager, GCP Secret Manager, Vault, Doppler, etc.). Acceptable for local/single-operator use; a hosted multi-tenant deployment will need per-tenant credential storage that is encrypted at rest (this overlaps with #5 — the `app_settings` table's `nvidia_api_key` is the first instance of a pattern that needs to generalize properly, not multiply).

---

## What is already done correctly (don't regress these)

- **Parameterized queries** everywhere except the one call site in #2 — `campaigns.js`, `emails.js`, `profile.js`, `history.js`, `template-map.js`, `settings.js` all use `$1`/`$2`-style placeholders correctly.
- **Consistent output encoding.** `frontend/js/api.js:56-58`'s `escHtml()` is applied before interpolating any DB-sourced or user-sourced string into `innerHTML` across every page audited (`campaign.html`, `campaigns.html`, `history.html`, `settings.html`, `bulk.html`, `template-map.html`, `preview.html`, `index.html`) — this is a real, consistently-applied mitigation against stored/reflected XSS on the frontend and should be preserved as a hard rule for any new page.
- **Outbound HTML escaping.** `emailService.js:47-68`'s `bodyToHtml()`/`esc()` escape `&`, `<`, `>` in email body text before wrapping it in HTML for the outgoing message, so a malicious bio/template can't trivially break the recipient's rendering or inject markup into the sent email.
- **`.env` is gitignored and not committed**; a repo-wide grep for API-key-shaped strings found none in tracked files.
- Resume filename handling (a past fix, confirmed still in place) correctly separates the on-disk storage name from the recipient-visible attachment filename (`emailService.js:31-36`), so original filenames are preserved without relying on the disk path being shaped a particular way — good separation of concerns to keep when refactoring.
