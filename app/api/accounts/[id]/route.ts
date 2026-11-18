import { NextResponse } from 'next/server';
import { isRes, requireUser } from '@/lib/session';
import { deleteAccount, listAccounts, sharingAvailable } from '@/lib/store';
import { syncOwnedShares } from '@/lib/team';

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser();
  if (isRes(u)) return u;
  await deleteAccount(u.id, (await params).id);
  if (sharingAvailable) await syncOwnedShares(u, await listAccounts(u.id)).catch(() => {}); // stop sharing a disconnected account straight away
  return NextResponse.json({ ok: true });
}
