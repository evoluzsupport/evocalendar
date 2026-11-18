import { NextRequest, NextResponse } from 'next/server';
import { isRes, requireUser } from '@/lib/session';
import { listSharedWithMe, sharingAvailable } from '@/lib/store';
import { eventsForShare } from '@/lib/team';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Live events for the shared calendars ticked in the sidebar (?ids=a,b). Only shares addressed to the caller are ever read.
export async function GET(req: NextRequest) {
  const u = await requireUser();
  if (isRes(u)) return u;
  const sp = req.nextUrl.searchParams;
  const from = new Date(sp.get('from') || Date.now());
  const to = new Date(sp.get('to') || +from + 42 * 864e5);
  if (isNaN(+from) || isNaN(+to) || +to - +from > 100 * 864e5) return NextResponse.json({ error: 'Invalid range' }, { status: 400 });
  const want = new Set((sp.get('ids') || '').split(',').filter(Boolean).slice(0, 25));
  if (!sharingAvailable || !want.size) return NextResponse.json({ events: [], errors: [], syncedAt: new Date().toISOString() });
  const mine = (await listSharedWithMe(u)).filter(s => want.has(s.id));
  const results = await Promise.all(mine.map(s => eventsForShare(s, from, to)));
  return NextResponse.json({ events: results.flatMap(r => r.events), errors: results.flatMap(r => (r.error ? [r.error] : [])), syncedAt: new Date().toISOString() });
}
