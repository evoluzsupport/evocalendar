import { NextResponse } from 'next/server';
import { DEMO, PROVIDERS, ProviderId } from '@/lib/config';
import { isRes, requireUser } from '@/lib/session';
import { addAccount, listAccounts } from '@/lib/store';

// Local development only
export async function POST(_: Request, { params }: { params: Promise<{ provider: string }> }) {
  const u = await requireUser();
  if (isRes(u)) return u;
  const id = (await params).provider as ProviderId;
  const p = PROVIDERS[id];
  if (!p || !DEMO) return NextResponse.json({ error: 'Not available' }, { status: 404 });
  const n = (await listAccounts(u.id)).filter(a => a.provider === id).length;
  const [name, dom] = p.demoEmail.split('@');
  const email = n ? `${name}${n + 1}@${dom}` : p.demoEmail;
  await addAccount({ user_id: u.id, provider: id, email });
  return NextResponse.json({ email });
}
