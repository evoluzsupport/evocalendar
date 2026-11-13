import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export const MODE = process.env.OAUTH_MODE === 'live' ? 'live' : 'demo';
export const BASE = process.env.BASE_URL || 'http://localhost:3000';
export const REDIRECT_URI = `${BASE}/api/oauth/callback`;

export type ProviderId = 'google' | 'microsoft' | 'zoho' | 'yahoo';
export const PROVIDERS: Record<ProviderId, any> = {
  google: { name: 'Google', letter: 'G', desc: 'Sync meetings from Gmail and Google Workspace calendars.', demoEmail: 'tfortest100@gmail.com',
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth', tokenUrl: 'https://oauth2.googleapis.com/token',
    scope: 'openid email https://www.googleapis.com/auth/calendar.readonly', extra: { access_type: 'offline', prompt: 'consent' } },
  microsoft: { name: 'Microsoft', letter: 'M', desc: 'Sync meetings from Outlook, Hotmail and Microsoft 365.', demoEmail: 'test@outlook.com',
    authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize', tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    scope: 'openid email offline_access User.Read Calendars.Read', extra: {} },
  zoho: { name: 'Zoho', letter: 'Z', desc: 'Sync meetings from Zoho Mail and Zoho Calendar.', demoEmail: 'test@zohomail.com',
    authUrl: 'https://accounts.zoho.com/oauth/v2/auth', tokenUrl: 'https://accounts.zoho.com/oauth/v2/token',
    scope: 'ZohoCalendar.calendar.READ,ZohoCalendar.event.READ,email', extra: { access_type: 'offline', prompt: 'consent' } },
  yahoo: { name: 'Yahoo', letter: 'Y', desc: 'Sync meetings from Yahoo Mail calendar.', demoEmail: 'test@yahoo.com',
    authUrl: 'https://api.login.yahoo.com/oauth2/request_auth', tokenUrl: 'https://api.login.yahoo.com/oauth2/get_token',
    scope: 'openid email', extra: {} },
};

export const cred = (id: string) => ({
  clientId: process.env[id.toUpperCase() + '_CLIENT_ID'] || '',
  clientSecret: process.env[id.toUpperCase() + '_CLIENT_SECRET'] || '',
});

// ---------- Storage (JSON file) ----------
const DB_FILE = path.join(process.cwd(), 'data', 'db.json');
export interface Account { id: string; provider: string; email: string; accessToken?: string; refreshToken?: string; expiresAt?: number; imap?: string; caldav?: string }
export interface Db { accounts: Account[]; settings: Record<string, string> }

export function readDb(): Db {
  try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
  catch { return { accounts: [], settings: { timezone: 'Asia/Kolkata', defaultView: 'Week', syncFrequency: 'Every 5 minutes' } }; }
}
export function writeDb(db: Db) {
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}
export const publicAcct = ({ id, provider, email }: Account) => ({ id, provider, email });
export const uuid = () => crypto.randomUUID();

// OAuth state store (survives dev hot reload)
const g = globalThis as any;
export const oauthStates: Map<string, string> = (g.__oauthStates ||= new Map());

// ---------- Tokens & events ----------
export async function tokenRequest(p: any, body: Record<string, string>) {
  const r = await fetch(p.tokenUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error_description || j.error || String(r.status));
  return j;
}

async function freshToken(a: Account) {
  if (a.expiresAt && Date.now() < a.expiresAt - 60000) return a.accessToken!;
  if (!a.refreshToken) return a.accessToken!;
  const c = cred(a.provider);
  const t = await tokenRequest(PROVIDERS[a.provider as ProviderId], { grant_type: 'refresh_token', refresh_token: a.refreshToken, client_id: c.clientId, client_secret: c.clientSecret });
  const db = readDb();
  const rec = db.accounts.find(x => x.id === a.id);
  if (rec) { rec.accessToken = t.access_token; rec.expiresAt = Date.now() + (t.expires_in || 3600) * 1000; writeDb(db); }
  return t.access_token as string;
}

export interface CalEvent { provider: string; title: string; start: string; end: string }

export function demoEvents(accounts: Account[]): CalEvent[] {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const tpl: [string, number, number, number, string][] = [
    ['google', 0, 9, 30, 'Team stand-up'], ['zoho', 0, 10, 90, 'Project kickoff'], ['microsoft', 0, 14, 60, 'Client review'],
    ['yahoo', 3, 10, 30, 'Vendor call'], ['other', 1, 11, 60, 'Board prep'], ['zoho', 2, 12, 60, 'Demo'],
    ['microsoft', 2, 9, 60, 'Client review'], ['google', 4, 9, 30, 'Team stand-up'], ['google', 4, 14, 45, 'Weekly wrap-up'],
  ];
  const connected = new Set(accounts.map(a => a.provider));
  return tpl.filter(t => connected.has(t[0])).map(([provider, d, h, m, title]) => {
    const s = new Date(start); s.setDate(s.getDate() + d); s.setHours(h, 0, 0, 0);
    return { provider, title, start: s.toISOString(), end: new Date(s.getTime() + m * 60000).toISOString() };
  });
}

export async function liveEvents(a: Account): Promise<CalEvent[]> {
  const from = new Date(); from.setDate(from.getDate() - 7);
  const to = new Date(); to.setDate(to.getDate() + 30);
  const get = async (url: string) => {
    const r = await fetch(url, { headers: { Authorization: 'Bearer ' + (await freshToken(a)) } });
    if (!r.ok) throw new Error(String(r.status));
    return r.json();
  };
  if (a.provider === 'google') {
    const j = await get(`https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true&orderBy=startTime&timeMin=${from.toISOString()}&timeMax=${to.toISOString()}`);
    return (j.items || []).filter((e: any) => e.start?.dateTime).map((e: any) => ({ provider: 'google', title: e.summary || '(no title)', start: e.start.dateTime, end: e.end.dateTime }));
  }
  if (a.provider === 'microsoft') {
    const j = await get(`https://graph.microsoft.com/v1.0/me/calendarView?startDateTime=${from.toISOString()}&endDateTime=${to.toISOString()}&$top=200`);
    return (j.value || []).map((e: any) => ({ provider: 'microsoft', title: e.subject, start: e.start.dateTime + 'Z', end: e.end.dateTime + 'Z' }));
  }
  return []; // Zoho/Yahoo event fetching not implemented yet
}
