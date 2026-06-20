# Master Refactoring Roadmap

## Git readiness (verified, not modified)

| Check | Result |
|---|---|
| Working tree | Clean — `nothing to commit, working tree clean` |
| Branches | One: `main` (local and `origin/main`, in sync) |
| Remote | `origin` → `https://github.com/mittal122/job-finder.git` (fetch + push) |
| Default branch | `main` |
| Commit history | 5 commits, all small and individually coherent (`c43e17a` initial commit → `dd4e194` history feature), no force-pushes, no rewritten history |
| `.gitignore` | Covers `node_modules/`, `.env`, `backend/uploads/`, `/tmp/`, OS files, logs, and (as of the most recent commit) local tooling artifacts — correctly excludes secrets |
| Secrets in tracked files | None found (repo-wide grep for key-shaped strings returned only the placeholder in `.env.example`) |

**Verdict:** the repository is in a good state to begin phased work immediately. No git cleanup is required before Phase 0 starts.

## Git workflow for all phases from here forward

Every phase below ends in one or more commits, following these rules (restated here as the agreed process, not yet executed):

- **Conventional Commits** for every commit message: `type(scope): description` — `feat`, `fix`, `refactor`, `cleanup`, `docs`, `chore`, `test`, `security`.
- **Small, logical, reviewable commits.** One concern per commit — e.g., the SQL-injection fix in Phase 0 is its own commit, separate from the doc corrections, even though both land in the same phase.
- **Never bundle unrelated changes.** A CSS-variable fix and an auth middleware addition are different commits even if done in the same sitting.
- **Verify the project builds/starts successfully before every commit** (`docker compose up --build -d` + a health-check curl, at minimum, given there's no automated test suite yet — adding one is itself part of Phase 5).
- **Push after each successful milestone**, not just at the end of a phase, so the remote reflects real progress.

---

## Phase 0 — Stabilize the foundation (fix what's already broken)

**Objective:** Eliminate every correctness/security bug and documentation lie identified in this audit that can be fixed without any architectural change, so every later phase builds on accurate ground.

**Tasks:**
1. Fix `upload.js:50-56`'s manual SQL string-building → parameterized multi-row insert (security-audit.md #2).
2. Correct `.env.example` (`GEMINI_API_KEY` → `NVIDIA_API_KEY`) and `SETUP.md` (`OPENAI_API_KEY` → `NVIDIA_API_KEY`); update `CLAUDE.md`'s description of `aiService.js`/`bulkAiService.js` to match reality.
3. Wire `GMAIL_SENDER_NAME` into `config.js` + `.env.example` (or read from `candidate_profiles.full_name` directly) so `emailService.js:24`'s fallback bug stops shipping "Mittal Domadiya" to every user's recipients.
4. Add the missing CSS variables to `style.css`'s `:root` (or replace the 112 dead references in `bulk.html`/`template-map.html` with the real variable names) — code-quality.md #2.
5. Replace the hardcoded personal sample content in `template-map.html:173,195` with generic placeholder text.
6. Cap pagination `size` params in `emails.js`/`history.js` (e.g., max 200).
7. Remove dead config (`redisUrl`, `nvidiaApiKey` field in `config.js`) or, if a queue is genuinely planned for Phase 4, leave a single `// TODO(phase-4)` note instead of leaving it silently unused.
8. Add `README.md`, `LICENSE`, `CONTRIBUTING.md`.

**Dependencies:** none — this phase can start immediately.
**Estimated complexity:** Low. Every task is a contained, single-file or single-concept change.
**Risks:** Very low. The SQL fix should be tested against the existing Excel-upload happy path (upload a file with a single quote in a company name, confirm it still inserts correctly) before commit.
**Expected outcome:** A developer cloning the repo today and following the docs literally now succeeds on the first try; the one live security bug and the one live user-facing bug (sender name) are closed.
**Commit strategy:** ~8 separate commits, e.g. `fix(db): parameterize email_logs bulk insert in upload route`, `docs(setup): correct AI provider env var name across .env.example, SETUP.md, CLAUDE.md`, `fix(email): wire GMAIL_SENDER_NAME into config instead of hardcoded fallback`, `fix(frontend): define missing CSS variables used by bulk/template-map pages`, `cleanup(template-map): replace personal sample content with generic placeholder`, `fix(api): cap pagination size on emails/history endpoints`, `cleanup(config): remove unused redisUrl/nvidiaApiKey dead config`, `docs: add README, LICENSE, CONTRIBUTING`.

---

## Phase 1 — De-duplicate frontend send logic

**Objective:** Make "how a send's live progress works" exist in exactly one place.

**Tasks:**
1. Extract `connectProgress`, `stopSending`, `refreshProgress`, `startBreakBanner`, `stopBreakBanner`, `handleStopped`/`finish` from `bulk.html` and `template-map.html` into a shared `frontend/js/sendProgress.js`, parameterized by the DOM element IDs each page already uses (or, preferably, standardize the IDs across both pages first so the module needs no parameterization).
2. Remove the now-redundant `--primary`/`--text-muted`/`--card-bg`/`--input-bg` inline `<style>` blocks in both pages once Phase 0's CSS-variable fix lands, replacing hardcoded status hex colors with the real shared variables.

**Dependencies:** Phase 0 (CSS variables must already be correct before consolidating the style blocks).
**Estimated complexity:** Medium — requires careful manual testing of both pages' send flow after extraction, since there's no test suite yet to catch a regression automatically.
**Risks:** Behavioral drift if the two pages' currently-slightly-different DOM IDs aren't reconciled carefully; mitigate by testing a full send-to-completion and a stop-mid-send on both pages before committing.
**Expected outcome:** ~150 fewer duplicated lines; one fix needed instead of two for any future change to send-progress UX.
**Commit strategy:** `refactor(frontend): extract shared sendProgress module from bulk/template-map`, followed by `cleanup(frontend): remove duplicated inline CSS in bulk/template-map pages`.

---

## Phase 2 — Centralized configuration + Setup Wizard

**Objective:** Realize the project's core stated vision — clone, run, configure everything from the UI, never touch source.

**Tasks:**
1. Add `validateConfig()` at boot (`config.js`) that fails fast with a clear, actionable message if `GMAIL_ADDRESS`/`GMAIL_APP_PASSWORD`/`DATABASE_URL` are missing, instead of silently starting and failing later at first-send time.
2. Decide and implement the single source of truth for the NVIDIA key: recommend the env var seeds it **only if `app_settings` has no value yet** (i.e., stop the every-boot overwrite in `db.js:80-89`), so a value saved through the UI persists across restarts.
3. Build a first-run Setup Wizard (new frontend flow, gated to appear until a "setup complete" flag is true) covering: Gmail address + app password (with a live "send test email" verification step), NVIDIA key (optional, explained as "only needed for AI company-name substitution"), and the candidate profile basics currently on `/settings.html`.
4. Add an in-app banner/redirect on every page if setup is incomplete, rather than letting a user discover missing config only when a send fails.

**Dependencies:** Phase 0 (accurate docs/config first).
**Estimated complexity:** Medium-High — this is the first phase that adds new user-facing flow rather than just fixing existing flow.
**Risks:** Scope creep (it's tempting to over-build the wizard); keep it to exactly the fields already inventoried in [manual-configurations.md](manual-configurations.md), no more.
**Expected outcome:** The literal definition of done from the project vision — no source-code editing required for first-time setup.
**Commit strategy:** Incremental: `feat(config): add fail-fast startup validation`, `fix(settings): stop env var from overwriting UI-saved NVIDIA key on every restart`, `feat(wizard): add first-run setup wizard skeleton`, then one commit per wizard step as it's built and tested.

---

## Phase 3 — Authentication & authorization foundation

**Objective:** Close the single largest gap between "works for one trusted person" and "production-grade SaaS" (security-audit.md #1).

**Tasks:**
1. Introduce a `users` table and migrate `candidate_profiles`, `campaigns`, `app_settings`, `mapping_configs`, `send_history` to carry a `user_id` foreign key (this is a real schema migration — see Phase 6 for the migration-tooling work this depends on, or do a manual one-off migration here if Phase 6 hasn't landed yet).
2. Implement session/JWT-based auth with a login/register flow (or OAuth, if a future phase wants "sign in with Google" given the app already deals with Gmail).
3. Add auth middleware (`backend/middleware/requireAuth.js`) and apply it to every route; scope every query by the authenticated `user_id`.
4. Restrict CORS to known frontend origin(s) now that there's a real session boundary to protect (security-audit.md #3).
5. Gate `/api/logs/*` behind auth (security-audit.md #4).

**Dependencies:** Phase 2 ideally complete first (so the wizard can become part of the signup flow), but this phase can technically proceed in parallel if resourced separately.
**Estimated complexity:** High — this is a genuine architectural change touching every table and every route.
**Risks:** This is the highest-risk phase in the roadmap: a half-migrated multi-tenant schema is worse than a clearly single-tenant one. Do it as one complete, well-tested phase, not piecemeal across unrelated feature commits.
**Expected outcome:** The app can safely have more than one user without any of them seeing or affecting another's data.
**Commit strategy:** This phase alone likely warrants its own short-lived feature branch given its size and risk, with small commits inside it (`feat(db): add users table and user_id columns`, `feat(auth): implement session-based login`, `feat(auth): add requireAuth middleware to all routes`, `security(cors): restrict allowed origins`, `security(logs): gate log stream behind auth`), merged to `main` only once the whole phase passes manual end-to-end testing.

---

## Phase 4 — Durable, unified send pipeline

**Objective:** Give Bulk Send and Template Map the same durability the Campaign flow already has, and stop maintaining three separate send implementations.

**Tasks:**
1. Replace the in-memory `Map` in `routes/bulk.js` with a DB-backed job/queue table (reusing the already-declared `bull` + introducing actual Redis, or a simpler DB-polling queue if Redis is deemed unnecessary infrastructure for this product's scale).
2. Unify the Campaign, Bulk Send, and Template Map "generate + send one row" logic behind a single processor function parameterized by source, so a future bug fix is made once.
3. Make Bulk Send/Template Map sends resumable across a server restart, matching Campaign's existing behavior.

**Dependencies:** Phase 3 (jobs need a `user_id` to belong to once auth exists) is a soft dependency — this phase delivers value even without auth, but should be sequenced after if both are being actively worked.
**Estimated complexity:** High — touches the core product loop directly.
**Risks:** Regressions in the Stop/Refresh/break-banner UX added recently; preserve the existing interruptible-sleep pattern (`pauseable()`) as the model even inside a real queue worker.
**Expected outcome:** One send pipeline, three entry points; no more "lost progress on restart" for two-thirds of the product's send features.
**Commit strategy:** `feat(queue): introduce durable job table for bulk/template-map sends`, `refactor(send): unify campaign/bulk/template-map processing into one processor`, `feat(send): make bulk/template-map sends resumable across restarts`.

---

## Phase 5 — Compliance, rate limiting, and upload hardening

**Objective:** Close the remaining security/performance/legal gaps before any real external traffic.

**Tasks:**
1. Add an unsubscribe link + a suppression/do-not-contact list, checked before every send (security-audit.md #9).
2. Add per-route rate limiting (e.g., `express-rate-limit`) on upload/generate/send endpoints.
3. Validate uploaded file type via magic bytes (not just extension) for both Excel and resume uploads; split the global 50MB body-size limit into purpose-specific limits.
4. Upgrade/patch the `xlsx` dependency and confirm it's not on a version with known prototype-pollution/ReDoS CVEs.

**Dependencies:** None strictly, but logically follows once auth (Phase 3) exists to scope a suppression list per-tenant.
**Estimated complexity:** Medium.
**Risks:** Low, mostly additive changes.
**Expected outcome:** The product is legally and operationally safer to run at any real volume.
**Commit strategy:** `feat(compliance): add unsubscribe link and suppression list`, `security(api): add rate limiting to upload/send endpoints`, `security(upload): validate file type via magic bytes`, `chore(deps): upgrade xlsx to patched version`.

---

## Phase 6 — Observability, tests, and CI/CD

**Objective:** Give the project the safety net it currently has none of.

**Tasks:**
1. Add a real migration tool (`node-pg-migrate` or similar) and convert `db.js`'s monolithic `SCHEMA_SQL` into numbered migrations.
2. Add unit tests for pure logic first (`excelService.js` column-aliasing/validation, `aiService.js` template-filling) — highest value-per-effort given zero current coverage.
3. Add integration tests for at least the Campaign and Bulk Send happy paths.
4. Add a GitHub Actions workflow: install, lint (add ESLint — currently none), run tests, on every push/PR.
5. Replace ad-hoc `console.error` sprinkled through services with structured logging that's safe-by-default (no accidental credential logging) — formalizes the good instinct already mostly followed.

**Dependencies:** Best done after Phase 4 (so tests are written against the final unified send pipeline, not the soon-to-be-replaced one).
**Estimated complexity:** Medium, but ongoing rather than one-shot — test coverage should keep growing with every future feature commit, not just in this phase.
**Risks:** Low.
**Expected outcome:** Future changes can be verified automatically instead of by hand; the project becomes safe for outside contributors to touch.
**Commit strategy:** One commit per test suite added, one commit for the CI workflow file, one commit for the migration-tool conversion (this last one deserves its own careful review since it changes how schema changes are applied going forward).

---

## Phase 7 — True multi-tenant SaaS hardening

**Objective:** The final layer once everything above is in place — per-tenant credential isolation, usage controls, and (if needed) billing.

**Tasks:**
1. Per-tenant Gmail/SMTP credential storage, encrypted at rest (not the current plain-`TEXT` `app_settings` pattern).
2. Per-tenant usage/cost limits on AI calls and email sends.
3. RBAC if the product grows beyond one-user-per-tenant (e.g., a team sharing one outreach campaign).
4. If monetized: integrate a billing provider and usage metering.

**Dependencies:** Phases 3 and 4 must both be complete.
**Estimated complexity:** High, and genuinely open-ended — scope this phase concretely against real customer demand rather than building speculatively.
**Risks:** Building this before there's a real second tenant to validate against is the classic premature-scaling trap; treat Phase 7 as "ready to start when needed," not "next on the list by default."
**Expected outcome:** The product can actually be sold/operated as a multi-tenant SaaS, not just architecturally capable of it.
**Commit strategy:** To be planned when this phase actually starts — too far out to commit to a specific commit breakdown now.
