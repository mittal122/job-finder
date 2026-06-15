# Job Finder — Setup Guide

## Prerequisites

- Node.js 18+
- PostgreSQL 14+
- Gmail account with an App Password

---

## 1. Configure Environment

```bash
cp .env.example .env
```

Edit `.env`:

| Variable | What to set |
|---|---|
| `DATABASE_URL` | Your PostgreSQL connection string |
| `OPENAI_API_KEY` | From https://platform.openai.com/api-keys |
| `GMAIL_ADDRESS` | Your Gmail address |
| `GMAIL_APP_PASSWORD` | 16-char App Password from Google Account → Security → App Passwords |

---

## 2. Start PostgreSQL

Make sure PostgreSQL is running and the database exists:

```bash
createdb jobfinder
```

Or with Docker:

```bash
docker run -d --name pg \
  -e POSTGRES_USER=jobfinder \
  -e POSTGRES_PASSWORD=jobfinder \
  -e POSTGRES_DB=jobfinder \
  -p 5432:5432 postgres:15-alpine
```

---

## 3. Install & Run Backend

```bash
cd backend
npm install
node server.js
```

The server starts at **http://localhost:8000**  
It serves the frontend at the same address (no separate web server needed).

For development with auto-reload:
```bash
npm run dev
```

---

## 4. Open the App

Go to **http://localhost:8000** in your browser.

---

## 5. First-Time Setup

1. **Settings** → Fill in your name, bio, skills, and projects  
2. **New Campaign** → Upload your Excel file  
3. **Campaign page** → Click **Start Sending**

---

## Excel File Format

| HR Name | Company Name | Email | Job Role |
|---|---|---|---|
| John Smith | ABC Tech | john@abc.com | Backend Engineer |
| Sarah Wilson | XYZ Solutions | sarah@xyz.com | DevOps Engineer |

- **Required:** Company Name, Email  
- **Optional:** HR Name, Job Role

---

## Docker (Full Stack)

```bash
cp .env.example .env   # fill in OPENAI_API_KEY + GMAIL credentials
docker compose up -d
```

App: http://localhost:8000

---

## Features

| Feature | Where |
|---|---|
| Upload Excel + Resume | /upload.html |
| Campaign Dashboard | / |
| Live Email List | /campaign.html?id=... |
| Preview Emails Before Send | /preview.html?id=... |
| Retry Failed Emails | Campaign page → Retry button |
| Export CSV / Excel Report | Campaign page → Export buttons |
| Profile & Skills Editor | /settings.html |
| Test Mode (first 3 emails) | Upload form |
| Random delay 30-60s between emails | Automatic |
