import { PROVIDERS, ProviderId, ZOHO_CALENDAR, cred, DEMO } from './config';
import { decrypt } from './crypto';
import { Account, patchAccount } from './store';

export interface CalEvent { id: string; provider: string; accountEmail: string; title: string; start: string; end: string; allDay: boolean; location?: string }

export async function tokenRequest(tokenUrl: string, body: Record<string, string>) {
  const r = await fetch(tokenUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body) });
  const j = await r.json();
  if (!r.ok || j.error) throw new Error(j.error_description || j.error || String(r.status));
  return j;
}

async function freshToken(a: Account): Promise<string> {
  if (a.expires_at && Date.now() < a.expires_at - 60000) return a.access_token!;
  if (!a.refresh_token) return a.access_token!;
  const c = cred(a.provider);
  const t = await tokenRequest(PROVIDERS[a.provider as ProviderId].tokenUrl!, { grant_type: 'refresh_token', refresh_token: a.refresh_token, client_id: c.clientId, client_secret: c.clientSecret });
  a.access_token = t.access_token; a.expires_at = Date.now() + (t.expires_in || 3600) * 1000;
  await patchAccount(a.id, { access_token: a.access_token, expires_at: a.expires_at });
  return a.access_token!;
}

async function getJson(url: string, headers: Record<string, string>) {
  const r = await fetch(url, { headers, cache: 'no-store' });
  if (!r.ok) throw new Error(`${r.status} ${url.split('?')[0]}`);
  return r.json();
}

// ---------- Google ----------
async function google(a: Account, from: Date, to: Date): Promise<CalEvent[]> {
  const h = { Authorization: 'Bearer ' + (await freshToken(a)) };
  const cals = (await getJson('https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=reader', h)).items || [];
  const failed: string[] = [];
  const out = await Promise.all(cals.slice(0, 15).map(async (c: any) => {
    const j = await getJson(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(c.id)}/events?singleEvents=true&orderBy=startTime&maxResults=250&timeMin=${from.toISOString()}&timeMax=${to.toISOString()}`, h).catch((e: Error) => { failed.push(`${c.summary || c.id}: ${e.message}`); return { items: [] }; });
    return (j.items || []).filter((e: any) => e.status !== 'cancelled').map((e: any): CalEvent => {
      const allDay = !!e.start?.date;
      return { id: 'g' + e.id, provider: 'google', accountEmail: a.email, title: e.summary || '(no title)', allDay, location: e.location,
        start: allDay ? e.start.date + 'T00:00:00' : e.start.dateTime, end: allDay ? e.end.date + 'T00:00:00' : e.end.dateTime }; // all-day = floating local date (no Z)
    });
  }));
  if (failed.length === cals.length && failed.length) throw new Error('could not read any calendar (' + failed[0] + ')');
  return out.flat();
}

// ---------- Microsoft (Outlook, Hotmail, 365) ----------
async function microsoft(a: Account, from: Date, to: Date): Promise<CalEvent[]> {
  const h = { Authorization: 'Bearer ' + (await freshToken(a)), Prefer: 'outlook.timezone="UTC"' };
  const j = await getJson(`https://graph.microsoft.com/v1.0/me/calendarView?startDateTime=${from.toISOString()}&endDateTime=${to.toISOString()}&$top=250&$orderby=start/dateTime`, h);
  return (j.value || []).filter((e: any) => !e.isCancelled).map((e: any): CalEvent => ({
    id: 'm' + e.id, provider: 'microsoft', accountEmail: a.email, title: e.subject || '(no title)', allDay: !!e.isAllDay,
    location: e.location?.displayName || undefined, start: e.start.dateTime.split('.')[0] + (e.isAllDay ? '' : 'Z'), end: e.end.dateTime.split('.')[0] + (e.isAllDay ? '' : 'Z') }));
}

// ---------- Zoho Calendar ----------
function zohoDate(s: string): Date {
  const m = s.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z|[+-]\d{4})?)?$/);
  if (!m) return new Date(s);
  const base = Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  const z = m[7];
  if (!z || z === 'Z') return new Date(base);
  const off = (z[0] === '-' ? -1 : 1) * (+z.slice(1, 3) * 60 + +z.slice(3, 5));
  return new Date(base - off * 60000);
}
const pad = (n: number) => String(n).padStart(2, '0');
const localStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T00:00:00`;
function zohoAllDay(s: string, e?: string) {
  const p = (x: string) => new Date(+x.slice(0, 4), +x.slice(4, 6) - 1, +x.slice(6, 8));
  const a = p(s); let b = e ? p(e) : a; if (+b <= +a) b = new Date(+a.getFullYear(), a.getMonth(), a.getDate() + 1);
  return { start: localStr(a), end: localStr(b) };
}
const zfmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

async function zoho(a: Account, from: Date, to: Date): Promise<CalEvent[]> {
  const h = { Authorization: 'Zoho-oauthtoken ' + (await freshToken(a)) };
  const cals = (await getJson(`${ZOHO_CALENDAR}/api/v1/calendars`, h)).calendars || [];
  // Zoho limits the range to 31 days per request
  const windows: [Date, Date][] = [];
  for (let s = new Date(from); s < to; s = new Date(s.getTime() + 30 * 864e5)) windows.push([s, new Date(Math.min(+s + 30 * 864e5, +to))]);
  const out: CalEvent[] = [];
  await Promise.all(cals.flatMap((c: any) => windows.map(async ([s, e]) => {
    const range = encodeURIComponent(JSON.stringify({ start: zfmt(s), end: zfmt(e) }));
    const j = await getJson(`${ZOHO_CALENDAR}/api/v1/calendars/${c.uid}/events?range=${range}`, h).catch(() => ({ events: [] }));
    for (const ev of j.events || []) {
      const dt = ev.dateandtime || {};
      if (!dt.start) continue;
      out.push({ id: 'z' + ev.uid, provider: 'zoho', accountEmail: a.email, title: ev.title || '(no title)', allDay: !!ev.isallday,
        location: ev.location || undefined, ...(ev.isallday ? zohoAllDay(dt.start, dt.end) : { start: zohoDate(dt.start).toISOString(), end: zohoDate(dt.end || dt.start).toISOString() }) });
    }
  })));
  return out;
}

// ---------- CalDAV (Yahoo, Hostinger/Titan, any custom server) ----------
function tzToUtc(y: number, mo: number, d: number, h: number, mi: number, s: number, tz: string): Date {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  try {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' })
      .formatToParts(new Date(guess)).map(x => [x.type, +x.value]));
    return new Date(guess - (Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - guess));
  } catch { return new Date(guess); }
}
function icsDate(val: string, params: string): { d: Date; allDay: boolean } {
  const m = val.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!m) return { d: new Date(NaN), allDay: false };
  const n = m.slice(1, 7).map(x => +(x || 0));
  if (!m[4]) return { d: new Date(n[0], n[1] - 1, n[2]), allDay: true };
  if (m[7]) return { d: new Date(Date.UTC(n[0], n[1] - 1, n[2], n[3], n[4], n[5])), allDay: false };
  const tz = params.match(/TZID=([^;:]+)/)?.[1];
  return { d: tz ? tzToUtc(n[0], n[1], n[2], n[3], n[4], n[5], tz) : new Date(n[0], n[1] - 1, n[2], n[3], n[4], n[5]), allDay: false };
}
function parseIcs(ics: string, a: Account, provider: string, from: Date, to: Date): CalEvent[] {
  const lines = ics.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
  const out: CalEvent[] = []; let cur: Record<string, { v: string; p: string }> | null = null;
  for (const l of lines) {
    if (l === 'BEGIN:VEVENT') cur = {};
    else if (l === 'END:VEVENT' && cur) {
      const s = cur.DTSTART && icsDate(cur.DTSTART.v, cur.DTSTART.p);
      if (s && !isNaN(+s.d)) {
        const e = cur.DTEND ? icsDate(cur.DTEND.v, cur.DTEND.p) : { d: new Date(+s.d + (s.allDay ? 864e5 : 36e5)) };
        if (+e.d > +from && +s.d < +to && cur.STATUS?.v !== 'CANCELLED')
          out.push({ id: `${provider}-${cur.UID?.v || Math.random()}-${+s.d}`, provider, accountEmail: a.email, allDay: s.allDay,
            title: (cur.SUMMARY?.v || '(no title)').replace(/\\([,;n])/g, (_, c) => (c === 'n' ? ' ' : c)), location: cur.LOCATION?.v,
            start: s.allDay ? localStr(s.d) : s.d.toISOString(), end: s.allDay ? localStr(e.d) : e.d.toISOString() });
      }
      cur = null;
    } else if (cur) {
      const i = l.indexOf(':'); if (i < 0) continue;
      const [name, ...p] = l.slice(0, i).split(';');
      cur[name.toUpperCase()] = { v: l.slice(i + 1), p: p.join(';') };
    }
  }
  return out; // note: recurring events (RRULE) are only shown for their first instance
}

async function caldav(a: Account, from: Date, to: Date): Promise<CalEvent[]> {
  const auth = 'Basic ' + Buffer.from(`${a.email}:${decrypt(a.password_enc!)}`).toString('base64');
  const dav = (url: string, method: string, body: string, depth = '0') =>
    fetch(url, { method, headers: { Authorization: auth, Depth: depth, 'Content-Type': 'application/xml; charset=utf-8' }, body, cache: 'no-store' })
      .then(async r => { if (!r.ok && r.status !== 207) throw new Error(`CalDAV ${r.status}`); return r.text(); });
  const abs = (href: string, base: string) => new URL(href, base).toString();
  const pick = (xml: string, tag: string) => xml.match(new RegExp(`<[^>]*${tag}[^>]*>\\s*<[^>]*href[^>]*>([^<]+)<`, 'i'))?.[1];

  const root = a.caldav!;
  const principal = pick(await dav(root, 'PROPFIND', '<d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>'), 'current-user-principal');
  const pUrl = principal ? abs(principal, root) : root;
  const home = pick(await dav(pUrl, 'PROPFIND', '<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><c:calendar-home-set/></d:prop></d:propfind>'), 'calendar-home-set');
  const hUrl = home ? abs(home, pUrl) : pUrl;
  const listing = await dav(hUrl, 'PROPFIND', '<d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/></d:prop></d:propfind>', '1');
  const cals = [...listing.matchAll(/<[^>]*response[^>]*>([\s\S]*?)<\/[^>]*response>/gi)]
    .filter(m => /calendar\s*\/>/i.test(m[1].replace(/<[^>]*collection[^>]*>/gi, '')) || /<[^>]*:calendar\s*\/>|<calendar\s*\/>/i.test(m[1]))
    .map(m => m[1].match(/<[^>]*href[^>]*>([^<]+)</i)?.[1]).filter(Boolean).map(h => abs(h!, hUrl));
  const ts = (d: Date) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const report = `<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><c:calendar-data/></d:prop><c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT"><c:time-range start="${ts(from)}" end="${ts(to)}"/></c:comp-filter></c:comp-filter></c:filter></c:calendar-query>`;
  const res = await Promise.all((cals.length ? cals : [hUrl]).map(c => dav(c, 'REPORT', report, '1').catch(() => '')));
  const dec = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/<!\[CDATA\[|\]\]>/g, '');
  return res.flatMap(xml => [...xml.matchAll(/BEGIN:VCALENDAR[\s\S]*?END:VCALENDAR/g)].flatMap(m => parseIcs(dec(m[0]), a, a.provider, from, to)));
}

// ---------- Entry point ----------
const demoTpl: [string, number, number, number, string][] = [
  ['google', 0, 9, 30, 'Team stand-up'], ['zoho', 0, 10, 90, 'Project kickoff'], ['microsoft', 0, 14, 60, 'Client review'],
  ['yahoo', 3, 10, 30, 'Vendor call'], ['other', 1, 11, 60, 'Board prep'], ['zoho', 2, 12, 60, 'Demo'],
  ['microsoft', 2, 9, 60, 'Client review'], ['google', 4, 9, 30, 'Team stand-up'], ['google', 4, 14, 45, 'Weekly wrap-up'],
];
function demoEvents(accounts: Account[], from: Date, to: Date): CalEvent[] {
  const out: CalEvent[] = [];
  for (let w = new Date(from); w < to; w = new Date(+w + 864e5)) {
    if (w.getDay() === 0 || w.getDay() === 6) continue;
    const d = (w.getDay() + 6) % 7;
    for (const [provider, day, h, m, title] of demoTpl) {
      const acct = accounts.find(a => a.provider === provider);
      if (day !== d || !acct) continue;
      const s = new Date(w); s.setHours(h, 0, 0, 0);
      out.push({ id: `demo-${provider}-${+s}`, provider, accountEmail: acct.email, title, allDay: false, start: s.toISOString(), end: new Date(+s + m * 60000).toISOString() });
    }
  }
  return out;
}

export async function fetchEvents(accounts: Account[], from: Date, to: Date): Promise<{ events: CalEvent[]; errors: string[] }> {
  const errors: string[] = [];
  // In local dev, accounts connected through the fake flow (no tokens/password) get sample meetings; real ones are fetched live.
  const isReal = (x: Account) => !!(x.access_token || x.refresh_token || x.password_enc);
  const sample = DEMO ? demoEvents(accounts.filter(x => !isReal(x)), from, to) : [];
  const all = await Promise.all(accounts.filter(x => !DEMO || isReal(x)).map(async a => {
    try {
      if (a.provider === 'google') return await google(a, from, to);
      if (a.provider === 'microsoft') return await microsoft(a, from, to);
      if (a.provider === 'zoho') return await zoho(a, from, to);
      if (a.password_enc && a.caldav) return await caldav(a, from, to);
      return [];
    } catch (e: any) { errors.push(`${a.email}: ${e.message}`); return []; }
  }));
  return { events: [...sample, ...all.flat()], errors };
}
