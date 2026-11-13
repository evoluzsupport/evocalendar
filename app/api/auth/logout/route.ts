import { NextResponse } from 'next/server';
import { BASE } from '@/lib/config';
import { clearSession } from '@/lib/session';

export async function POST() {
  const res = NextResponse.json({ ok: true });
  clearSession(res);
  return res;
}
export async function GET() {
  const res = NextResponse.redirect(`${BASE}/`);
  clearSession(res);
  return res;
}
