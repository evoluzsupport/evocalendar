import fs from 'fs';
import os from 'os';
import path from 'path';
import { cookies } from 'next/headers';
import { decrypt, encrypt, uuid } from './crypto';
import { SKIP_LOGIN } from './config';

export interface User { id: string; zoho_id: string; email: string; name: string }
export interface Account { id: string; user_id: string; provider: string; email: string; access_token?: string | null; refresh_token?: string | null; expires_at?: number | null; caldav?: string | null; password_enc?: string | null }
export interface Settings { timezone: string; defaultView: string; syncFrequency: string }
const DEFAULTS: Settings = { timezone: 'Asia/Kolkata', defaultView: 'Week', syncFrequency: 'Every 5 minutes' };

const SB_URL = process.env.SUPABASE_URL, SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const useSupabase = !!(SB_URL && SB_KEY);

async function sb(p: string, init: RequestInit & { upsert?: boolean } = {}) {
  const { upsert, ...rest } = init;
  const r = await fetch(`${SB_URL}/rest/v1/${p}`, {
    ...rest,
    headers: { apikey: SB_KEY!, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json',
      Prefer: 'return=representation' + (upsert ? ',resolution=merge-duplicates' : '') },
    cache: 'no-store',
  });
  if (!r.ok) throw new Error('Database error: ' + (await r.text()));
  const t = await r.text();
  return t ? JSON.parse(t) : [];
}
const q = encodeURIComponent;

// ---------- File fallback (local dev only) ----------
// With SKIP_LOGIN on a host without a database (e.g. Vercel) fall back to the temp dir: NOT durable, resets on cold starts.
const TEMP_OK = SKIP_LOGIN;
const FILE = process.env.NODE_ENV === 'production' && TEMP_OK ? path.join(os.tmpdir(), 'evocalendar', 'db.json') : path.join(process.cwd(), 'data', 'db.json');
type FileDb = { users: User[]; accounts: Account[]; settings: Record<string, Settings> };
function rd(): FileDb {
  if (process.env.NODE_ENV === 'production' && !TEMP_OK) throw new Error('Database not configured: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return { users: [], accounts: [], settings: {} }; }
}
const wr = (d: FileDb) => { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(d, null, 2)); };

// ---------- Guest storage: encrypted cookie (no server storage; each browser keeps its own accounts) ----------
// Used for the guest user and for Zoho users when no database is configured (their ids start with "z:").
// The blob records its owner so that a different user signing in on the same browser never sees it.
const isGuest = (id: string) => id === 'guest' || id.startsWith('z:');
export const isCookieUser = isGuest;
type GuestData = { accounts: Account[]; settings?: Settings; owner?: string };
// Stored in up to 4 chunked cookies (browsers cap one cookie at ~4KB). Access tokens are not stored (refreshed on demand).
const CHUNK = 3500, MAX_CHUNKS = 4;
async function gread(uid: string): Promise<GuestData> {
  try {
    const jar = await cookies(); let blob = '';
    for (let i = 0; i < MAX_CHUNKS; i++) blob += jar.get('evo_data' + i)?.value || '';
    const d: GuestData = JSON.parse(decrypt(blob));
    return (d.owner || 'guest') === uid ? d : { accounts: [] };
  } catch { return { accounts: [] }; }
}
async function gwrite(d: GuestData, uid: string) {
  d.owner = uid;
  const jar = await cookies(), blob = encrypt(JSON.stringify(d));
  if (blob.length > CHUNK * MAX_CHUNKS) throw new Error('Too many accounts for guest mode. Disconnect one, or sign in with a real account.');
  const o = { httpOnly: true, sameSite: 'lax' as const, secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 60 * 60 * 24 * 30 };
  for (let i = 0; i < MAX_CHUNKS; i++) {
    const part = blob.slice(i * CHUNK, (i + 1) * CHUNK);
    if (part) jar.set('evo_data' + i, part, o); else jar.set('evo_data' + i, '', { ...o, maxAge: 0 });
  }
}

// ---------- API ----------
export async function upsertUser(zoho_id: string, email: string, name: string): Promise<User> {
  if (useSupabase) return (await sb('users?on_conflict=zoho_id', { method: 'POST', upsert: true, body: JSON.stringify({ zoho_id, email, name }) }))[0];
  const d = rd(); let u = d.users.find(x => x.zoho_id === zoho_id);
  if (u) Object.assign(u, { email, name }); else d.users.push((u = { id: uuid(), zoho_id, email, name }));
  wr(d); return u;
}
export async function getUser(id: string): Promise<User | null> {
  if (useSupabase) return (await sb(`users?id=eq.${q(id)}&select=*`))[0] || null;
  return rd().users.find(u => u.id === id) || null;
}
export async function listAccounts(user_id: string): Promise<Account[]> {
  if (isGuest(user_id)) return (await gread(user_id)).accounts;
  if (useSupabase) return sb(`accounts?user_id=eq.${q(user_id)}&select=*&order=created_at`);
  return rd().accounts.filter(a => a.user_id === user_id);
}
export async function addAccount(a: Omit<Account, 'id'>): Promise<Account> {
  if (isGuest(a.user_id)) {
    const d = await gread(a.user_id); const slim = { ...a, access_token: null, expires_at: null };
    let x = d.accounts.find(y => y.provider === a.provider && y.email === a.email);
    if (x) Object.assign(x, slim); else d.accounts.push((x = { id: uuid(), ...slim }));
    await gwrite(d, a.user_id); return x;
  }
  if (useSupabase) return (await sb('accounts?on_conflict=user_id,provider,email', { method: 'POST', upsert: true, body: JSON.stringify(a) }))[0];
  const d = rd(); let x = d.accounts.find(y => y.user_id === a.user_id && y.provider === a.provider && y.email === a.email);
  if (x) Object.assign(x, a); else d.accounts.push((x = { id: uuid(), ...a }));
  wr(d); return x;
}
export async function patchAccount(id: string, patch: Partial<Account>, user_id?: string) {
  if (user_id && isGuest(user_id)) { const d = await gread(user_id); const x = d.accounts.find(a => a.id === id); if (x) { Object.assign(x, patch); await gwrite(d, user_id); } return; }
  if (useSupabase) { await sb(`accounts?id=eq.${q(id)}`, { method: 'PATCH', body: JSON.stringify(patch) }); return; }
  const d = rd(); const x = d.accounts.find(a => a.id === id); if (x) { Object.assign(x, patch); wr(d); }
}
export async function deleteAccount(user_id: string, id: string) {
  if (isGuest(user_id)) { const d = await gread(user_id); d.accounts = d.accounts.filter(a => a.id !== id); await gwrite(d, user_id); return; }
  if (useSupabase) { await sb(`accounts?id=eq.${q(id)}&user_id=eq.${q(user_id)}`, { method: 'DELETE' }); return; }
  const d = rd(); d.accounts = d.accounts.filter(a => !(a.id === id && a.user_id === user_id)); wr(d);
}
export async function getSettings(user_id: string): Promise<Settings> {
  if (isGuest(user_id)) return (await gread(user_id)).settings || DEFAULTS;
  if (useSupabase) {
    const r = (await sb(`settings?user_id=eq.${q(user_id)}&select=*`))[0];
    return r ? { timezone: r.timezone, defaultView: r.default_view, syncFrequency: r.sync_frequency } : DEFAULTS;
  }
  return rd().settings[user_id] || DEFAULTS;
}
export async function saveSettings(user_id: string, patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings(user_id)), ...patch };
  if (isGuest(user_id)) { const d = await gread(user_id); d.settings = next; await gwrite(d, user_id); return next; }
  if (useSupabase) {
    await sb('settings?on_conflict=user_id', { method: 'POST', upsert: true, body: JSON.stringify({ user_id, timezone: next.timezone, default_view: next.defaultView, sync_frequency: next.syncFrequency }) });
    return next;
  }
  const d = rd(); d.settings[user_id] = next; wr(d); return next;
}
