# Folder Structure Audit

## Current structure

```
job finder/
├── .env                      # real secrets (gitignored, correctly)
├── .env.example               # WRONG var name for AI key (see manual-configurations.md)
├── .gitignore
├── CLAUDE.md                  # AI-assistant instructions — partially stale (see architecture.md §5)
├── SETUP.md                   # human setup guide — also has a WRONG var name, different from .env.example's wrong name
├── docker-compose.yml
├── JobFinder.desktop           # Linux launcher — machine-specific absolute path baked in
├── start.sh / stop.sh          # Linux/macOS launcher scripts
├── start.bat                   # Windows launcher script
├── docs/                       # ← this audit (did not exist before this pass)
├── backend/
│   ├── server.js               # entrypoint — route mounting, middleware
│   ├── config.js               # env var reads (has 2 dead keys — see code-quality.md)
│   ├── db.js                   # schema DDL + pool + startup seeding logic
│   ├── Dockerfile
│   ├── .dockerignore
│   ├── package.json / package-lock.json
│   ├── routes/                 # 9 files, one per resource — flat, no sub-grouping
│   │   ├── bulk.js             # also contains in-memory session state (not just routing)
│   │   ├── campaigns.js
│   │   ├── emails.js
│   │   ├── history.js
│   │   ├── logs.js
│   │   ├── profile.js
│   │   ├── settings.js         # also exports getSetting() — a service function living in a route file
│   │   ├── template-map.js
│   │   └── upload.js
│   └── services/               # 7 files — business logic, mostly well-separated
│       ├── aiService.js        # misleading name — does no AI call (see architecture.md §5)
│       ├── bulkAiService.js    # the one that actually calls an LLM
│       ├── campaignProcessor.js
│       ├── emailService.js
│       ├── excelService.js
│       ├── historyService.js
│       └── logger.js
└── frontend/                   # no build step — static files served as-is
    ├── index.html / upload.html / campaigns.html / campaign.html / preview.html
    ├── bulk.html / template-map.html / history.html / logs.html / settings.html
    ├── css/style.css           # one global stylesheet, 308 lines
    └── js/
        ├── api.js              # shared fetch client + UI helper functions
        └── layout.js           # sidebar/topbar injection
```

## What's missing relative to a maintainable, contributor-friendly project

| Missing | Why it matters |
|---|---|
| `backend/middleware/` | There is no middleware layer at all today (no auth, no error-handling middleware, no request logging middleware beyond the console patch). Once auth/validation/rate-limiting are added, they need a home that isn't scattered inline in `server.js`. |
| `backend/db/migrations/` | Schema changes are currently hand-edited into one giant `SCHEMA_SQL` template string in `db.js` (113 lines and growing with every feature). `CREATE TABLE IF NOT EXISTS` auto-apply is fine for a single-developer prototype but has no way to express "add a column to an existing table with existing data" safely, no rollback, and no history of what changed when — already showing strain (`db.js:79`'s ad-hoc `UPDATE app_settings SET key='nvidia_api_key' WHERE key='gemini_api_key'` is effectively an inline, one-off migration bolted onto the schema function). |
| `backend/tests/` (any) | Confirmed via `CLAUDE.md` and direct inspection: **zero tests exist anywhere in the repository.** Not even a smoke test for the Excel parser's column-aliasing logic, which is exactly the kind of pure, easily-tested function that benefits most from a unit test. |
| `backend/utils/` | Small shared helpers (`esc()`/`sqlStr()` in `upload.js`, `extractCompany()` in `bulkAiService.js`, `sleep()` defined separately in both `bulkAiService.js` and used differently than the `pauseable()` pattern in `bulk.js`) are scattered inside whichever file needed them first rather than living in one reusable location. |
| `frontend/js/components/` or any shared progress/SSE module | Directly causes the duplication documented in [code-quality.md](code-quality.md) §1 — there is nowhere for `bulk.html` and `template-map.html` to share code even if someone wanted to. |
| `.github/workflows/` | No CI at all — confirmed, directory does not exist. No automated check runs on push or PR (there is currently no PR workflow either, single-branch `main`). |
| `CONTRIBUTING.md`, `LICENSE` | "Open Source Ready" is a stated goal; neither file exists. Without a `LICENSE`, the repository is not legally usable by anyone else even if made public. |
| A root `README.md` | There is `SETUP.md` (setup instructions) and `CLAUDE.md` (AI-assistant instructions) but no actual `README.md` — the file most contributors and GitHub itself look for first. |

## Things that are reasonably organized already

- `backend/routes/` vs `backend/services/` separation (HTTP concerns vs business logic) is a sound, conventional split and is followed consistently — every route file is thin and delegates real logic to a service or directly to `pool.query`, with the noted exception of `upload.js`'s inline SQL building.
- `frontend/js/api.js` as a single shared API client + UI-helper module, imported by every page, is a good pattern for a no-build-step app — it's the right instinct, just not yet extended to cover the send-progress logic that's currently duplicated.
- Docker and non-Docker run paths are both real, working options, not just documented aspirationally.

## Recommended target structure (for the roadmap, not to be done in this analysis pass)

```
backend/
  src/
    config/         # config.js + (new) validateConfig() that fails fast on boot
    db/
      migrations/    # numbered, ordered SQL or a migration tool (node-pg-migrate, Knex, Prisma)
      index.js        # pool export only — no inline DDL
    middleware/        # auth, error handler, rate limiter, request logger
    routes/
    services/
    utils/
  tests/
    unit/
    integration/
frontend/
  pages/             # current top-level .html files, grouped
  js/
    api.js
    layout.js
    components/
      sendProgress.js   # the de-duplicated bulk/template-map shared logic
docs/                 # this audit + future ADRs
.github/workflows/
README.md
CONTRIBUTING.md
LICENSE
```

This is a *target*, not a mandate to restructure immediately — see [refactoring-roadmap.md](refactoring-roadmap.md) for sequencing. Moving files should happen alongside, not instead of, fixing the functional issues found in this audit; a pure reshuffle with no behavior change is lower priority than the security and correctness fixes.
