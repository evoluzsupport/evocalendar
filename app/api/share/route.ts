import { NextResponse } from 'next/server';
import { BASE } from '@/lib/config';
import { isRes, requireUser } from '@/lib/session';
import { makeShareToken } from '@/lib/share';
import { listAccounts } from '@/lib/store';

export const dynamic = 'force-dynamic';

// Creates a read-only link to the signed-in user's calendar.
export async function POST(req: Request) {
  const u = await requireUser();
  if (isRes(u)) return u;
  const days = Math.min(90, Math.max(1, Math.floor(Number((await req.json().catch(() => ({}))).days) || 7)));
  const accounts = await listAccounts(u.id);
  if (!accounts.length) return NextResponse.json({ error: 'Connect an account first, there is nothing to share yet.' }, { status: 400 });
  try {
    return NextResponse.json({ url: `${BASE}/share/${makeShareToken(u.name || u.email, accounts, days)}`, days });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 400 }); }
}
