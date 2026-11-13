import { NextResponse } from 'next/server';
import { PROVIDERS, REDIRECT_URI, BASE, cred, oauthStates, readDb, writeDb, tokenRequest, uuid, ProviderId } from '@/lib/server';

export const dynamic = 'force-dynamic';
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const back = (q: Record<string, string>) => NextResponse.redirect(`${BASE}/?${new URLSearchParams(q)}`);
  const state = sp.get('state') || '';
  const id = oauthStates.get(state);
  oauthStates.delete(state);
  if (!id || sp.get('error') || !sp.get('code')) return back({ error: sp.get('error') || 'invalid_state' });
  try {
    const c = cred(id);
    const t = await tokenRequest(PROVIDERS[id as ProviderId], { grant_type: 'authorization_code', code: sp.get('code')!, redirect_uri: REDIRECT_URI, client_id: c.clientId, client_secret: c.clientSecret });
    let email = id + ' account';
    if (t.id_token) { try { email = JSON.parse(Buffer.from(t.id_token.split('.')[1], 'base64url').toString()).email || email; } catch {} }
    const db = readDb();
    db.accounts.push({ id: uuid(), provider: id, email, accessToken: t.access_token, refreshToken: t.refresh_token, expiresAt: Date.now() + (t.expires_in || 3600) * 1000 });
    writeDb(db);
    return back({ connected: email });
  } catch (e: any) { return back({ error: e.message }); }
}
