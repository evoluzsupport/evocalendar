import { NextResponse } from 'next/server';
import { isRes, requireUser } from '@/lib/session';

export const dynamic = 'force-dynamic';
export async function GET() {
  const u = await requireUser();
  if (isRes(u)) return u;
  return NextResponse.json({ name: u.name, email: u.email });
}
