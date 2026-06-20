# Manual Configurations — Full Inventory

This is the complete list of every value a new developer or operator must set by hand today, gathered from a full read of every file in the repository. It is the direct input into the future Setup Wizard (see [refactoring-roadmap.md](refactoring-roadmap.md) Phase 2) — everything in this list is a candidate to move from "manual file edit" to "filled in through a UI on first run."

## Critical: documentation/code mismatch on the AI key

| File | Says the var is | Reality |
|---|---|---|
| `.env.example:8` | `GEMINI_API_KEY` | **Wrong** |
| `SETUP.md:22` | `OPENAI_API_KEY` | **Wrong** |
| `backend/config.js:7`, `backend/db.js:82` | — | `NVIDIA_API_KEY` is what's actually read |

Three files, three different names, for one variable. Any new developer who follows either doc verbatim sets a value the code never reads, then hits a confusing runtime failure ("NVIDIA API key not configured") with no clue why. This must be fixed as a near-zero-risk, immediate documentation correction regardless of when the larger roadmap begins.

## Environment variables (`.env`)

| Variable | Read at | Purpose | Mandatory | Notes |
|---|---|---|---|---|
| `DATABASE_URL` | `config.js:5` | Postgres connection | Yes | Default points at `localhost` — fine for bare-metal, overridden by Docker Compose |
| `POSTGRES_USER`/`PASSWORD`/`DB` | `docker-compose.yml:7-9` | Container init | Yes, if using Docker | |
| `NVIDIA_API_KEY` | `db.js:82` → seeds `app_settings` | AI personalization (Bulk Send/Template Map only, conditionally) | Yes, for that feature only | **Overwrites whatever was saved via the Settings UI, every restart** — see below |
| `GMAIL_ADDRESS` | `config.js:8` | SMTP auth + From address | Yes | |
| `GMAIL_APP_PASSWORD` | `config.js:9` | SMTP auth | Yes | Requires Google 2FA enabled first |
| `EMAIL_DELAY_MIN`/`MAX` | `config.js:11-12` | Campaign-flow only inter-email delay | Optional | Defaults 30/60s. Bulk Send/Template Map have their own UI-configurable delay instead |
| `PORT` | `config.js:4` | Listen port | Optional | Default 8000 |
| `UPLOAD_DIR` | `config.js:10`, `bulk.js:9` | Temp resume storage | Optional | Default `/tmp/jobfinder_uploads` — **breaks on native Windows without Docker** |
| `REDIS_URL` | `config.js:6` | — | N/A | **Dead.** Never read anywhere else. Remove or wire up for real. |

## The NVIDIA-key dual-source-of-truth footgun

`db.js:77-91`'s `initDb()` runs this on **every server boot**:
```js
const envKey = process.env.NVIDIA_API_KEY || '';
if (envKey) {
  await pool.query(`INSERT INTO app_settings ... ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [envKey]);
}
```
If you set the key via the Settings page (`frontend/settings.html`'s "API Settings" card) **and** have `NVIDIA_API_KEY` in `.env`, the `.env` value silently wins on every restart, discarding whatever was typed into the UI. Document this explicitly until a future phase makes one of the two the single source of truth (recommendation: env var becomes "initial seed only," and the Settings UI value, once set, should not be clobbered — see roadmap).

## Third-party credentials / services

| Service | Used for | Mandatory | How to obtain |
|---|---|---|---|
| Gmail App Password | All outbound email (SMTP, hardcoded to `smtp.gmail.com:587` in `emailService.js:7-8`) | Yes | 2FA on the Gmail account, then https://myaccount.google.com/apppasswords |
| NVIDIA NIM API key | AI company-name substitution (`build.nvidia.com`, model `meta/llama-3.3-70b-instruct`) | Only for that one feature | Free account at https://build.nvidia.com |

No AWS/GCP/Azure, no OAuth, no webhooks, no Slack/Discord integration exist anywhere in the codebase — confirmed by full read.

## Local file paths that must be hand-edited

| File | Line | Issue |
|---|---|---|
| `JobFinder.desktop:6` | `Exec=bash -c 'cd "/media/sun/drive/devops project/job finder" && bash start.sh'` | Absolute path hardcoded to the original developer's machine/mount point. Must be edited (or regenerated) for any other clone location. |

## Hardcoded identity/content values that should not ship as defaults

| Value | Location(s) | Why it matters |
|---|---|---|
| `'Mittal Domadiya'` | `emailService.js:24` (always used — see below) | **Bug, not just placeholder**: `config.gmailSenderName` is referenced here but never defined anywhere in `config.js`, so this hardcoded fallback is *always* what recipients see as the sender name, regardless of what the user sets in their Profile. |
| `'Mittal Domaidya'` (different spelling) | `db.js:11` (schema default), `campaignProcessor.js:15` (fallback profile) | Cosmetic until Profile is filled in, but two different misspellings of the same hardcoded name exist simultaneously in the codebase. |
| Full sample bio (name, CHARUSAT, B.Tech CS, **real phone number, real personal Gmail address**) | `frontend/template-map.html:173,195` (original audit) — **fixed in the Prompt 2 cleanup pass, replaced with generic `[Your Name]`/`[Your University]`-style placeholders; see CHANGELOG.md** | This was **real personal content and real contact details**, not a generic placeholder. Note: replacing the working file does not remove this data from prior git history/commits already pushed to the remote — that's a separate decision (history rewrite or making the repo private) the project owner should make deliberately, not something done automatically as part of a cleanup pass. |
| Placeholder text only (no risk) | `frontend/settings.html:25`, `frontend/bulk.html:193` | Cosmetic `placeholder=` attributes — never submitted as data. |

## First-run application configuration (not files — done through the running app's UI)

These aren't config files, but they are mandatory manual steps before the app is usable for real, and are exactly the kind of thing a Setup Wizard should walk a new user through directly instead of leaving as "go find the right page":

1. `/settings.html` → **Personal Information / Professional Links / Bio / Skills / Projects** — replace all "Mittal Domaidya/Domadiya" defaults with the operator's real information. The Bio field is used verbatim as the AI email template for the Campaign flow (`aiService.js:21-22` throws an error if it's empty), so this is not optional if the Campaign flow will be used.
2. `/settings.html` → **API Settings** card — paste the NVIDIA key here *if* not set via `.env` (remember the overwrite behavior above).
3. `/template-map.html` → replace the default sample bio/template text before using this flow for real sends.

## Ports / hosts

| Item | Value | Source | Notes |
|---|---|---|---|
| Backend HTTP | `8000` | `config.js:4` | Frontend is served from the same origin — no separate frontend URL to configure |
| Postgres | `5432` | `docker-compose.yml:11` | |
| Frontend → backend base URL | `window.location.origin + '/api'` (`api.js:2`) | Already relative — no hardcoded host anywhere on the frontend, good |

## Things that need no manual setup

- DB schema — auto-applied on every boot via `initDb()`.
- `.env` is correctly gitignored; confirmed via `git ls-files` that it's never been committed.
- No CI/CD config exists to configure (none is present at all — see [folder-structure.md](folder-structure.md)).

## Setup-Wizard implication

Every row in this document that is a *value* (not a doc-correction or a code-bug) is a literal candidate field for the future setup wizard described in the project vision: Gmail address + app password, NVIDIA key, candidate profile basics, and a one-time confirmation that the default template-map sample content has been replaced. The wizard's job is to make every one of these the *only* place a human ever has to type them — see [refactoring-roadmap.md](refactoring-roadmap.md) Phase 2 for the concrete plan.
