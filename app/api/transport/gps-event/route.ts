// POST /api/transport/gps-event
// Receives GPS position pings from vehicle tracking devices or manual entry.
// Validates coordinates, detects route deviations, creates aiFinding records.
//
// Security: bearer token (GPS_WEBHOOK_SECRET env var) or active RRA staff session.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { timingSafeEqual } from 'node:crypto';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import db from '@/db/drizzle';
import { rraStaff } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { processGPSEvent, scanForMissingArrivals } from '@/lib/ai/transport-tracker';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const GPSEventSchema = z.object({
  vehicleRegistration: z.string().min(2).max(20).transform(s => s.toUpperCase().trim()),
  transactionId: z.string().uuid().optional(),
  driverId: z.string().optional(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  speedKmh: z.number().min(0).max(300).optional(),
  headingDegrees: z.number().min(0).max(360).optional(),
  timestamp: z.string().datetime().transform(s => new Date(s)).optional(),
  source: z.enum(['api', 'manual', 'gateway']).default('api'),
  eventType: z.enum(['position', 'stop', 'departure', 'arrival', 'alert']).default('position'),
  metadata: z.record(z.unknown()).optional(),
});

function hasValidWebhookSecret(authorization: string | null): boolean {
  const secret = process.env.GPS_WEBHOOK_SECRET;
  if (!secret || secret.length < 16 || !authorization) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const supplied = Buffer.from(authorization);
  if (expected.length !== supplied.length) return false;
  return timingSafeEqual(expected, supplied);
}

async function isAuthorizedStaff(): Promise<boolean> {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) return false;
    const [staff] = await db.select({ id: rraStaff.id })
      .from(rraStaff)
      .where(and(eq(rraStaff.userId, session.user.id), eq(rraStaff.isActive, true)))
      .limit(1);
    return !!staff;
  } catch {
    return false;
  }
}

// POST — receive a GPS event from a tracker or manual entry
export async function POST(request: NextRequest) {
  try {
    const isWebhook = hasValidWebhookSecret(request.headers.get('authorization'));
    const isStaff = isWebhook ? false : await isAuthorizedStaff();

    if (!isWebhook && !isStaff) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json() as unknown;
    const parsed = GPSEventSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: 'Invalid GPS event', details: parsed.error.flatten() }, { status: 400 });
    }

    const event = parsed.data;
    const result = await processGPSEvent({
      ...event,
      timestamp: event.timestamp ?? new Date(),
    });

    return NextResponse.json({
      ok: result.accepted,
      eventId: result.eventId,
      alertsGenerated: result.alerts.length,
      alerts: result.alerts.map(a => ({
        type: a.alertType,
        severity: a.severity,
        description: a.description,
      })),
    }, {
      status: result.accepted ? 200 : 422,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error('[/api/transport/gps-event] POST error:', error);
    return NextResponse.json({ ok: false, error: 'Internal error' }, { status: 500 });
  }
}

// GET — scan for missing arrival events (staff only)
export async function GET(request: NextRequest) {
  try {
    const isStaff = await isAuthorizedStaff();
    if (!isStaff) {
      return NextResponse.json({ ok: false, error: 'RRA staff session required' }, { status: 401 });
    }

    const hours = parseInt(request.nextUrl.searchParams.get('hours') ?? '48', 10);
    const alerts = await scanForMissingArrivals(Math.min(Math.max(hours, 1), 168));

    return NextResponse.json({
      ok: true,
      scannedForHours: hours,
      alertsFound: alerts.length,
      alerts,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[/api/transport/gps-event] GET error:', error);
    return NextResponse.json({ ok: false, error: 'Internal error' }, { status: 500 });
  }
}
