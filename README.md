# EvoCalendar

All your meetings from Google, Outlook/Hotmail, Zoho, Yahoo and Hostinger in one live, colour-coded calendar.
Next.js (App Router) · Zoho sign-in · Supabase storage.

## Local development
    npm install
    npm run dev          # http://localhost:3000

With no Zoho credentials, dev mode offers a demo login and sample meetings (never active in production).

## Production setup
1. **Supabase**: run `supabase/schema.sql` in the SQL editor. Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
2. **Session**: set `SESSION_SECRET` to a long random string (`openssl rand -hex 32`).
3. **Zoho OAuth client** (api-console.zoho.in, Server-based): used for sign-in and for the Zoho calendar card.
   - Redirect URIs: `<BASE_URL>/api/auth/zoho/callback` and `<BASE_URL>/api/oauth/callback`
   - Set `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_DC=in`, `BASE_URL`.
4. **Google** (Calendar API enabled) and **Microsoft** (Entra app, Calendars.Read) clients: set `GOOGLE_*` / `MICROSOFT_*`.
   Redirect URI for both: `<BASE_URL>/api/oauth/callback`.
5. Yahoo and Hostinger/custom domains use CalDAV with an app/mailbox password (no OAuth app needed).

See `.env.example` for every variable.

## How sync works
Meetings are fetched live from each provider for the visible date range, on every navigation, every 30 s while open,
and when the tab regains focus. Recurring events from CalDAV accounts show only their first instance.
