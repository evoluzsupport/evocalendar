'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

export type Ev = { id: string; provider: string; accountEmail: string; title: string; start: string; end: string; allDay: boolean; location?: string; calendarId?: string; calendarName?: string; busy?: boolean };

export const COLORS: Record<string, string> = { google: 'var(--google)', microsoft: 'var(--ms)', zoho: 'var(--zoho)', yahoo: 'var(--yahoo)', other: 'var(--other)' };
export const LABELS: Record<string, string> = { google: 'Google', microsoft: 'Microsoft', zoho: 'Zoho', yahoo: 'Yahoo', other: 'Other', shared: 'Shared' };

// Each connected account gets its own colour: 1st account of a provider = brand colour, others = distinct shades.
const SHADES: Record<string, string[]> = {
  google: ['#1a73e8', '#0b3d91', '#2b9dd6', '#5b6ee1'],
  microsoft: ['#0f6cbd', '#0a3a6b', '#2a8fa8', '#6b5bd2'],
  zoho: ['#e42527', '#a31517', '#f06a3a', '#c2417a'],
  yahoo: ['#6001d2', '#3b0a85', '#9b4dff', '#8a2f9e'],
  other: ['#0b8a6a', '#056046', '#3aa655', '#127a8a'],
};
export type Acct = { id: string; provider: string; email: string };
let palette: Record<string, string> = {};
export const acctKey = (provider: string, email: string) => provider + '|' + email;
/** Call whenever the account list changes. */
export function setPalette(accounts: Acct[]) {
  const count: Record<string, number> = {}; palette = {};
  for (const a of accounts) { const i = (count[a.provider] = (count[a.provider] ?? -1) + 1); const s = SHADES[a.provider] || SHADES.other; palette[acctKey(a.provider, a.email)] = s[i % s.length]; }
}
// Calendars shared with me get their own stable colour (by share id), distinct from the account colours above.
const SHARED_COLORS = ['#0e9384', '#c11574', '#dd6b20', '#4f46e5', '#2e7d32', '#b54708', '#0086c9', '#7a5af8'];
export const sharedColor = (id: string) => overrides['shared|' + id] || SHARED_COLORS[[...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % SHARED_COLORS.length];
export const evColor = (e: { provider: string; accountEmail: string; calendarId?: string }) =>
  e.calendarId ? sharedColor(e.calendarId) : overrides[acctKey(e.provider, e.accountEmail)] || palette[acctKey(e.provider, e.accountEmail)] || (COLORS[e.provider] ?? COLORS.other);

// User-chosen colours (per connected account, "shared|<shareId>" for shared calendars). Kept in this browser's localStorage.
const OV_KEY = 'evo_colors';
let overrides: Record<string, string> = {};
export const defaultAcctColor = (provider: string, email: string) => palette[acctKey(provider, email)] || '#2563eb';
export const sharedKey = (id: string) => 'shared|' + id;
export function loadColorOverrides(): Record<string, string> {
  try { overrides = JSON.parse(localStorage.getItem(OV_KEY) || '{}') || {}; } catch { overrides = {}; }
  return overrides;
}
/** Set (or with null, reset) the colour for a key; returns the new overrides. */
export function setColorOverride(key: string, color: string | null): Record<string, string> {
  const next = { ...overrides };
  if (color && /^#[0-9a-f]{6}$/i.test(color)) next[key] = color; else delete next[key];
  overrides = next;
  try { localStorage.setItem(OV_KEY, JSON.stringify(next)); } catch {}
  return next;
}
export const hasOverride = (key: string) => !!overrides[key];

export type SharedCal = { id: string; owner: string; email: string; permission: 'details' | 'busy' };

export async function api<T = any>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const res = await fetch('/api' + path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !path.startsWith('/share')) { window.location.href = '/'; throw new Error('Signed out'); }
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

export const fmtTime = (d: Date) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
export const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
export const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };

/** Live events for a range: refetches on range change, every 30s, and when the tab regains focus. */
export function useEvents(from: Date, to: Date, enabled = true, intervalMs = 30000, path = '/events') {
  const [events, setEvents] = useState<Ev[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [syncedAt, setSyncedAt] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);
  const key = `${path}-${+from}-${+to}`;
  const seq = useRef(0);

  const refresh = useCallback(async () => {
    const id = ++seq.current;
    setLoading(true);
    try {
      const r = await api(`${path}${path.includes('?') ? '&' : '?'}from=${from.toISOString()}&to=${to.toISOString()}`);
      if (id !== seq.current) return;
      setEvents(r.events); setErrors(r.errors || []); setSyncedAt(new Date(r.syncedAt));
    } catch { /* keep showing the last good data */ }
    finally { if (id === seq.current) setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (!enabled) return;
    refresh();
    const t = setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, intervalMs);
    const onVis = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis); };
  }, [refresh, enabled, intervalMs]);

  return { events, errors, syncedAt, loading, refresh };
}
