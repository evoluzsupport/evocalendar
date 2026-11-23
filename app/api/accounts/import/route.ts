import { NextResponse } from 'next/server';
import { PROVIDERS, ProviderId, zohoAccounts } from '@/lib/config';
import { decrypt } from '@/lib/crypto';
import { isRes, requireUser } from '@/lib/session';
import { addAccount } from '@/lib/store';

// Adds an account authorized in another browser, from the encrypted connection code that browser showed.
export async function POST(req: Request) {
  const u = await requireUser();
  if (isRes(u)) return u;
  const code = String((await req.json().catch(() => ({}))).code || '').replace(/\s+/g, '');
  let d: { provider: ProviderId; email: string; refresh_token: string; server?: string; exp: number };
  try { d = JSON.parse(decrypt(code)); } catch { return NextResponse.json({ error: 'That code is not valid. Copy the whole code and try again.' }, { status: 400 }); }
  if (!(d.exp > Date.now())) return NextResponse.json({ error: 'That code has expired. Start the connection again.' }, { status: 400 });
  if (PROVIDERS[d.provider]?.kind !== 'oauth' || !d.email || !d.refresh_token) return NextResponse.json({ error: 'That code is not valid.' }, { status: 400 });
  await addAccount({ user_id: u.id, provider: d.provider, email: d.email, access_token: null, refresh_token: d.refresh_token, ...(d.provider === 'zoho' ? { caldav: zohoAccounts(d.server) } : {}), expires_at: null });
  return NextResponse.json({ ok: true, email: d.email });
}
