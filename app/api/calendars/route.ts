import { NextResponse } from 'next/server';
import { listSubCalendars } from '@/lib/events';
import { isRes, requireUser } from '@/lib/session';
import { listAccounts } from '@/lib/store';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;
// Lists the individual calendars inside the user's connected accounts, for the colour settings.
export async function GET() {
  const u = await requireUser();
  if (isRes(u)) return u;
  return NextResponse.json(await listSubCalendars(await listAccounts(u.id)));
}
