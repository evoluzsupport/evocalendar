import { NextResponse } from 'next/server';
import { readDb, writeDb, publicAcct, uuid } from '@/lib/server';

export const dynamic = 'force-dynamic';
export function GET() { return NextResponse.json(readDb().accounts.map(publicAcct)); }

// "Other" platforms (IMAP/CalDAV). Passwords are not stored.
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  if (b.provider !== 'other' || !/^\S+@\S+\.\S+$/.test(b.email || '')) return NextResponse.json({ error: 'Invalid account' }, { status: 400 });
  const db = readDb();
  if (!db.accounts.some(a => a.provider === 'other' && a.email === b.email))
    db.accounts.push({ id: uuid(), provider: 'other', email: b.email, imap: b.imap || '', caldav: b.caldav || '' });
  writeDb(db);
  return NextResponse.json({ ok: true });
}
