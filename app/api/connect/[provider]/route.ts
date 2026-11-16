import { NextResponse } from 'next/server';
import { BASE, DEMO, PROVIDERS, ProviderId, cred } from '@/lib/config';
import { redirectWithState } from '@/lib/oauth';
import { isRes, requireUser } from '@/lib/session';

// Starts connecting an OAuth mailbox (Google / Microsoft / Zoho). Returns the provider's sign-in URL.
export async function POST(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const u = await requireUser();
  if (isRes(u)) return u;
  const id = (await params).provider as ProviderId;
  const p = PROVIDERS[id];
  if (!p || p.kind !== 'oauth') return NextResponse.json({ error: 'Unknown provider' }, { status: 404 });
  const c = cred(id);
  if (!c.clientId) {
    if (DEMO) return NextResponse.json({ demo: true });
    return NextResponse.json({ error: `${p.name} is not configured yet (missing ${id.toUpperCase()}_CLIENT_ID)` }, { status: 400 });
  }
  return redirectWithState(p.authUrl!, { client_id: c.clientId, redirect_uri: `${BASE}/api/oauth/callback`, response_type: 'code', scope: p.scope!, ...p.extra, ...(id === 'zoho' ? { prompt: 'login' } : {}) }, { kind: 'connect', provider: id, uid: u.id });
}
