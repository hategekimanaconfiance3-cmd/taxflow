import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { runMonitoringScansOnce } from '@/lib/scheduler/jobs';

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

export async function GET(request: Request) {
  if (!hasValidCronAuthorization(request.headers.get('authorization'))) {
    const configured = Boolean(process.env.CRON_SECRET && process.env.CRON_SECRET.length >= 32);
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, {
      status: configured ? 401 : 503,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  try {
    const result = await runMonitoringScansOnce();
    return NextResponse.json({ ok: result.failedScans === 0, ...result }, {
      status: result.failedScans === 0 ? 200 : 503,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error('[cron:monitoring]', {
      errorName: error instanceof Error ? error.name : 'UnknownError',
    });
    return NextResponse.json({ ok: false, error: 'Monitoring run failed.' }, {
      status: 503,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
}
