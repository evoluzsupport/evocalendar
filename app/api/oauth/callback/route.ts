import { NextRequest, NextResponse } from 'next/server';
import { BASE, PROVIDERS, ProviderId, cred } from '@/lib/config';
import { tokenRequest } from '@/lib/events';
import { idTokenClaims, readState } from '@/lib/oauth';
import { currentUser } from '@/lib/session';
import { addAccount, getUser } from '@/lib/store';

export const dynamic = 'force-dynamic';
const esc = (s: string) => s.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
// Shown in the *other* browser after authorizing there (it has no EvoCalendar session to redirect into).
const page = (title: string, msg: string) => new NextResponse(
  `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>EvoCalendar</title>` +
  `<body style="font:16px system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#f6f7f9;color:#1a1d23"><div style="background:#fff;padding:32px 36px;border-radius:14px;max-width:420px;box-shadow:0 4px 24px #0001;text-align:center">` +
  `<h2 style="margin:0 0 8px">${esc(title)}</h2><p style="margin:0;color:#555">${esc(msg)}</p></div></body>`,
  { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const st = readState<{ kind: string; provider: ProviderId; uid: string; remote?: boolean }>(req);
  const remote = st?.remote === true;
  const back = (q: Record<string, string>) => remote
    ? (q.connected ? page('Connected ✓', `${q.connected} was added. You can close this tab and go back to EvoCalendar.`) : page('Connection failed', q.error))
    : NextResponse.redirect(`${BASE}/app?${new URLSearchParams(q)}`);

  if (!st || st.kind !== 'connect') return back({ error: 'Connection expired. Please try again.' });
  let uid: string;
  if (remote) {
    // Different browser: no session cookie here. The signed state names the user who generated the link.
    if (st.uid === 'guest' || !(await getUser(st.uid))) return back({ error: 'Connection expired. Please try again.' });
    uid = st.uid;
  } else {
    const user = await currentUser();
    if (!user || user.id !== st.uid) return back({ error: 'Connection expired. Please try again.' });
    uid = user.id;
  }
  if (sp.get('error') || !sp.get('code')) return back({ error: sp.get('error_description') || sp.get('error') || 'Cancelled' });
  try {
    const p = PROVIDERS[st.provider], c = cred(st.provider);
    const t = await tokenRequest(p.tokenUrl!, { grant_type: 'authorization_code', code: sp.get('code')!, redirect_uri: `${BASE}/api/oauth/callback`, client_id: c.clientId, client_secret: c.clientSecret });
    const claims = idTokenClaims(t.id_token);
    const email = claims.email || claims.preferred_username;
    if (!email) throw new Error('Could not read the account email');
    await addAccount({ user_id: uid, provider: st.provider, email, access_token: t.access_token, refresh_token: t.refresh_token || null, expires_at: Date.now() + (t.expires_in || 3600) * 1000 });
    return back({ connected: email });
  } catch (e: any) { return back({ error: e.message }); }
}
