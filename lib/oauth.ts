import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { sign, verify } from './crypto';

const NONCE = 'evo_oauth';
const secure = process.env.NODE_ENV === 'production';

/** Stateless OAuth state: signed token + matching nonce cookie (CSRF protection). Works across serverless instances. */
export function redirectWithState(url: string, params: Record<string, string>, data: Record<string, unknown>): NextResponse {
  const nonce = crypto.randomBytes(12).toString('hex');
  const state = sign({ ...data, nonce }, 600);
  return withNonce(NextResponse.json({ redirect: url + '?' + new URLSearchParams({ ...params, state }) }), nonce);
}
export function withNonce(res: NextResponse, nonce: string) {
  res.cookies.set(NONCE, nonce, { httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: 600 });
  return res;
}
export function readState<T = any>(req: NextRequest): T | null {
  const s = verify<T & { nonce: string }>(req.nextUrl.searchParams.get('state') || '');
  return s && s.nonce === req.cookies.get(NONCE)?.value ? s : null;
}
export function idTokenClaims(t?: string): { email?: string; name?: string; sub?: string; preferred_username?: string } {
  try { return JSON.parse(Buffer.from(t!.split('.')[1], 'base64url').toString()); } catch { return {}; }
}
