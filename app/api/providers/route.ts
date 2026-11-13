import { NextResponse } from 'next/server';
import { PROVIDERS } from '@/lib/config';
import { isRes, requireUser } from '@/lib/session';

export const dynamic = 'force-dynamic';
export async function GET() {
  const u = await requireUser();
  if (isRes(u)) return u;
  return NextResponse.json(Object.entries(PROVIDERS).map(([id, p]) => ({ id, name: p.name, letter: p.letter, desc: p.desc, kind: p.kind, caldavUrl: p.caldavUrl })));
}
