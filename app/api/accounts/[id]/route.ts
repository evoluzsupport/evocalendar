import { NextResponse } from 'next/server';
import { isRes, requireUser } from '@/lib/session';
import { deleteAccount } from '@/lib/store';

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser();
  if (isRes(u)) return u;
  await deleteAccount(u.id, (await params).id);
  return NextResponse.json({ ok: true });
}
