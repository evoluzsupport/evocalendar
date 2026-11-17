import { NextResponse } from 'next/server';
import { BASE, DEMO, PROVIDERS, ProviderId, cred } from '@/lib/config';
import { redirectWithState } from '@/lib/oauth';
import { isRes, requireUser } from '@/lib/session';

// Starts connecting an OAuth mailbox (Google / Microsoft / Zoho). Returns the provider's sign-in URL.
// Body { other: true } = the link will be opened in a different browser / profile (returned for the user to copy).
export async function POST(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const u = await requireUser();
  if (isRes(u)) return u;
  const id = (await params).provider as ProviderId;
  const p = PROVIDERS[id];
  if (!p || p.kind !== 'oauth') return NextResponse.json({ error: 'Unknown provider' }, { status: 404 });
  const other = (await req.json().catch(() => ({}))).other === true;
  const c = cred(id);
  if (!c.clientId) {
    if (DEMO) return NextResponse.json({ demo: true });
    return NextResponse.json({ error: `${p.name} is not configured yet (missing ${id.toUpperCase()}_CLIENT_ID)` }, { status: 400 });
  }
  if (other && u.id === 'guest') return NextResponse.json({ error: 'Connecting from another browser needs a real sign-in. Guest accounts are stored in this browser only.' }, { status: 400 });
  return redirectWithState(p.authUrl!, { client_id: c.clientId, redirect_uri: `${BASE}/api/oauth/callback`, response_type: 'code', scope: p.scope!, ...p.extra, ...(id === 'zoho' ? { prompt: 'login' } : {}) },
    { kind: 'connect', provider: id, uid: u.id, ...(other ? { remote: true } : {}) });
}
