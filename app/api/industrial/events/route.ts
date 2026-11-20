import { NextRequest, NextResponse } from 'next/server';
import db from '@/db/drizzle';
import { industrialGateway, industrialGatewayCredential, industrialEvent } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { createHash } from 'crypto';

// POST /api/industrial/events
// Called by industrial gateways to submit production events.
// Auth: Bearer token hashed and compared against gateway credential.

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

    const tokenHash = createHash('sha256').update(apiKey).digest('hex');

    // Look up the credential then join to gateway
    const [credential] = await db
      .select()
      .from(industrialGatewayCredential)
      .where(eq(industrialGatewayCredential.credentialHash, tokenHash))
      .limit(1);

    if (!credential) {
      return NextResponse.json({ error: 'Unknown credential' }, { status: 401 });
    }

    const [gateway] = await db
      .select()
      .from(industrialGateway)
      .where(and(eq(industrialGateway.id, credential.gatewayId), eq(industrialGateway.status, 'active')))
      .limit(1);

    if (!gateway) {
      return NextResponse.json({ error: 'Gateway not found or not active' }, { status: 403 });
    }

    const body = await req.json();
    const events: unknown[] = Array.isArray(body) ? body : [body];

    if (events.length === 0 || events.length > 100) {
      return NextResponse.json({ error: 'Batch must contain 1–100 events' }, { status: 400 });
    }

    const VALID_TYPES = ['production_count','weight_reading','line_start','line_stop','reject_count','downtime','sensor_reading','batch_tag'];

    const inserted: string[] = [];
    const errors: { index: number; error: string }[] = [];

    for (let i = 0; i < events.length; i++) {
      const ev = events[i] as Record<string, unknown>;
      if (!ev || typeof ev !== 'object') {
        errors.push({ index: i, error: 'Event must be an object' });
        continue;
      }
      if (!VALID_TYPES.includes(ev.eventType as string)) {
        errors.push({ index: i, error: `Invalid eventType: ${ev.eventType}` });
        continue;
      }
      if (!ev.eventTimestamp) {
        errors.push({ index: i, error: 'eventTimestamp is required' });
        continue;
      }
      const eventTimestamp = new Date(ev.eventTimestamp as string);
      if (isNaN(eventTimestamp.getTime())) {
        errors.push({ index: i, error: 'eventTimestamp must be a valid ISO date' });
        continue;
      }
      if (eventTimestamp.getTime() > Date.now() + 86400000) {
        errors.push({ index: i, error: 'eventTimestamp is too far in the future' });
        continue;
      }
      if (!ev.productionLineId || !ev.equipmentId) {
        errors.push({ index: i, error: 'productionLineId and equipmentId are required' });
        continue;
      }
      if (!ev.sequenceNumber || typeof ev.sequenceNumber !== 'number') {
        errors.push({ index: i, error: 'sequenceNumber (positive integer) is required' });
        continue;
      }

      const originalPayload = { ...ev };
      const normalizedPayload = { eventType: ev.eventType, measurements: ev.measurements ?? {} };
      const payloadHash = createHash('sha256').update(JSON.stringify(originalPayload)).digest('hex');
      const eventId = ev.eventId as string ?? `${gateway.id}-${ev.sequenceNumber}-${ev.eventType}`;

      try {
        const [row] = await db.insert(industrialEvent).values({
          eventId,
          gatewayId: gateway.id,
          manufacturerId: gateway.manufacturerId,
          factoryId: gateway.factoryId,
          productionLineId: ev.productionLineId as string,
          equipmentId: ev.equipmentId as string,
          batchId: (ev.batchId as string) ?? null,
          batchReference: (ev.batchReference as string) ?? null,
          eventType: ev.eventType as string,
          stageCode: (ev.stageCode as string) ?? null,
          sequenceNumber: ev.sequenceNumber as number,
          eventTimestamp,
          measurements: (ev.measurements as Record<string, number>) ?? {},
          unit: (ev.unit as string) ?? null,
          schemaVersion: (ev.schemaVersion as string) ?? '1.0',
          originalPayload,
          normalizedPayload,
          payloadHash,
          isSimulated: (ev.isSimulated as boolean) ?? false,
        }).returning({ id: industrialEvent.id });
        inserted.push(row.id);
      } catch (err) {
        errors.push({ index: i, error: String(err) });
      }
    }

    // Update gateway last sync timestamp
    await db.update(industrialGateway)
      .set({ lastSyncAt: new Date() })
      .where(eq(industrialGateway.id, gateway.id));

    return NextResponse.json({
      accepted: inserted.length,
      rejected: errors.length,
      insertedIds: inserted,
      errors,
    }, { status: errors.length > 0 && inserted.length === 0 ? 400 : 200 });
  } catch (err) {
    console.error('[industrial-events] POST error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
