# Startup Readiness Assessment

Each score is 1–10 and reflects current state only, judged against the stated goal of a production-grade, multi-user SaaS product. Evidence references point to the relevant audit doc.

| Dimension | Score | Trend driver |
|---|---|---|
| Architecture | **4/10** | Three parallel send pipelines for one feature; no auth layer; two of three pipelines are not durable |
| Scalability | **2/10** | Single process, no queue despite a queue library already being a dependency, no multi-tenant data model |
| Maintainability | **4/10** | Real duplication and dead code, but consistent file organization where it counts |
| Security | **3/10** | No auth anywhere; one SQL-injection-shaped query; otherwise disciplined query/escaping practices |
| Performance | **5/10** | Nothing broken today; several unbounded/polling patterns that won't survive growth |
| Code Quality | **4/10** | ~150 duplicated lines, 112 dead CSS-variable references, a user-facing bug from a misnamed config field |
| UX | **5/10** | Clean, consistent dark UI; one feature (`preview.html`) actively misleads the user about what it does |
| Documentation | **3/10** | Setup docs contradict the code and each other on a mandatory variable; no README/LICENSE/CONTRIBUTING |
| Deployment | **5/10** | Working Docker Compose + launchers; no CI/CD; one launcher has a machine-specific hardcoded path |
| Developer Experience | **4/10** | Zero tests, zero linting, but a small, readable, end-to-end-comprehensible codebase |

---

## Architecture — 4/10

What pulls it up: routes and services are cleanly separated (`backend/routes/*` vs `backend/services/*`), and the SSE-based progress pattern used by Bulk Send/Template Map is a genuinely good design for live updates without a websocket library.

What holds it down: the same end-user feature ("send personalized bulk email") exists as three independently-implemented pipelines (Campaign / Bulk Send / Template Map — see [architecture.md](architecture.md) §2) with different durability guarantees and no shared code between them. There is no authentication boundary anywhere in the request lifecycle, which means "architecture" today has no answer to "whose data is this?" — every table effectively has exactly one implicit owner. A library for background jobs (`bull`) is already a declared dependency but unused, suggesting the team has identified this gap but not closed it.

## Scalability — 2/10

The app cannot run more than one backend process today without breaking: Bulk Send/Template Map session state lives in a process-local `Map` (`routes/bulk.js:12`) and SSE clients are held in per-process `Set`s (`logger.js:4`, per-session `clients` set in `bulk.js`) — a second instance behind a load balancer would split traffic across two processes with two different, non-shared views of "what's currently sending." There is no horizontal scaling story, no statelessness, and no multi-tenant schema (every table assumes one implicit tenant). This is the single lowest score because it's the most structural — it can't be patched incrementally the way security or docs can.

## Maintainability — 4/10

Concrete, fixable issues drag this down: ~150 lines duplicated between `bulk.html`/`template-map.html` ([code-quality.md](code-quality.md) §1), 112 references to CSS variables that don't exist anywhere ([code-quality.md](code-quality.md) §2), and dead configuration (`redisUrl`, `nvidiaApiKey` field, `worker.js` script pointing at a file that doesn't exist) that misleads anyone reading `config.js`/`package.json` cold. On the positive side, the backend's route/service split and the consistent `pool.query($1,$2)` style (outside one file) mean a contributor reading any *single* backend file in isolation can generally trust it represents the real pattern.

## Security — 3/10

No authentication or authorization exists on any route ([security-audit.md](security-audit.md) §1) — this alone would cap the score regardless of anything else, since it's the one finding that turns every other vulnerability into "exploitable by literally anyone who can reach the port" rather than "exploitable by the trusted single operator." Layered on top: a real SQL-injection-shaped query in `upload.js` ([security-audit.md](security-audit.md) §2), open CORS with no auth boundary to protect, and an unauthenticated console-log stream. The score isn't a 1 because the parts of the app that *do* handle untrusted input correctly (parameterized queries everywhere else, consistent `escHtml()` output encoding, escaped email-HTML generation) are done genuinely well and consistently — there's a real security-conscious instinct here, just not yet applied to authentication or to the one file that skipped parameterization.

## Performance — 5/10

Nothing in the current product is measurably slow at its current single-operator scale — sequential email sending is intentional, not a bug, and the delays that look like "slowness" are deliberate rate-limit avoidance ([performance-audit.md](performance-audit.md) §4). The score reflects forward risk, not present pain: unbounded pagination size parameters, three separate polling loops where SSE already exists as a proven pattern elsewhere in the same codebase, and no caching/compression/rate-limiting anywhere. None of this needs fixing today; all of it needs fixing before "many users at once" is true.

## Code Quality — 4/10

The most damning single fact: `config.gmailSenderName` is referenced in `emailService.js:24` but never defined anywhere, meaning a real, shipped feature (custom sender display name) silently does nothing for every user of the app today ([code-quality.md](code-quality.md) §5). Combined with two different misspellings of the same hardcoded identity coexisting in the same codebase, and a page (`preview.html`) whose own source comment admits its behavior doesn't match its implementation, this reads as a codebase that has been extended quickly and confidently but without enough cross-checking between files that depend on each other.

## UX — 5/10

The visual design is genuinely consistent — one dark theme, one badge/status-pill vocabulary, one card/table pattern, applied uniformly across ten pages. That consistency is real design discipline for a no-framework, no-build-step app. It's pulled down by: `preview.html`'s "Generate then Approve" flow not actually gating anything (a first-time user could reasonably believe they're previewing, and instead have already sent), and by there being three different pages (`upload.html`, `bulk.html`, `template-map.html`) that all do "send personalized bulk email" with no in-app guidance about which one to use when — a new user has no onboarding path telling them "use Campaign for an Excel list you want tracked long-term, use Bulk Send for a quick paste, use Template Map for an Excel list with custom placeholders."

## Documentation — 3/10

`CLAUDE.md` and `SETUP.md` both exist and are reasonably well-written *prose*, but both contain factually wrong information that a reader would have no way to detect without reading the actual source: `SETUP.md` names the wrong AI-provider env var, and `CLAUDE.md` describes an AI provider (Gemini) and call pattern that the current `aiService.js` doesn't use at all ([architecture.md](architecture.md) §5). There is no `README.md` (the file most people look for first), no `LICENSE` (blocking the stated "Open Source Ready" goal outright — the repo cannot legally be reused by anyone else without one), and no `CONTRIBUTING.md`.

## Deployment — 5/10

Docker Compose works end-to-end and was verified functional during this engagement's prior sessions; `start.sh`/`start.bat`/`JobFinder.desktop` give non-technical users a real one-click path on two platforms, which is more deployment thoughtfulness than most projects this size have. It's held back by the hardcoded absolute path in `JobFinder.desktop` (breaks on every clone except the original machine), the complete absence of CI/CD (no automated build/test gate before anything ships), and no distinction anywhere in config between local/staging/production environments.

## Developer Experience — 4/10

There are zero tests and zero linting configured anywhere in the repository (confirmed by direct inspection, consistent with `CLAUDE.md`'s own statement) — a contributor has no automated way to know if a change broke something. Pulling the score up from the floor: the entire backend is under 1,000 lines across 15 files and is genuinely readable start-to-finish in well under an hour, which is a real, if informal, substitute for documentation at this size — that advantage erodes quickly as the codebase grows, which is exactly why tests and CI are positioned early in the roadmap rather than left for later.
