import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { BASE, DEMO, ZOHO_ACCOUNTS, cred } from '@/lib/config';
import { sign } from '@/lib/crypto';
import { withNonce } from '@/lib/oauth';

// Starts "Sign in with Zoho"
export async function GET() {
  const { clientId } = cred('zoho');
  if (!clientId) {
    if (DEMO) return NextResponse.redirect(`${BASE}/api/auth/demo`);
    return NextResponse.redirect(`${BASE}/?error=${encodeURIComponent('Zoho sign-in is not configured (missing ZOHO_CLIENT_ID)')}`);
  }
  const nonce = crypto.randomBytes(12).toString('hex');
  const state = sign({ kind: 'login', nonce }, 600);
  const url = `${ZOHO_ACCOUNTS}/oauth/v2/auth?` + new URLSearchParams({
    client_id: clientId, response_type: 'code', redirect_uri: `${BASE}/api/auth/zoho/callback`,
    scope: 'openid,email,profile', access_type: 'online', prompt: 'select_account', state,
  });
  return withNonce(NextResponse.redirect(url), nonce);
}
