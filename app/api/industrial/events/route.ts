import { NextRequest, NextResponse } from 'next/server';
import db from '@/db/drizzle';
import { industrialGateway, industrialGatewayCredential, industrialEvent } from '@/db/schema';
import { and, eq, lt } from 'drizzle-orm';
import { createHash } from 'crypto';
import { verifyGatewaySignature, isTimestampFresh } from '@/lib/industrial-security';
import { consumeRateLimit, getRequestIdentity } from '@/lib/rate-limit';

// POST /api/industrial/events
// Called by industrial gateways to submit production events.
// Auth: Bearer token hashed and compared against gateway credential.
// Security: IP rate limit → Ed25519 signature + nonce replay protection + credential expiry check.

export async function POST(req: NextRequest) {
  try {
    // ── IP-level rate limit (before expensive DB auth) ───────────────────────
    const ipRate = await consumeRateLimit(
      'industrial-event-ip',
      getRequestIdentity(req.headers),
      120,
      60,
    ).catch(() => ({ allowed: true, retryAfterSeconds: 0 }));
    if (!ipRate.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Try again later.' },
        { status: 429, headers: { 'Retry-After': String(ipRate.retryAfterSeconds) } },
      );
    }

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

    // ── Gateway-specific rate limit (after authentication) ───────────────────
    const gwRate = await consumeRateLimit('industrial-event-gateway', gateway.id, 6000, 60)
      .catch(() => ({ allowed: true, retryAfterSeconds: 0 }));
    if (!gwRate.allowed) {
      return NextResponse.json(
        { error: 'Gateway event rate limit exceeded.' },
        { status: 429, headers: { 'Retry-After': String(gwRate.retryAfterSeconds) } },
      );
    }

    // ── C1: Ed25519 signature verification (signed_ed25519 auth mode only) ───
    // Read raw body before .json() — required for signature verification
    let rawBody: string;
    try {
      rawBody = await req.text();
    } catch {
      return NextResponse.json({ error: 'Failed to read request body' }, { status: 400 });
    }

    if (gateway.authMode === 'signed_ed25519') {
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
      await db.insert(industrialGatewayRequestNonce).values({
        id: crypto.randomUUID(),
        gatewayId: gateway.id,
        nonce,
        expiresAt: nonceExpiry,
      });

      // Purge expired nonces periodically (best-effort, non-blocking)
      void db.delete(industrialGatewayRequestNonce)
        .where(lt(industrialGatewayRequestNonce.expiresAt, now))
        .catch(() => { /* non-critical */ });
    }

    // Parse body (already read as text above; re-parse as JSON)
    let body: unknown;
    try {
      body = JSON.parse(rawBody!);
    } catch {
      return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 });
    }
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
          // C4: isSimulated is server-derived from gateway.sourceType — never trusted from client payload
          isSimulated: gateway.sourceType === 'simulator',
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
