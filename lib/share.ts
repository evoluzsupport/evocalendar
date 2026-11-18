import { decrypt, encrypt } from './crypto';
import type { Account } from './store';

// Stateless read-only share links: the connected accounts (refresh tokens / encrypted CalDAV passwords) are sealed inside the
// token itself with AES-256-GCM, so no database is needed. Anyone holding the link can see the events until it expires.
// There is no per-link revocation; rotating SESSION_SECRET invalidates every link at once.
export const SHARE_USER = 'z:share'; // "z:" ids are cookie-style users: tokens are never written back to storage
export const MAX_TOKEN_LEN = 8000;

export interface SharedCalendar { owner: string; exp: number; accounts: Account[] }

/** Only what is needed to read a calendar later (no access tokens when a refresh token exists). */
export const slimAccounts = (accounts: Account[]) => accounts.map(a => ({
  id: a.id, provider: a.provider, email: a.email, refresh_token: a.refresh_token ?? null, caldav: a.caldav ?? null, password_enc: a.password_enc ?? null,
  ...(a.refresh_token ? {} : { access_token: a.access_token ?? null, expires_at: a.expires_at ?? null }),
}));

export function makeShareToken(owner: string, accounts: Account[], days: number): string {
  const slim = slimAccounts(accounts);
  const token = encrypt(JSON.stringify({ exp: Date.now() + days * 864e5, owner, accounts: slim }));
  if (token.length > MAX_TOKEN_LEN) throw new Error('Too many connected accounts to fit in one link. Disconnect an account you do not need to share and try again.');
  return token;
}

export function readShareToken(token?: string): SharedCalendar | null {
  if (!token) return null;
  try {
    const p = JSON.parse(decrypt(token));
    if (!(p.exp > Date.now()) || !Array.isArray(p.accounts)) return null;
    return { owner: String(p.owner || ''), exp: p.exp, accounts: p.accounts.map((a: Account) => ({ ...a, user_id: SHARE_USER })) };
  } catch { return null; }
}
