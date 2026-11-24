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
  const email = String(b.email || '').trim();
  // Yahoo shows app passwords in groups ("abcd efgh ijkl mnop"); the spaces are not part of the password.
  const password = provider === 'yahoo' ? String(b.password || '').replace(/\s+/g, '') : String(b.password || '');
  const caldav = String(b.caldav || (provider === 'yahoo' ? PROVIDERS.yahoo.caldavUrl : '')).trim();
  if (!/^\S+@\S+\.\S+$/.test(email)) return NextResponse.json({ error: 'Enter a valid email address' }, { status: 400 });
  if (!/^https:\/\//i.test(caldav)) return NextResponse.json({ error: 'Enter the https:// CalDAV URL' }, { status: 400 });
  if (!password) return NextResponse.json({ error: 'Password / app password is required' }, { status: 400 });

  // Verify the credentials before saving
  const probe = await fetch(caldav, { method: 'PROPFIND', headers: { Authorization: 'Basic ' + Buffer.from(`${email}:${password}`).toString('base64'), Depth: '0' } }).catch(() => null);
  if (!probe) return NextResponse.json({ error: 'Could not reach the CalDAV server' }, { status: 400 });
  if (probe.status === 401 || probe.status === 403) return NextResponse.json({ error: provider === 'yahoo' ? 'Yahoo rejected the sign-in. Use your full Yahoo email and an app password (Yahoo Account Security → Generate app password), not your normal password.' : 'Sign-in failed. Check the email and password.' }, { status: 400 });

  await addAccount({ user_id: u.id, provider, email, caldav, password_enc: encrypt(password) });
  return NextResponse.json({ ok: true });
}
