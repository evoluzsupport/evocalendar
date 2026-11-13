import fs from 'fs';
import path from 'path';
import { uuid } from './crypto';

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
const FILE = path.join(process.cwd(), 'data', 'db.json');
type FileDb = { users: User[]; accounts: Account[]; settings: Record<string, Settings> };
function rd(): FileDb {
  if (process.env.NODE_ENV === 'production') throw new Error('Database not configured: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return { users: [], accounts: [], settings: {} }; }
}
const wr = (d: FileDb) => { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(d, null, 2)); };

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
  if (useSupabase) return sb(`accounts?user_id=eq.${q(user_id)}&select=*&order=created_at`);
  return rd().accounts.filter(a => a.user_id === user_id);
}
export async function addAccount(a: Omit<Account, 'id'>): Promise<Account> {
  if (useSupabase) return (await sb('accounts?on_conflict=user_id,provider,email', { method: 'POST', upsert: true, body: JSON.stringify(a) }))[0];
  const d = rd(); let x = d.accounts.find(y => y.user_id === a.user_id && y.provider === a.provider && y.email === a.email);
  if (x) Object.assign(x, a); else d.accounts.push((x = { id: uuid(), ...a }));
  wr(d); return x;
}
export async function patchAccount(id: string, patch: Partial<Account>) {
  if (useSupabase) { await sb(`accounts?id=eq.${q(id)}`, { method: 'PATCH', body: JSON.stringify(patch) }); return; }
  const d = rd(); const x = d.accounts.find(a => a.id === id); if (x) { Object.assign(x, patch); wr(d); }
}
export async function deleteAccount(user_id: string, id: string) {
  if (useSupabase) { await sb(`accounts?id=eq.${q(id)}&user_id=eq.${q(user_id)}`, { method: 'DELETE' }); return; }
  const d = rd(); d.accounts = d.accounts.filter(a => !(a.id === id && a.user_id === user_id)); wr(d);
}
export async function getSettings(user_id: string): Promise<Settings> {
  if (useSupabase) {
    const r = (await sb(`settings?user_id=eq.${q(user_id)}&select=*`))[0];
    return r ? { timezone: r.timezone, defaultView: r.default_view, syncFrequency: r.sync_frequency } : DEFAULTS;
  }
  return rd().settings[user_id] || DEFAULTS;
}
export async function saveSettings(user_id: string, patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings(user_id)), ...patch };
  if (useSupabase) {
    await sb('settings?on_conflict=user_id', { method: 'POST', upsert: true, body: JSON.stringify({ user_id, timezone: next.timezone, default_view: next.defaultView, sync_frequency: next.syncFrequency }) });
    return next;
  }
  const d = rd(); d.settings[user_id] = next; wr(d); return next;
}
