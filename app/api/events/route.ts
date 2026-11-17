import { NextRequest, NextResponse } from 'next/server';
import { fetchEvents } from '@/lib/events';
import { isRes, requireUser } from '@/lib/session';
import { listAccounts } from '@/lib/store';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Live fetch straight from each connected account (no stale cache), for the requested range.
export async function GET(req: NextRequest) {
  const u = await requireUser();
  if (isRes(u)) return u;
  const sp = req.nextUrl.searchParams;
  const from = new Date(sp.get('from') || Date.now());
  const to = new Date(sp.get('to') || +from + 42 * 864e5);
  if (isNaN(+from) || isNaN(+to) || +to - +from > 100 * 864e5) return NextResponse.json({ error: 'Invalid range' }, { status: 400 });
  const { events, errors } = await fetchEvents(await listAccounts(u.id), from, to);
  return NextResponse.json({ events, errors, syncedAt: new Date().toISOString() });
}
