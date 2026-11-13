import { NextResponse } from 'next/server';
import { isRes, requireUser } from '@/lib/session';
import { getSettings, saveSettings } from '@/lib/store';

export const dynamic = 'force-dynamic';
export async function GET() {
  const u = await requireUser();
  if (isRes(u)) return u;
  return NextResponse.json(await getSettings(u.id));
}
export async function PUT(req: Request) {
  const u = await requireUser();
  if (isRes(u)) return u;
  const b = await req.json().catch(() => ({}));
  const patch: Record<string, string> = {};
  for (const k of ['timezone', 'defaultView', 'syncFrequency']) if (typeof b[k] === 'string') patch[k] = b[k];
  return NextResponse.json(await saveSettings(u.id, patch));
}
