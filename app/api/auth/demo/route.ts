import { NextResponse } from 'next/server';
import { BASE, DEMO, SKIP_LOGIN } from '@/lib/config';
import { GUEST, setSession } from '@/lib/session';
import { upsertUser } from '@/lib/store';

// Local development only: signs in a fake user when Zoho credentials are not configured.
export async function GET() {
  if (!DEMO && !SKIP_LOGIN) return NextResponse.json({ error: 'Not available' }, { status: 404 });
  const user = SKIP_LOGIN ? GUEST : await upsertUser('demo-user', 'demo@evocalendar.local', 'Demo User');
  const res = NextResponse.redirect(`${BASE}/app`);
  setSession(res, user.id);
  return res;
}
