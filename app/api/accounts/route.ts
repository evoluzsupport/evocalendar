import { NextResponse } from 'next/server';
import { PROVIDERS } from '@/lib/config';
import { encrypt } from '@/lib/crypto';
import { isRes, requireUser } from '@/lib/session';
import { addAccount, listAccounts } from '@/lib/store';

export const dynamic = 'force-dynamic';
export async function GET() {
  const u = await requireUser();
  if (isRes(u)) return u;
  return NextResponse.json((await listAccounts(u.id)).map(({ id, provider, email }) => ({ id, provider, email })));
}

// Password-based (CalDAV) accounts: Yahoo, Hostinger, custom domains. The password is stored encrypted.
export async function POST(req: Request) {
  const u = await requireUser();
  if (isRes(u)) return u;
  const b = await req.json().catch(() => ({}));
  const provider = b.provider === 'yahoo' ? 'yahoo' : 'other';
  const caldav = String(b.caldav || (provider === 'yahoo' ? PROVIDERS.yahoo.caldavUrl : '')).trim();
  if (!/^\S+@\S+\.\S+$/.test(b.email || '')) return NextResponse.json({ error: 'Enter a valid email address' }, { status: 400 });
  if (!/^https:\/\//i.test(caldav)) return NextResponse.json({ error: 'Enter the https:// CalDAV URL' }, { status: 400 });
  if (!b.password) return NextResponse.json({ error: 'Password / app password is required' }, { status: 400 });

  // Verify the credentials before saving
  const probe = await fetch(caldav, { method: 'PROPFIND', headers: { Authorization: 'Basic ' + Buffer.from(`${b.email}:${b.password}`).toString('base64'), Depth: '0' } }).catch(() => null);
  if (!probe) return NextResponse.json({ error: 'Could not reach the CalDAV server' }, { status: 400 });
  if (probe.status === 401 || probe.status === 403) return NextResponse.json({ error: 'Sign-in failed. Check the email and password (Yahoo needs an app password).' }, { status: 400 });

  await addAccount({ user_id: u.id, provider, email: String(b.email).trim(), caldav, password_enc: encrypt(String(b.password)) });
  return NextResponse.json({ ok: true });
}
