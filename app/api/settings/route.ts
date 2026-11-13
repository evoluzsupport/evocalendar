import { NextResponse } from 'next/server';
import { readDb, writeDb } from '@/lib/server';

export const dynamic = 'force-dynamic';
export function GET() { return NextResponse.json(readDb().settings); }
export async function PUT(req: Request) {
  const b = await req.json().catch(() => ({}));
  const db = readDb();
  for (const k of ['timezone', 'defaultView', 'syncFrequency']) if (typeof b[k] === 'string') db.settings[k] = b[k];
  writeDb(db);
  return NextResponse.json(db.settings);
}
