# Multi-Tenancy

## What changed

Every table that used to hold exactly one implicit operator's data now belongs to a `user_id`:

| Table | Was | Now |
|---|---|---|
| `candidate_profiles` | One row, `id=1`, seeded on boot | One row per user, keyed by `user_id` (created at signup) |
| `campaigns` / `email_logs` | Global | `user_id NOT NULL`, every query scoped |
| `app_settings` | Global key-value (one Gmail account, one AI key for the whole app) | `(user_id, key)` composite key — every account has its own Gmail credentials, AI key, send-delay preference |
| `mapping_configs` | Global | `user_id NOT NULL` |
| `send_history` | Global | `user_id NOT NULL` |
| `suppressions` | Global, keyed by `email` alone | `(user_id, email)` — a recipient unsubscribing from one account's sends never affects another account's ability to email that same address |

One exception: `app_config` (a new, separate, genuinely-global table) holds the single HMAC secret used to sign unsubscribe tokens. It doesn't need to differ per user — its only job is preventing token forgery — and a single secret avoids a chicken-and-egg problem for brand-new accounts with no settings yet.

## How isolation is enforced

Every route that touches user-owned data filters by `req.user.id` (attached by `requireAuth`, see `docs/authentication.md`) — there is no separate authorization layer to misconfigure; the same `WHERE user_id = $1` pattern is repeated everywhere. A few things worth knowing about edge cases:

- **Bulk Send/Template Map's in-memory sessions** (`backend/routes/bulk.js`) aren't database rows, so they can't rely on a SQL `WHERE` clause. Each session object stores `userId` at creation time, and `/stop/:sessionId` and `/progress/:sessionId` both check `session.userId === req.user.id` before allowing access — returning `404` (not `403`) for both "doesn't exist" and "belongs to someone else," so a session ID never reveals whether it belongs to another account.
- **Unsubscribe tokens** are signed over `(userId, email)` together, not just `email` (`backend/services/suppressionService.js`). A token generated for one account's send cannot be replayed to suppress an address under a different account.
- **`/api/logs`** is now gated behind `requireAuth` (a real improvement over its previous fully-public state), but it is *not* per-tenant scoped — it streams the same global backend console to any logged-in account, which could include another tenant's recipient emails or error details appearing in log lines. Building proper per-tenant log scoping (or restricting the page to an admin role) requires a roles/permissions system that doesn't exist yet — this is a known, deliberately deferred gap, not an oversight. Worth fixing before this app has tenants who don't already trust each other.

## Secrets at rest

Gmail App Passwords and AI API keys are encrypted with AES-256-GCM before being written to `app_settings` (`backend/utils/crypto.js`, wired into `backend/services/settingsService.js`). The encryption key comes from the **required** `ENCRYPTION_KEY` environment variable — the app fails fast at boot with a clear error if it's missing (`openssl rand -hex 32` to generate one). This key cannot be auto-generated and stored in the database the way other secrets in this app are (e.g., the unsubscribe-signing secret) — a database dump would then contain both the ciphertext and the key needed to read it, defeating the point.

## Migrating from the old single-tenant schema

If you're upgrading an existing deployment rather than starting fresh, this matters to you directly. The migration (`backend/db/migrations/002_multi_tenant_rename.sql`) does **not** try to map your old single-operator data onto a new account automatically. Instead:

1. Every existing table is renamed with a `_legacy` suffix (`campaigns_legacy`, `app_settings_legacy`, etc.) — untouched, nothing deleted, but no longer queried by any current route.
2. Fresh, empty replacement tables are created with the new `user_id`-scoped schema.
3. You sign up for a new account through the app itself and start from a clean slate.

This was a deliberate choice, not a limitation worth working around: it keeps the new schema simple (no nullable `user_id` columns, no partial indexes, no "what if this row predates accounts" branches anywhere in application code) at the cost of not automatically carrying old data forward. If you need your old data, it's sitting intact in the `_legacy` tables — reachable via direct database access, not through the app.

## What this does and doesn't unlock yet

This phase delivers complete data isolation between independent accounts — the core requirement for "more than one person can use this app without seeing each other's data." It deliberately does **not** include:
- **Teams/organizations** — every account is a standalone tenant; there's no concept of multiple people sharing one workspace.
- **Roles/permissions** — every account has identical capabilities; there's no "admin" distinct from a regular user (see the `/api/logs` note above for where this gap is most visible).
- **Usage limits/billing** — nothing currently stops one account from sending as much as their own Gmail account allows.

The schema doesn't block adding any of these later (a `teams` table, a `role` column, a `usage_limits` table would all layer on without restructuring what exists), but none of them are built — consistent with the project's roadmap, which scoped this phase to data isolation specifically and left those as separate future work.
