import { NextRequest, NextResponse } from 'next/server';
import db from '@/db/drizzle';
import { factory, factoryProductionLine, industrialEquipment, industrialGateway, industrialGatewayCredential, industrialEvent, productionBatch } from '@/db/schema';
import { and, eq, lt } from 'drizzle-orm';
import { createHash } from 'crypto';
import { verifyGatewaySignature, isTimestampFresh } from '@/lib/industrial-security';
import { z } from 'zod';

const eventSchema = z.object({
  eventId: z.string().min(1).max(200).optional(),
  eventType: z.enum(['production_count', 'weight_reading', 'line_start', 'line_stop', 'reject_count', 'downtime', 'sensor_reading', 'batch_tag']),
  eventTimestamp: z.string().datetime({ offset: true }),
  productionLineId: z.string().min(1).max(200),
  equipmentId: z.string().min(1).max(200),
  batchId: z.string().min(1).max(200).optional().nullable(),
  batchReference: z.string().max(200).optional().nullable(),
  sequenceNumber: z.number().int().positive(),
  stageCode: z.string().max(100).optional().nullable(),
  schemaVersion: z.string().min(1).max(30).optional(),
  unit: z.string().max(50).optional().nullable(),
  measurements: z.record(z.string(), z.number().finite()).optional(),
}).passthrough();

// POST /api/industrial/events
// Called by industrial gateways to submit production events.
// Auth: Bearer token hashed and compared against gateway credential.
// Security: Ed25519 signature verification + nonce replay protection + credential expiry check.

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

    // ── C2: Timestamp freshness check (replay protection — ±5 min window) ───
    const timestamp = req.headers.get('x-tfi-timestamp');
    const nonce     = req.headers.get('x-tfi-nonce');
    const signature = req.headers.get('x-tfi-signature');
    const keyVersion = req.headers.get('x-tfi-key-version');

    // Signed gateways MUST supply a fresh timestamp; legacy bearer gateways may omit it
    if (timestamp !== null && !isTimestampFresh(timestamp)) {
      return NextResponse.json({ error: 'Request timestamp invalid or expired (±5 min window)' }, { status: 401 });
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

    // ── C4: Credential expiry and revocation check ───────────────────────────
    const now = new Date();
    if (credential.revokedAt) {
      return NextResponse.json({ error: 'Credential has been revoked' }, { status: 401 });
    }
    if (credential.expiresAt && credential.expiresAt < now) {
      return NextResponse.json({ error: 'Credential has expired' }, { status: 401 });
    }

    const [gateway] = await db
      .select()
      .from(industrialGateway)
      .where(and(eq(industrialGateway.id, credential.gatewayId), eq(industrialGateway.status, 'active')))
      .limit(1);

    if (!gateway) {
      return NextResponse.json({ error: 'Gateway not found or not active' }, { status: 403 });
    }

    // Bearer-only gateways are retained in the database for migration visibility,
    // but cannot submit production evidence. Provisioned gateways use signed Ed25519.
    if (gateway.authMode !== 'signed_ed25519') {
      return NextResponse.json({ error: 'Gateway must be upgraded to signed Ed25519 authentication' }, { status: 403 });
    }

    const [gatewayFactory] = await db.select({ id: factory.id })
      .from(factory)
      .where(and(eq(factory.id, gateway.factoryId), eq(factory.manufacturerId, gateway.manufacturerId)))
      .limit(1);
    if (!gatewayFactory) {
      return NextResponse.json({ error: 'Gateway factory assignment is invalid' }, { status: 403 });
    }

    // ── C1: Ed25519 signature verification (signed_ed25519 auth mode only) ───
    // Read raw body before .json() — required for signature verification
    let rawBody: string;
    try {
      rawBody = await req.text();
    } catch {
      return NextResponse.json({ error: 'Failed to read request body' }, { status: 400 });
    }

    if (!timestamp || !nonce || !signature) {
      return NextResponse.json(
        { error: 'Signed gateways must supply x-tfi-timestamp, x-tfi-nonce, and x-tfi-signature headers' },
        { status: 401 }
      );
    }
    if (!credential.publicSigningKey) {
      return NextResponse.json({ error: 'Gateway credential has no signing key on record' }, { status: 500 });
    }

      // ── Nonce uniqueness check (prevents replay of a previously valid request) ─
      const { industrialGatewayRequestNonce } = await import('@/db/schema');
      const [existingNonce] = await db
        .select({ id: industrialGatewayRequestNonce.id })
        .from(industrialGatewayRequestNonce)
        .where(
          and(
            eq(industrialGatewayRequestNonce.gatewayId, gateway.id),
            eq(industrialGatewayRequestNonce.nonce, nonce),
          )
        )
        .limit(1);

      if (existingNonce) {
        return NextResponse.json({ error: 'Nonce already used — replay detected' }, { status: 401 });
      }

      // Verify Ed25519 signature over canonical request
      const valid = verifyGatewaySignature(credential.publicSigningKey, signature, {
        method: 'POST',
        path: '/api/industrial/events',
        rawBody,
        timestamp,
        nonce,
        keyVersion,
        signatureVersion: '1',
        signature,
      });
      if (!valid) {
        return NextResponse.json({ error: 'Invalid request signature' }, { status: 401 });
      }

      // Record nonce with 10-minute TTL (matches ±5 min timestamp window × 2)
      const nonceExpiry = new Date(Date.now() + 10 * 60 * 1000);
      const [recordedNonce] = await db.insert(industrialGatewayRequestNonce).values({
        id: crypto.randomUUID(),
        gatewayId: gateway.id,
        nonce,
        expiresAt: nonceExpiry,
      }).onConflictDoNothing().returning({ id: industrialGatewayRequestNonce.id });
      if (!recordedNonce) {
        return NextResponse.json({ error: 'Nonce already used — replay detected' }, { status: 401 });
      }

      // Purge expired nonces periodically (best-effort, non-blocking)
      void db.delete(industrialGatewayRequestNonce)
        .where(lt(industrialGatewayRequestNonce.expiresAt, now))
        .catch(() => { /* non-critical */ });

    // Parse body (already read as text above; re-parse as JSON)
    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 });
    }
    const events: unknown[] = Array.isArray(body) ? body : [body];

    if (events.length === 0 || events.length > 100) {
      return NextResponse.json({ error: 'Batch must contain 1–100 events' }, { status: 400 });
    }

    const inserted: string[] = [];
    const errors: { index: number; error: string }[] = [];

    for (let i = 0; i < events.length; i++) {
      const parsed = eventSchema.safeParse(events[i]);
      if (!parsed.success) {
        errors.push({ index: i, error: 'Event has invalid or missing fields' });
        continue;
      }
      const ev = parsed.data;
      const eventTimestamp = new Date(ev.eventTimestamp);
      if (eventTimestamp.getTime() > Date.now() + 86400000) {
        errors.push({ index: i, error: 'eventTimestamp is too far in the future' });
        continue;
      }

      const [line] = await db.select({ id: factoryProductionLine.id })
        .from(factoryProductionLine)
        .where(and(
          eq(factoryProductionLine.id, ev.productionLineId),
          eq(factoryProductionLine.factoryId, gateway.factoryId),
          eq(factoryProductionLine.manufacturerId, gateway.manufacturerId),
          eq(factoryProductionLine.operationalStatus, 'active'),
        )).limit(1);
      if (!line) {
        errors.push({ index: i, error: 'Production line is not active or is not assigned to this gateway factory' });
        continue;
      }

      const [equipment] = await db.select({ id: industrialEquipment.id })
        .from(industrialEquipment)
        .where(and(
          eq(industrialEquipment.id, ev.equipmentId),
          eq(industrialEquipment.productionLineId, line.id),
          eq(industrialEquipment.factoryId, gateway.factoryId),
          eq(industrialEquipment.manufacturerId, gateway.manufacturerId),
          eq(industrialEquipment.operationalStatus, 'active'),
        )).limit(1);
      if (!equipment) {
        errors.push({ index: i, error: 'Equipment is not active or is not assigned to this production line' });
        continue;
      }

      if (ev.batchId) {
        const [batch] = await db.select({ id: productionBatch.id })
          .from(productionBatch)
          .where(and(
            eq(productionBatch.id, ev.batchId),
            eq(productionBatch.manufacturerId, gateway.manufacturerId),
            eq(productionBatch.factoryId, gateway.factoryId),
            eq(productionBatch.productionLineId, line.id),
            ...(ev.batchReference ? [eq(productionBatch.batchReference, ev.batchReference)] : []),
          )).limit(1);
        if (!batch) {
          errors.push({ index: i, error: 'Batch is not assigned to this manufacturer, factory, and line' });
          continue;
        }
      }

      const originalPayload = { ...ev };
      const normalizedPayload = { eventType: ev.eventType, measurements: ev.measurements ?? {} };
      const payloadHash = createHash('sha256').update(JSON.stringify(originalPayload)).digest('hex');
      const eventId = ev.eventId ?? `${gateway.id}-${ev.sequenceNumber}-${ev.eventType}`;

      try {
        const [row] = await db.insert(industrialEvent).values({
          eventId,
          gatewayId: gateway.id,
          manufacturerId: gateway.manufacturerId,
          factoryId: gateway.factoryId,
          productionLineId: ev.productionLineId,
          equipmentId: ev.equipmentId,
          batchId: ev.batchId ?? null,
          batchReference: ev.batchReference ?? null,
          eventType: ev.eventType,
          stageCode: ev.stageCode ?? null,
          sequenceNumber: ev.sequenceNumber,
          eventTimestamp,
          measurements: ev.measurements ?? {},
          unit: ev.unit ?? null,
          schemaVersion: ev.schemaVersion ?? '1.0',
          originalPayload,
          normalizedPayload,
          payloadHash,
          // C4: isSimulated is server-derived from gateway.sourceType — never trusted from client payload
          isSimulated: gateway.sourceType === 'simulator',
        }).returning({ id: industrialEvent.id });
        inserted.push(row.id);
      } catch (err) {
        console.error('[industrial-events] event insert failed:', err);
        errors.push({ index: i, error: 'Event could not be recorded; check for a duplicate event ID and retry if appropriate' });
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
