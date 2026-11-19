import { NextResponse } from 'next/server';
import { isRes, requireUser } from '@/lib/session';
import { listDirectory } from '@/lib/store';

export const dynamic = 'force-dynamic';

// Everyone in the EvoCore AI user list (copied into evocalendar.users), for the "Share with people" picker. Signed-in users only.
export async function GET() {
  const u = await requireUser();
  if (isRes(u)) return u;
  try {
    const me = u.email.toLowerCase();
    const people = (await listDirectory()).filter(p => p.email.toLowerCase() !== me)
      .map(p => ({ email: p.email.toLowerCase(), name: p.name || p.email, department: p.department || '', avatar: p.avatar_url || '' }));
    return NextResponse.json({ people });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
