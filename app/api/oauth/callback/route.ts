import { NextRequest, NextResponse } from 'next/server';
import { BASE, PROVIDERS, ProviderId, cred } from '@/lib/config';
import { tokenRequest } from '@/lib/events';
import { idTokenClaims, readState } from '@/lib/oauth';
import { currentUser } from '@/lib/session';
import { addAccount } from '@/lib/store';

export const dynamic = 'force-dynamic';
export async function GET(req: NextRequest) {
  const back = (q: Record<string, string>) => NextResponse.redirect(`${BASE}/app?${new URLSearchParams(q)}`);
  const sp = req.nextUrl.searchParams;
  const st = readState<{ kind: string; provider: ProviderId; uid: string }>(req);
  const user = await currentUser();
  if (!st || st.kind !== 'connect' || !user || user.id !== st.uid) return back({ error: 'Connection expired. Please try again.' });
  if (sp.get('error') || !sp.get('code')) return back({ error: sp.get('error_description') || sp.get('error') || 'Cancelled' });
  try {
    const p = PROVIDERS[st.provider], c = cred(st.provider);
    const t = await tokenRequest(p.tokenUrl!, { grant_type: 'authorization_code', code: sp.get('code')!, redirect_uri: `${BASE}/api/oauth/callback`, client_id: c.clientId, client_secret: c.clientSecret });
    const claims = idTokenClaims(t.id_token);
    const email = claims.email || claims.preferred_username;
    if (!email) throw new Error('Could not read the account email');
    await addAccount({ user_id: user.id, provider: st.provider, email, access_token: t.access_token, refresh_token: t.refresh_token || null, expires_at: Date.now() + (t.expires_in || 3600) * 1000 });
    return back({ connected: email });
  } catch (e: any) { return back({ error: e.message }); }
}
