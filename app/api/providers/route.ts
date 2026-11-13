import { NextResponse } from 'next/server';
import { PROVIDERS } from '@/lib/server';

export const dynamic = 'force-dynamic';
export function GET() {
  return NextResponse.json(Object.entries(PROVIDERS).map(([id, p]) => ({ id, name: p.name, letter: p.letter, desc: p.desc })));
}
