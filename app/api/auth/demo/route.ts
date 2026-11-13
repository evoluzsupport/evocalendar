import { NextResponse } from 'next/server';
import { BASE, DEMO } from '@/lib/config';
import { setSession } from '@/lib/session';
import { upsertUser } from '@/lib/store';

// Local development only: signs in a fake user when Zoho credentials are not configured.
export async function GET() {
  if (!DEMO) return NextResponse.json({ error: 'Not available' }, { status: 404 });
  const user = await upsertUser('demo-user', 'demo@evocalendar.local', 'Demo User');
  const res = NextResponse.redirect(`${BASE}/app`);
  setSession(res, user.id);
  return res;
}
