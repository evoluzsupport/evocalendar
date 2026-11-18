import { NextRequest, NextResponse } from 'next/server';
import { fetchEvents } from '@/lib/events';
import { readShareToken } from '@/lib/share';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Public, read-only: the share token is the credential. Returns events only, never tokens or settings.
export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const share = readShareToken((await ctx.params).token);
  if (!share) return NextResponse.json({ error: 'This link is invalid or has expired.' }, { status: 403 });
  const sp = req.nextUrl.searchParams;
  const from = new Date(sp.get('from') || Date.now());
  const to = new Date(sp.get('to') || +from + 42 * 864e5);
  if (isNaN(+from) || isNaN(+to) || +to - +from > 100 * 864e5) return NextResponse.json({ error: 'Invalid range' }, { status: 400 });
  const { events, errors } = await fetchEvents(share.accounts, from, to);
  return NextResponse.json({ events, errors, syncedAt: new Date().toISOString() }, { headers: { 'Cache-Control': 'no-store' } });
}
