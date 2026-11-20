import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { runGatewayHealthScan } from '@/lib/scheduler/jobs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function hasValidCronAuthorization(authorization: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 32 || !authorization || authorization.length > 512) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const supplied = Buffer.from(authorization);
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

export async function GET(request: Request): Promise<NextResponse> {
  if (!hasValidCronAuthorization(request.headers.get('authorization'))) {
    const configured = Boolean(process.env.CRON_SECRET && process.env.CRON_SECRET.length >= 32);
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, {
      status: configured ? 401 : 503,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
  try {
    const ok = await runGatewayHealthScan();
    return NextResponse.json({ ok }, {
      status: ok ? 200 : 503,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error('[cron:gateway-health]', {
      errorName: error instanceof Error ? error.name : 'UnknownError',
    });
    return NextResponse.json({ ok: false, error: 'Gateway health scan failed.' }, {
      status: 503,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
}
