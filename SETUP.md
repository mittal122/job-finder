# Job Finder — Setup Guide

## Prerequisites

- Docker + Docker Compose (recommended), **or** Node.js 18+ and PostgreSQL 14+ if running without Docker
- A Gmail account you're willing to send from (you'll set this up from inside the app after signing up — no Gmail credentials needed before this point)

---

## 1. Start the app

**Docker (recommended):**
```bash
cp .env.example .env
# generate a value for ENCRYPTION_KEY in .env:
openssl rand -hex 32
docker compose up -d
```

**Without Docker:**
```bash
cp .env.example .env
# generate a value for ENCRYPTION_KEY in .env (openssl rand -hex 32),
# and edit DATABASE_URL if your Postgres isn't the default local one
cd backend
npm install
node server.js        # or: npm run dev (auto-reload)
```

`ENCRYPTION_KEY` is required — the app refuses to start without it (it encrypts Gmail App Passwords/API keys at rest, and can't be auto-generated the way other settings are, since it can't live in the database it protects). Everything else is configured from inside the app in the next step.

---

## 2. Create an account and finish setup

Go to **http://localhost:8000** — you'll land on the login page. Click **Sign up** and create an account with an email and password (or, if the deployer has configured Google sign-in, use that instead). Each account is fully independent — no two accounts ever share data, Gmail credentials, or settings.

Once logged in, go to **Profile & Settings**:

1. **Email Sending** — enter your Gmail address and an **App Password** (not your regular password). The page walks you through getting one:
   - Turn on 2-Step Verification at [myaccount.google.com/security](https://myaccount.google.com/security)
   - Generate an App Password for "Mail" at [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
   - Paste the 16-character password in, then click **Send Test Email** to confirm it works before saving.
2. **AI Personalization** (optional) — only needed if you want Bulk Send/Template Map to use AI for swapping company names into a template that doesn't have a placeholder for one. Get a free key at [build.nvidia.com](https://build.nvidia.com).
3. **Personal Information / Bio / Skills / Projects** — fill these in if you plan to use the Campaign flow, which uses your Bio field as the email template.

None of this requires editing any file — it's all saved to the database (encrypted where it's a secret) and persists across restarts, scoped to your account only.

---

## 3. Send something

- **Campaign** (Excel-driven, tracked long-term): New Campaign → upload an Excel file → Start Sending.
- **Bulk Send** (quick, paste emails directly): Bulk Send → compose → preview/edit → send.
- **Template Map** (Excel + custom `{{placeholder}}` columns): Template Map → upload Excel → map columns → send.

All three appear in **History** afterward, regardless of which one you used. Recipients can unsubscribe via a link in every email — once they do, no account can accidentally email that address again from that account, though it doesn't affect other accounts' ability to reach the same address.

---

## Excel File Format (Campaign / Template Map)

| HR Name | Company Name | Email | Job Role |
|---|---|---|---|
| John Smith | ABC Tech | john@abc.com | Backend Engineer |
| Sarah Wilson | XYZ Solutions | sarah@xyz.com | DevOps Engineer |

- **Required:** Company Name, Email
- **Optional:** HR Name, Job Role

---

## Advanced: Google sign-in

By default, only email+password login is available. To also offer "Sign in with Google," register an OAuth app in [Google Cloud Console](https://console.cloud.google.com/), set its callback URL to `<your PUBLIC_BASE_URL>/api/auth/google/callback`, and set `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` in `.env` (see `.env.example`). This is optional infrastructure — email+password always works regardless.

## Advanced: upgrading an existing single-operator deployment

If you're upgrading from a version of this app that predates accounts, your existing campaigns/profile/settings are **not** automatically migrated to a new account — they're preserved untouched in renamed `*_legacy` tables, but you'll start fresh with a new signup. See `docs/multi-tenancy.md` for why this was a deliberate choice and how to reach your old data directly in the database if you need it.

---

## Features

| Feature | Where |
|---|---|
| Sign up / log in (email+password or Google) | /signup.html, /login.html |
| Campaign (Excel-driven, durable) | /upload.html → /campaign.html |
| Bulk Send (paste emails, live progress) | /bulk.html |
| Template Map (Excel + custom placeholders) | /template-map.html |
| Unified send history, all flows | /history.html |
| Profile, Email Sending, AI key | /settings.html |
| Live backend console | /logs.html |
| Export CSV / Excel report (Campaign) | Campaign page → Export buttons |
| Retry failed emails (Campaign) | Campaign page → Retry button |
| Test Mode (first N emails only) | Upload form |
| Unsubscribe / suppression | Automatic — link in every sent email |
