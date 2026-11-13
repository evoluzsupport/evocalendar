import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { PROVIDERS, MODE, REDIRECT_URI, cred, oauthStates, ProviderId } from '@/lib/server';

export async function POST(_: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const p = PROVIDERS[provider as ProviderId];
  if (!p) return NextResponse.json({ error: 'Unknown provider' }, { status: 404 });
  if (MODE === 'demo') return NextResponse.json({ demo: true });
  const c = cred(provider);
  if (!c.clientId) return NextResponse.json({ error: `${p.name} is not configured (missing ${provider.toUpperCase()}_CLIENT_ID)` }, { status: 400 });
  const state = crypto.randomBytes(16).toString('hex');
  oauthStates.set(state, provider);
  const q = new URLSearchParams({ client_id: c.clientId, redirect_uri: REDIRECT_URI, response_type: 'code', scope: p.scope, state, ...p.extra });
  return NextResponse.json({ redirect: p.authUrl + '?' + q });
}
