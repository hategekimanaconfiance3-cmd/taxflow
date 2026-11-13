import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({ ok: true, time: new Date().toISOString(), env: { hasDbUrl: !!process.env.DATABASE_URL, hasAuthUrl: !!process.env.BETTER_AUTH_URL, hasSecret: !!process.env.BETTER_AUTH_SECRET } });
}
