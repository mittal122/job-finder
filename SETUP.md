# Job Finder — Setup Guide

## Prerequisites

- Docker + Docker Compose (recommended), **or** Node.js 18+ and PostgreSQL 14+ if running without Docker
- A Gmail account you're willing to send from (you'll set this up from inside the app — no Gmail credentials needed before this point)

---

## 1. Start the app

**Docker (recommended):**
```bash
cp .env.example .env
docker compose up -d
```

**Without Docker:**
```bash
cp .env.example .env
# edit .env if your Postgres isn't the default local one
cd backend
npm install
node server.js        # or: npm run dev (auto-reload)
```

Either way, the only thing `.env` needs before starting is your database connection — see the comments in `.env.example`. Everything else is configured from inside the app in the next step.

---

## 2. Open the app and finish setup

Go to **http://localhost:8000**. If Gmail isn't configured yet, you'll see a banner on the Dashboard — click **Finish Setup**, or go to **Profile & Settings** directly:

1. **Email Sending** — enter your Gmail address and an **App Password** (not your regular password). The page walks you through getting one:
   - Turn on 2-Step Verification at [myaccount.google.com/security](https://myaccount.google.com/security)
   - Generate an App Password for "Mail" at [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
   - Paste the 16-character password in, then click **Send Test Email** to confirm it works before saving.
2. **AI Personalization** (optional) — only needed if you want Bulk Send/Template Map to use AI for swapping company names into a template that doesn't have a placeholder for one. Get a free key at [build.nvidia.com](https://build.nvidia.com).
3. **Personal Information / Bio / Skills / Projects** — fill these in if you plan to use the Campaign flow, which uses your Bio field as the email template.

None of this requires editing any file — it's all saved to the database and persists across restarts.

---

## 3. Send something

- **Campaign** (Excel-driven, tracked long-term): New Campaign → upload an Excel file → Start Sending.
- **Bulk Send** (quick, paste emails directly): Bulk Send → compose → preview/edit → send.
- **Template Map** (Excel + custom `{{placeholder}}` columns): Template Map → upload Excel → map columns → send.

All three appear in **History** afterward, regardless of which one you used.

---

## Excel File Format (Campaign / Template Map)

| HR Name | Company Name | Email | Job Role |
|---|---|---|---|
| John Smith | ABC Tech | john@abc.com | Backend Engineer |
| Sarah Wilson | XYZ Solutions | sarah@xyz.com | DevOps Engineer |

- **Required:** Company Name, Email
- **Optional:** HR Name, Job Role

---

## Advanced: headless / scripted deployments

If you'd rather not click through the Settings page (e.g., spinning up a disposable instance from a script), `.env.example` documents optional `GMAIL_ADDRESS`/`GMAIL_APP_PASSWORD`/`NVIDIA_API_KEY`/`EMAIL_DELAY_MIN`/`EMAIL_DELAY_MAX` variables. If set, they seed the matching Settings value the first time the app starts — but only if that setting doesn't already have a value, so they'll never silently overwrite something you've configured through the UI since.

---

## Features

| Feature | Where |
|---|---|
| Campaign (Excel-driven, durable) | /upload.html → /campaign.html |
| Bulk Send (paste emails, live progress) | /bulk.html |
| Template Map (Excel + custom placeholders) | /template-map.html |
| Unified send history, all flows | /history.html |
| Profile, Email Sending, AI key | /settings.html |
| Live backend console | /logs.html |
| Export CSV / Excel report (Campaign) | Campaign page → Export buttons |
| Retry failed emails (Campaign) | Campaign page → Retry button |
| Test Mode (first N emails only) | Upload form |
