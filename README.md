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

## Google setup (Gmail / Google Workspace calendars)
1. console.cloud.google.com → create/select a project → **APIs & Services → Library** → enable **Google Calendar API**.
2. **OAuth consent screen**: choose External, fill app name and support email, add scope `.../auth/calendar.readonly`,
   and while the app is in *Testing* add every Gmail address you will connect under **Test users**.
3. **Credentials → Create credentials → OAuth client ID → Web application**.
   Authorized redirect URI: `http://localhost:3000/api/oauth/callback` (and `<your-vercel-url>/api/oauth/callback` for production).
4. Put the Client ID and Secret in `.env.local` (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`), restart `npm run dev`,
   then Integration → Google Connect. For anyone outside your test users, Google requires app verification.

## Microsoft setup (Outlook, Hotmail, Microsoft 365 calendars)
1. portal.azure.com (or entra.microsoft.com) → **App registrations → New registration**. Name it `EvoCalendar`.
2. **Supported account types**: choose *Accounts in any organizational directory and personal Microsoft accounts*.
   The app uses the `/common` endpoint, so any other choice breaks Outlook.com/Hotmail accounts
   (error: "Selected user account does not exist in tenant 'Microsoft Services'").
   If you need to change it later: **Manifest** → `"signInAudience": "AzureADandPersonalMicrosoftAccount"`.
3. **Redirect URI** (platform *Web*): `<BASE_URL>/api/oauth/callback`. For local testing also add
   `http://localhost:3000/api/oauth/callback`. It must match exactly, including `https` and no trailing slash.
4. **API permissions → Microsoft Graph → Delegated**: `Calendars.Read`, `User.Read`, `offline_access`, `openid`, `email`.
   Work/school tenants that block user consent need an admin to approve the app.
5. **Certificates & secrets → New client secret**. Copy the secret *Value* immediately (it is hidden afterwards)
   and note the **Application (client) ID** from Overview. Secrets expire (max 24 months), so set a renewal reminder.
6. Set `MICROSOFT_CLIENT_ID` and `MICROSOFT_CLIENT_SECRET` in `.env.local` (and in your hosting settings), then restart/redeploy.
   Integration → Microsoft → Connect. Meetings sync read-only from the account's main calendar via Microsoft Graph.
   Unverified publishers show a warning on the consent screen until publisher verification is done; it still works.

## How sync works
Meetings are fetched live from each provider for the visible date range, on every navigation, every 30 s while open,
and when the tab regains focus. Recurring events from CalDAV accounts show only their first instance.
