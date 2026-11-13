import { NextResponse } from 'next/server';
import { readDb, writeDb } from '@/lib/server';

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = readDb();
  db.accounts = db.accounts.filter(a => a.id !== id);
  writeDb(db);
  return NextResponse.json({ ok: true });
}
