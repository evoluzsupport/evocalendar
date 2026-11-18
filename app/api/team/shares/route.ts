import { NextResponse } from 'next/server';
import { isRes, requireUser } from '@/lib/session';
import { Share, listAccounts, listOwnedShares, sharingAvailable, upsertShare } from '@/lib/store';
import { domainOf, isPublicDomain, openAccounts, sealAccounts, syncOwnedShares } from '@/lib/team';

export const dynamic = 'force-dynamic';
const NO_DB = 'Sharing with teammates needs the Supabase database. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY and run supabase/schema.sql.';

const view = (s: Share) => ({ id: s.id, recipient: s.recipient, permission: s.permission, accounts: openAccounts(s).map(a => ({ id: a.id, provider: a.provider, email: a.email })) });

// Shares the signed-in user has created. Also re-syncs their stored credentials with the accounts they have connected now.
export async function GET() {
  const u = await requireUser();
  if (isRes(u)) return u;
  if (!sharingAvailable) return NextResponse.json({ available: false, shares: [] });
  try {
    await syncOwnedShares(u, await listAccounts(u.id));
    return NextResponse.json({ available: true, domain: isPublicDomain(domainOf(u.email)) ? '' : domainOf(u.email), shares: (await listOwnedShares(u.id)).map(view) });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}

// Share with one or more people (emails) and/or the whole organisation ("@domain").
export async function POST(req: Request) {
  const u = await requireUser();
  if (isRes(u)) return u;
  if (!sharingAvailable) return NextResponse.json({ error: NO_DB }, { status: 400 });
  const b = await req.json().catch(() => ({}));
  const permission = b.permission === 'busy' ? 'busy' : 'details';
  const mine = domainOf(u.email);
  const targets = new Set<string>();
  for (const raw of Array.isArray(b.emails) ? b.emails : String(b.emails || '').split(/[\s,;]+/)) {
    const e = String(raw).trim().toLowerCase();
    if (!e) continue;
    if (!/^[^\s@"]+@[^\s@"]+\.[^\s@"]+$/.test(e)) return NextResponse.json({ error: `"${raw}" is not a valid email address` }, { status: 400 });
    if (e === u.email.toLowerCase()) continue; // sharing with yourself is a no-op
    targets.add(e);
  }
  if (b.organization) {
    if (!mine || isPublicDomain(mine)) return NextResponse.json({ error: 'Your sign-in email is not on an organisation domain, so there is no organisation to share with. Enter your teammates’ emails instead.' }, { status: 400 });
    targets.add('@' + mine);
  }
  if (!targets.size) return NextResponse.json({ error: 'Enter at least one email address, or choose your organisation.' }, { status: 400 });
  if (targets.size > 50) return NextResponse.json({ error: 'Share with at most 50 people at a time.' }, { status: 400 });

  const all = await listAccounts(u.id);
  const ids: string[] = Array.isArray(b.accountIds) ? b.accountIds : all.map(a => a.id);
  const chosen = all.filter(a => ids.includes(a.id));
  if (!chosen.length) return NextResponse.json({ error: 'Choose at least one connected account to share. Connect one under Integration first.' }, { status: 400 });
  try {
    const sealed = sealAccounts(chosen);
    for (const recipient of targets) await upsertShare({ owner_id: u.id, owner_name: u.name || u.email, owner_email: u.email, recipient, permission, accounts_enc: sealed });
    return NextResponse.json({ ok: true, count: targets.size, shares: (await listOwnedShares(u.id)).map(view) });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
