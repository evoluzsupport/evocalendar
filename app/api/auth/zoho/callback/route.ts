import { NextRequest, NextResponse } from 'next/server';
import { BASE, HAS_DB, ZOHO_ACCOUNTS, cred } from '@/lib/config';
import { idTokenClaims, readState } from '@/lib/oauth';
import { tokenRequest } from '@/lib/events';
import { setSession } from '@/lib/session';
import { upsertUser } from '@/lib/store';

export const dynamic = 'force-dynamic';
export async function GET(req: NextRequest) {
  const fail = (m: string) => NextResponse.redirect(`${BASE}/?error=${encodeURIComponent(m)}`);
  const sp = req.nextUrl.searchParams;
  const st = readState<{ kind: string }>(req);
  if (!st || st.kind !== 'login') return fail('Sign-in expired. Please try again.');
  if (sp.get('error') || !sp.get('code')) return fail(sp.get('error') || 'Sign-in cancelled');
  try {
    const { clientId, clientSecret } = cred('zoho');
    const t = await tokenRequest(`${ZOHO_ACCOUNTS}/oauth/v2/token`, {
      grant_type: 'authorization_code', code: sp.get('code')!, redirect_uri: `${BASE}/api/auth/zoho/callback`, client_id: clientId, client_secret: clientSecret,
    });
    const c = idTokenClaims(t.id_token);
    if (!c.sub || !c.email) throw new Error('Zoho did not return your profile');
    const name = c.name || c.email.split('@')[0];
    // With a database the user is stored; without one the profile lives only in the signed session cookie.
    const user = HAS_DB ? await upsertUser(c.sub, c.email, name) : { id: 'z:' + c.sub, zoho_id: c.sub, email: c.email, name };
    const res = NextResponse.redirect(`${BASE}/app`);
    setSession(res, user);
    return res;
  } catch (e: any) { return fail(e.message); }
}
