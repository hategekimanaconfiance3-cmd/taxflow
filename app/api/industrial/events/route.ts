import { NextRequest, NextResponse } from 'next/server';
import db from '@/db/drizzle';
import { industrialGateway, industrialEvent } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { createHash } from 'crypto';

// POST /api/industrial/events
// Called by industrial gateways to submit production events
// Auth: Bearer token (hashed and compared against gateway.apiKeyHash)

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Missing or invalid authorization header' }, { status: 401 });
    }
    const apiKey = authHeader.slice(7);
    if (!apiKey || apiKey.length < 16) {
      return NextResponse.json({ error: 'API key too short' }, { status: 401 });
    }

    const apiKeyHash = createHash('sha256').update(apiKey).digest('hex');

    const [gateway] = await db
      .select()
      .from(industrialGateway)
      .where(eq(industrialGateway.apiKeyHash, apiKeyHash))
      .limit(1);

    if (!gateway) {
      return NextResponse.json({ error: 'Unknown gateway' }, { status: 401 });
    }
    if (gateway.status !== 'active') {
      return NextResponse.json({ error: `Gateway is ${gateway.status}` }, { status: 403 });
    }

    const body = await req.json();
    const events = Array.isArray(body) ? body : [body];

    if (events.length === 0 || events.length > 100) {
      return NextResponse.json({ error: 'Batch must contain 1–100 events' }, { status: 400 });
    }

    const VALID_TYPES = ['production_count','weight_reading','line_start','line_stop','reject_count','downtime','sensor_reading','batch_tag'];

    const inserted: string[] = [];
    const errors: { index: number; error: string }[] = [];

    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      if (!ev || typeof ev !== 'object') {
        errors.push({ index: i, error: 'Event must be an object' });
        continue;
      }
      if (!VALID_TYPES.includes(ev.eventType)) {
        errors.push({ index: i, error: `Invalid eventType: ${ev.eventType}` });
        continue;
      }
      if (!ev.eventTimestamp) {
        errors.push({ index: i, error: 'eventTimestamp is required' });
        continue;
      }
      const eventTimestamp = new Date(ev.eventTimestamp);
      if (isNaN(eventTimestamp.getTime())) {
        errors.push({ index: i, error: 'eventTimestamp must be a valid ISO date' });
        continue;
      }
      // Reject events more than 24h in the future
      if (eventTimestamp.getTime() > Date.now() + 86400000) {
        errors.push({ index: i, error: 'eventTimestamp is too far in the future' });
        continue;
      }

      try {
        const [row] = await db.insert(industrialEvent).values({
          id: crypto.randomUUID(),
          gatewayId: gateway.id,
          manufacturerId: gateway.manufacturerId,
          factoryId: gateway.factoryId,
          productionLineId: ev.productionLineId ?? null,
          equipmentId: ev.equipmentId ?? null,
          eventType: ev.eventType,
          payload: ev.payload ?? {},
          productionBatchId: ev.productionBatchId ?? null,
          eventTimestamp,
          processingStatus: 'received',
          anomalyScore: null,
        }).returning({ id: industrialEvent.id });
        inserted.push(row.id);
      } catch (err) {
        errors.push({ index: i, error: String(err) });
      }
    }

    // Update gateway lastSeenAt
    await db.update(industrialGateway)
      .set({ lastSeenAt: new Date() })
      .where(eq(industrialGateway.id, gateway.id));

    return NextResponse.json({
      accepted: inserted.length,
      rejected: errors.length,
      insertedIds: inserted,
      errors,
    }, { status: errors.length > 0 && inserted.length === 0 ? 400 : 200 });

  } catch (err) {
    console.error('[industrial/events] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// GET /api/industrial/events - health check for gateways
export async function GET(req: NextRequest) {
  return NextResponse.json({ status: 'ok', timestamp: new Date().toISOString() });
}
