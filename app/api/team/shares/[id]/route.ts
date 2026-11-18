import { NextResponse } from 'next/server';
import { isRes, requireUser } from '@/lib/session';
import { deleteShare, patchShare } from '@/lib/store';

export const dynamic = 'force-dynamic';

// Stop sharing with one recipient: it disappears from their sidebar on their next refresh.
export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser();
  if (isRes(u)) return u;
  await deleteShare(u.id, (await params).id);
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser();
  if (isRes(u)) return u;
  const b = await req.json().catch(() => ({}));
  if (b.permission !== 'busy' && b.permission !== 'details') return NextResponse.json({ error: 'Invalid permission' }, { status: 400 });
  await patchShare(u.id, (await params).id, { permission: b.permission });
  return NextResponse.json({ ok: true });
}
