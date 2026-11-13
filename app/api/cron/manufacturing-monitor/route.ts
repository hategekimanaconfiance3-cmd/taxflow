import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { recoverProductionMonitoring } from '@/lib/ai/production-declaration-monitor';

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
    const secret = process.env.CRON_SECRET;
    const isConfigured = Boolean(secret && secret.length >= 32);
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, {
      status: isConfigured ? 401 : 503,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  try {
    const result = await recoverProductionMonitoring();
    return NextResponse.json({ ok: result.comparisonFailures === 0, ...result }, {
      status: result.comparisonFailures === 0 ? 200 : 503,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error('[cron:manufacturing-monitor]', {
      errorName: error instanceof Error ? error.name : 'UnknownError',
    });
    return NextResponse.json({ ok: false, error: 'Manufacturing monitoring recovery failed.' }, {
      status: 503,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
}
