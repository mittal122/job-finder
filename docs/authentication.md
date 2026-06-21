# Authentication

## Overview

Every account can sign up and log in two ways: email + password, or "Sign in with Google." Both result in the same session mechanism afterward — how you proved who you are doesn't change how the app treats you once logged in.

## Email + password

- Passwords are hashed with bcrypt (`bcryptjs`, cost factor 12) — never stored or logged in plaintext. `backend/services/authService.js`'s `hashPassword`/`verifyPassword`.
- Signup requires a valid-looking email and an 8+ character password (`backend/routes/auth.js`). Duplicate emails are rejected with a 409.
- `POST /api/auth/login` / `POST /api/auth/signup` are rate-limited (10 attempts/15min per IP) via `backend/middleware/rateLimiter.js`'s `authLimiter` — both are classic brute-force targets.

## Sessions, not JWT

A session is a row in the `sessions` table: a random 64-character hex ID (`crypto.randomBytes(32)`), the `user_id` it belongs to, and an expiry (30 days from creation). The ID is set as an httpOnly, `SameSite=Lax` cookie (`Secure` in production) — never readable by JavaScript, never sent cross-site except top-level navigations.

This was chosen over a stateless JWT specifically because:
- **Revocation is trivial.** Logout is a single `DELETE FROM sessions WHERE id = ...` — the session is genuinely gone, not just removed from the client. A stolen session ID stops working the moment it's revoked, not only when it expires.
- **No additional signing secret needed.** Security comes from the ID being unguessable (256 bits of randomness) plus the server-side lookup, not from a cryptographic signature — one less secret to manage.

`backend/middleware/requireAuth.js` reads the cookie, looks up the session, and attaches `req.user = { id, email }` to the request — or returns `401` if missing/expired. It's mounted once in `server.js`, after the public routes (`/api/auth/*`, `/api/unsubscribe`, `/api/health`) and before every other route, so no individual route file needs its own auth check.

## Google sign-in (optional)

Wired through `google-auth-library`'s `OAuth2Client` rather than the heavier Passport.js, specifically so it could plug into the same session mechanism above instead of bringing its own session-management opinions.

- `GET /api/auth/google` redirects to Google's consent screen; `GET /api/auth/google/callback` exchanges the code, verifies the ID token, and finds-or-creates a user by `google_id` or matching email (an existing password account signing in with Google for the first time gets linked, not duplicated).
- **Entirely optional infrastructure.** If `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` aren't set, `GET /api/auth/google-enabled` returns `{ enabled: false }`, the frontend hides the "Sign in with Google" button on `login.html`/`signup.html`, and email+password works completely standalone. Setting these up requires registering an OAuth app in Google Cloud Console — unavoidable, since Google requires it; there's no way to make this zero-config the way the rest of this app's settings are.

Note: Google sign-in only replaces *login*, not *sending*. Campaigns/Bulk Send/Template Map still send through whatever Gmail address + App Password the user configures in Settings (`backend/services/emailService.js`), regardless of which method they used to log in.

## Frontend

`frontend/login.html` / `frontend/signup.html` are the only two pages without the sidebar/topbar layout — standalone forms matching the app's visual style. `frontend/js/api.js`'s `apiFetch()` redirects to `/login.html` on any `401` (guarded against redirect loops on the login/signup pages themselves), which is what makes every other page's first API call double as its auth check — no page needs its own explicit "am I logged in" logic. `frontend/js/layout.js`'s `buildLayout()` additionally calls `GET /api/auth/me` to show the current user's email and a working "Log out" link in the sidebar on every page.

## What's deliberately not built

- **Password reset / email verification.** Out of scope for this pass — building it properly requires a transactional email sender independent of any user's own Gmail credentials, which is a meaningfully separate piece of infrastructure. Not having it is an acceptable gap at the current scale (a handful of trusted accounts); revisit before opening signup to strangers.
- **Roles/permissions/teams.** Every account is currently a fully independent, equal tenant — see `docs/multi-tenancy.md`. The schema doesn't block adding roles later (a `role` column or a separate `team_members` table would layer on cleanly), but nothing exists today.
