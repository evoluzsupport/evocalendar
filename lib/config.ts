const prod = process.env.NODE_ENV === 'production';
// Demo mode (fake sign-in + sample data) only ever runs in local development.
export const DEMO = !prod && process.env.OAUTH_MODE !== 'live';
// TEMPORARY: SKIP_LOGIN=1 makes the sign-in button open the app as a shared guest user (no Zoho). Unsafe on a public URL.
export const SKIP_LOGIN = process.env.SKIP_LOGIN === '1';
export const BASE = (process.env.BASE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? 'https://' + process.env.VERCEL_PROJECT_PRODUCTION_URL : 'http://localhost:3000')).replace(/\/$/, '');
export const DC = process.env.ZOHO_DC || 'in'; // Zoho data centre: com, in, eu, com.au, jp
export const ZOHO_ACCOUNTS = `https://accounts.zoho.${DC}`;
export const ZOHO_CALENDAR = `https://calendar.zoho.${DC}`;

export type ProviderId = 'google' | 'microsoft' | 'zoho' | 'yahoo';
export interface ProviderDef { name: string; letter: string; desc: string; kind: 'oauth' | 'caldav'; demoEmail: string; authUrl?: string; tokenUrl?: string; scope?: string; extra?: Record<string, string>; caldavUrl?: string }

export const PROVIDERS: Record<ProviderId, ProviderDef> = {
  google: { name: 'Google', letter: 'G', kind: 'oauth', desc: 'Sync meetings from Gmail and Google Workspace calendars.', demoEmail: 'tfortest100@gmail.com',
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth', tokenUrl: 'https://oauth2.googleapis.com/token',
    scope: 'openid email https://www.googleapis.com/auth/calendar.readonly', extra: { access_type: 'offline', prompt: 'consent' } },
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
