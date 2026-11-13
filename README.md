# EvoCalendar

Next.js app that syncs meetings from Google, Microsoft, Zoho, Yahoo and other email accounts into one calendar.

## Run
    npm install
    npm run dev      # http://localhost:3000
    npm run build && npm start

Connections and settings persist in `data/db.json` (git-ignored).

## Modes
- **demo** (default): simulated sign-in and sample meetings.
- **live**: copy `.env.example` to `.env.local`, set `OAUTH_MODE=live` and each provider's client ID/secret.
  Register `http://localhost:3000/api/oauth/callback` as the redirect URI.
  Event sync works for Google and Microsoft; Zoho/Yahoo connect but don't fetch events yet.
  "Other" (IMAP/CalDAV) accounts are recorded only; no mailbox sync, passwords are not stored.
