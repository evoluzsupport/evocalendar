import { NextResponse } from 'next/server';
import { PROVIDERS, MODE, readDb, writeDb, publicAcct, uuid, ProviderId } from '@/lib/server';

export async function POST(_: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const p = PROVIDERS[provider as ProviderId];
  if (!p || MODE !== 'demo') return NextResponse.json({ error: 'Demo connect unavailable' }, { status: 400 });
  const db = readDb();
  const n = db.accounts.filter(a => a.provider === provider).length;
  const [u, d] = p.demoEmail.split('@');
  const acct = { id: uuid(), provider, email: n ? `${u}${n + 1}@${d}` : p.demoEmail };
  db.accounts.push(acct);
  writeDb(db);
  return NextResponse.json(publicAcct(acct));
}
