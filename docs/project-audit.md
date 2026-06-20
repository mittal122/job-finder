# Project Audit — Executive Summary

**Project:** Job Finder — AI-assisted bulk email outreach tool
**Audited:** 2026-06-20
**Scope:** Full repository (backend, frontend, Docker, docs, launcher scripts). Every tracked file was read.
**Mode:** Analysis only. No code, config, or git state was changed during this audit.

This document is the entry point into the full audit. Companion documents:

| Doc | Covers |
|---|---|
| [architecture.md](architecture.md) | How the system actually works, end to end |
| [folder-structure.md](folder-structure.md) | Directory layout critique and target structure |
| [code-quality.md](code-quality.md) | Duplication, dead code, smells, maintainability |
| [manual-configurations.md](manual-configurations.md) | Every value a human must set by hand today |
| [security-audit.md](security-audit.md) | Vulnerabilities and risk ranking |
| [performance-audit.md](performance-audit.md) | Bottlenecks and inefficiencies |
| [startup-readiness.md](startup-readiness.md) | 1–10 scores across 10 dimensions |
| [refactoring-roadmap.md](refactoring-roadmap.md) | Phased plan to reach the stated vision |
| [future-improvements.md](future-improvements.md) | Beyond the roadmap — nice-to-haves and compliance |

---

## 1. What this project actually is today

A single-tenant, single-process Node.js/Express app with a vanilla HTML/CSS/JS frontend, backed by one PostgreSQL database, that helps **one person** send personalized cold-outreach emails to recruiters at scale, through their own Gmail account. There is no concept of "users," "accounts," "organizations," or "permissions" anywhere in the code — every route is open, every action operates on global state (one `candidate_profiles` row with `id=1`, one set of app-wide settings, one Gmail identity).

It has grown three semi-independent ways of sending the same kind of email:

1. **Campaign flow** (`upload.html` → `campaigns.html`/`campaign.html`) — Excel-driven, DB-backed (`campaigns` + `email_logs`), durable, generates the email body by template-filling the candidate's bio (no AI call despite the file being named `aiService.js`).
2. **Bulk Send flow** (`bulk.html`) — paste-emails-in-a-textarea, in-memory only (process `Map`, lost on restart), optionally calls an NVIDIA-hosted LLM to swap company names into a fixed template.
3. **Template Map flow** (`template-map.html`) — Excel + `{{placeholder}}` mapping, also in-memory, posts to the *same* `/api/bulk/send` endpoint as #2 (distinguished only by a `source` form field added in the most recent change).

A fourth piece, **History** (`history.html`, added most recently), is the first attempt to unify visibility across all three flows by writing every send attempt into one `send_history` table.

## 2. Headline findings (detail in the linked docs)

- **No authentication or authorization exists anywhere.** Every API route, including ones that send real email through the operator's Gmail account, delete campaigns, or read full send history, is reachable by anyone who can reach the port. Combined with permissive CORS (`cors()` with no origin restriction), this is the single biggest gap between "works for one developer on localhost" and "production-grade SaaS." See [security-audit.md](security-audit.md) §1.
- **One SQL injection-shaped vulnerability**: `backend/routes/upload.js:50-56` builds an `INSERT` statement by string-concatenating user-controlled Excel cell values through a hand-rolled `esc()` function instead of using parameterized placeholders, which is the one query in the whole codebase that doesn't follow the parameterized-query pattern used everywhere else. See [security-audit.md](security-audit.md) §2.
- **Three different, mutually contradictory documented names for the same required env var.** `.env.example` says `GEMINI_API_KEY`, `SETUP.md` says `OPENAI_API_KEY`, the code (`backend/config.js:7`, `backend/db.js:82`) reads `NVIDIA_API_KEY`. A new developer following either doc word-for-word will fail silently. See [manual-configurations.md](manual-configurations.md).
- **The "Email Preview" page's core promise is not implemented.** `frontend/preview.html` advertises "Generate All Emails" then "Approve & Start Sending" as two distinct, safe steps, but clicking "Generate" calls the same `startCampaign()` endpoint that immediately generates **and sends**. The code's own comment admits this ("Actually for preview we just generate without sending" — followed immediately by code that does the opposite). This is a trust-breaking UX bug, not a cosmetic one, in an app whose entire purpose is sending email. See [architecture.md](architecture.md) §5 and [code-quality.md](code-quality.md) §2.
- **The two newest, largest frontend pages (`bulk.html`, 650 lines; `template-map.html`, 814 lines) duplicate ~90–150 lines of SSE/progress/stop/break-banner logic almost verbatim**, and both reference a parallel set of CSS custom properties (`--primary`, `--text-muted`, `--card-bg`, `--input-bg`) that are **never defined anywhere** in `frontend/css/style.css` — 112 references to undefined variables, silently falling back to nothing or to inline fallback values. See [code-quality.md](code-quality.md).
- **Bulk Send and Template Map have no durability.** Send state lives only in a process-local `Map` (`backend/routes/bulk.js:12`). A server restart, crash, or redeploy mid-send loses all progress with no way to resume — the only durable flow is the Campaign one.
- **This is a cold-outreach bulk emailer with no unsubscribe mechanism, no suppression list, and no compliance messaging anywhere** — a real legal/deliverability risk (CAN-SPAM/GDPR) once this leaves "one person emailing on their own behalf" territory. See [future-improvements.md](future-improvements.md).

## 3. What's already done well

- Parameterized queries are used correctly everywhere **except** `upload.js`.
- Output encoding (`escHtml()` in `frontend/js/api.js:56-58`) is applied consistently across every page that renders user/DB-sourced text, which meaningfully limits stored-XSS risk on the frontend.
- Email body HTML generation (`backend/services/emailService.js:47-68`) escapes text before interpolating into HTML — outbound emails aren't trivially injectable either.
- The DB schema auto-applies (`db.js`'s `initDb()`), so there's no separate migration step to forget.
- `.env` is correctly gitignored and not committed; no real secrets were found in tracked files.
- Git hygiene is good: clean working tree, single `main` branch, sensible incremental commit history, no force-pushes or history rewrites.

## 4. Bottom line

The product works and the core idea is sound, but it was built incrementally by adding features (batching, stop/refresh, history) onto a single-tenant, no-auth foundation that was never meant to be multi-user. Turning this into the stated vision — clone, run, configure entirely from a UI, never touch source — requires, in order: fixing the SQL injection and doc/env mismatches (cheap, immediate), introducing a real configuration/setup-wizard layer (medium), then authentication and durable job processing (the two structural changes that actually unlock "SaaS"). The full sequencing is in [refactoring-roadmap.md](refactoring-roadmap.md).
