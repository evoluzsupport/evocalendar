import { NextResponse } from 'next/server';
import { readDb, MODE, demoEvents, liveEvents } from '@/lib/server';

export const dynamic = 'force-dynamic';
export async function GET() {
  const { accounts } = readDb();
  if (MODE === 'demo') return NextResponse.json(demoEvents(accounts));
  const all = await Promise.all(accounts.map(a => liveEvents(a).catch(() => [])));
  return NextResponse.json(all.flat());
}
