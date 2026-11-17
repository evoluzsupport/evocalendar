import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { sign, verify } from './crypto';
import { SKIP_LOGIN } from './config';
import { getUser, User } from './store';

export const GUEST: User = { id: 'guest', zoho_id: 'guest', email: 'guest@evocalendar.local', name: 'Guest' };

export const COOKIE = 'evo_session';
const TTL = 60 * 60 * 24 * 14;
const opts = { httpOnly: true, sameSite: 'lax' as const, secure: process.env.NODE_ENV === 'production', path: '/' };

// Database-less Zoho users ("z:<zoho id>") carry their profile inside the signed cookie; nothing is stored server-side.
export function setSession(res: NextResponse, user: Pick<User, 'id'> & Partial<User>) {
  const payload = user.id.startsWith('z:') ? { uid: user.id, email: user.email, name: user.name } : { uid: user.id };
  res.cookies.set(COOKIE, sign(payload, TTL), { ...opts, maxAge: TTL });
}
export function clearSession(res: NextResponse) { res.cookies.set(COOKIE, '', { ...opts, maxAge: 0 }); }

export async function currentUser(): Promise<User | null> {
  const p = verify<{ uid: string; email?: string; name?: string }>((await cookies()).get(COOKIE)?.value);
  if (!p) return null;
  if (p.uid === GUEST.id) return SKIP_LOGIN ? GUEST : null; // guest needs no database lookup
  if (p.uid.startsWith('z:')) return p.email ? { id: p.uid, zoho_id: p.uid.slice(2), email: p.email, name: p.name || p.email } : null;
  return getUser(p.uid);
}

/** For API routes: returns the user or a 401 response. */
export async function requireUser(): Promise<User | NextResponse> {
  return (await currentUser()) || NextResponse.json({ error: 'Not signed in' }, { status: 401 });
}
export const isRes = (x: unknown): x is NextResponse => x instanceof NextResponse;
