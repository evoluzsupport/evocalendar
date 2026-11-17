const prod = process.env.NODE_ENV === 'production';
// Demo mode (fake sign-in + sample data) only ever runs in local development.
export const DEMO = !prod && process.env.OAUTH_MODE !== 'live';
// Optional Supabase database. Without it the app still requires "Sign in with Zoho": the signed-in profile lives in the signed
// session cookie and connected accounts in an encrypted cookie, so nothing about users is stored on the server.
export const HAS_DB = !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
// TEMPORARY guest mode (shared guest user, no Zoho). Only when SKIP_LOGIN is explicitly 1/true/yes. Unsafe on a public URL.
export const SKIP_LOGIN = ['1', 'true', 'yes'].includes((process.env.SKIP_LOGIN || '').trim().toLowerCase());
export const BASE = (process.env.BASE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? 'https://' + process.env.VERCEL_PROJECT_PRODUCTION_URL : 'http://localhost:3000')).replace(/\/$/, '');
export const DC = process.env.ZOHO_DC || 'in'; // Zoho data centre: com, in, eu, com.au, jp
export const ZOHO_ACCOUNTS = `https://accounts.zoho.${DC}`;
export const ZOHO_CALENDAR = `https://calendar.zoho.${DC}`;

export type ProviderId = 'google' | 'microsoft' | 'zoho' | 'yahoo';
export interface ProviderDef { name: string; letter: string; desc: string; kind: 'oauth' | 'caldav'; demoEmail: string; authUrl?: string; tokenUrl?: string; scope?: string; extra?: Record<string, string>; caldavUrl?: string }

export const PROVIDERS: Record<ProviderId, ProviderDef> = {
  google: { name: 'Google', letter: 'G', kind: 'oauth', desc: 'Sync meetings from Gmail and Google Workspace calendars.', demoEmail: 'tfortest100@gmail.com',
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth', tokenUrl: 'https://oauth2.googleapis.com/token',
    scope: 'openid email https://www.googleapis.com/auth/calendar.readonly', extra: { access_type: 'offline', prompt: 'select_account consent' } },
  microsoft: { name: 'Microsoft', letter: 'M', kind: 'oauth', desc: 'Sync meetings from Outlook, Hotmail and Microsoft 365.', demoEmail: 'test@outlook.com',
    authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize', tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    scope: 'openid email offline_access User.Read Calendars.Read', extra: { prompt: 'select_account' } },
  zoho: { name: 'Zoho', letter: 'Z', kind: 'oauth', desc: 'Sync meetings from Zoho Mail and Zoho Calendar.', demoEmail: 'test@zohomail.com',
    authUrl: `${ZOHO_ACCOUNTS}/oauth/v2/auth`, tokenUrl: `${ZOHO_ACCOUNTS}/oauth/v2/token`,
    scope: 'openid,email,ZohoCalendar.calendar.READ,ZohoCalendar.event.READ', extra: { access_type: 'offline', prompt: 'consent' } },
  yahoo: { name: 'Yahoo', letter: 'Y', kind: 'caldav', desc: 'Sync meetings from Yahoo Calendar using an app password.', demoEmail: 'test@yahoo.com',
    caldavUrl: 'https://caldav.calendar.yahoo.com' },
};

export const cred = (id: string) => ({
  clientId: process.env[id.toUpperCase() + '_CLIENT_ID'] || '',
  clientSecret: process.env[id.toUpperCase() + '_CLIENT_SECRET'] || '',
});
