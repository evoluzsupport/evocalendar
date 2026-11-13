import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { sign, verify } from './crypto';
import { getUser, User } from './store';

export const COOKIE = 'evo_session';
const TTL = 60 * 60 * 24 * 14;
const opts = { httpOnly: true, sameSite: 'lax' as const, secure: process.env.NODE_ENV === 'production', path: '/' };

export function setSession(res: NextResponse, userId: string) { res.cookies.set(COOKIE, sign({ uid: userId }, TTL), { ...opts, maxAge: TTL }); }
export function clearSession(res: NextResponse) { res.cookies.set(COOKIE, '', { ...opts, maxAge: 0 }); }

export async function currentUser(): Promise<User | null> {
  const p = verify<{ uid: string }>((await cookies()).get(COOKIE)?.value);
  return p ? getUser(p.uid) : null;
}

/** For API routes: returns the user or a 401 response. */
export async function requireUser(): Promise<User | NextResponse> {
  return (await currentUser()) || NextResponse.json({ error: 'Not signed in' }, { status: 401 });
}
export const isRes = (x: unknown): x is NextResponse => x instanceof NextResponse;
