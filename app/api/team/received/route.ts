import { NextResponse } from 'next/server';
import { isRes, requireUser } from '@/lib/session';
import { listSharedWithMe, sharingAvailable } from '@/lib/store';

export const dynamic = 'force-dynamic';

// Calendars teammates have shared with the signed-in user. The app lists these in the sidebar automatically.
export async function GET() {
  const u = await requireUser();
  if (isRes(u)) return u;
  if (!sharingAvailable) return NextResponse.json([]);
  try {
    const rows = await listSharedWithMe(u);
    // Someone shared with both directly and through their organisation shows once (the most recent share wins).
    const byOwner = new Map<string, (typeof rows)[number]>();
    for (const s of rows) byOwner.set(s.owner_id, s);
    return NextResponse.json([...byOwner.values()].map(s => ({ id: s.id, owner: s.owner_name || s.owner_email, email: s.owner_email, permission: s.permission })));
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
