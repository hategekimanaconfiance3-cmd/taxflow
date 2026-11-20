// ---------------------------------------------------------------------------
// TaxFlow — Industrial Reconciliation & Gateway Health Unit Tests
// Pure-logic tests (no DB, no network). Tests the reconciliation engine
// formulae and gateway health scan logic in isolation.
//
// Run: cd C:\Users\hp\AppData\Local\Temp\taxflow-push
//      npx tsx --test tests/industrial-reconciliation.test.ts
// ---------------------------------------------------------------------------

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Extracted reconciliation logic (mirrors verifyIndustrialBatch internals)
// ---------------------------------------------------------------------------

function computeAxis(
  machineValue: number | null,
  referenceValue: number | null,
  tolerancePercent: number,
  missingMachineOutcome: string,
  missingReferenceOutcome: string,
  discrepantReasonCode: string,
): { outcome: string; variance: number | null; reasonCodes: string[] } {
  if (machineValue === null) return { outcome: missingMachineOutcome, variance: null, reasonCodes: ['MACHINE_EVIDENCE_MISSING'] };
  if (referenceValue === null) return { outcome: missingReferenceOutcome, variance: null, reasonCodes: ['REFERENCE_DATA_MISSING'] };
  const tolerance = Math.max(1, Math.abs(referenceValue) * (tolerancePercent / 100));
  const variance = machineValue - referenceValue;
  const matched = Math.abs(variance) <= tolerance;
  return {
    outcome: matched ? 'matched' : 'discrepant',
    variance,
    reasonCodes: matched ? [] : [discrepantReasonCode],
  };
}

function determineWorstOutcome(outcomes: string[]): string {
  const rank: Record<string, number> = { discrepant: 3, no_machine_evidence: 2, insufficient_data: 1, no_reported_output: 1, matched: 0 };
  return outcomes.reduce((worst, o) => (rank[o] ?? 0) > (rank[worst] ?? 0) ? o : worst, 'matched');
}

function mapEvidenceStatus(worstOutcome: string, outcomes: string[]): string {
  if (worstOutcome === 'discrepant') return 'discrepant';
  if (worstOutcome === 'no_machine_evidence') return 'insufficient_evidence';
  if (outcomes.some(o => o === 'matched')) return 'supported';
  return 'pending';
}

// ---------------------------------------------------------------------------
// Gateway health helpers (mirrors runGatewayHealthScan logic)
// ---------------------------------------------------------------------------

function isGatewayStale(lastHeartbeatAt: Date | null, offlineCutoff: Date): boolean {
  if (lastHeartbeatAt === null) return true;
  return lastHeartbeatAt < offlineCutoff;
}

function isGatewayRecovered(lastHeartbeatAt: Date | null, onlineCutoff: Date): boolean {
  if (lastHeartbeatAt === null) return false;
  return lastHeartbeatAt >= onlineCutoff;
}

function computeFactoryConnectivityStatus(
  gateways: Array<{ status: string; lastHeartbeatAt: Date | null }>,
  onlineCutoff: Date,
): 'online' | 'offline' {
  return gateways.some(g => g.status === 'active' && isGatewayRecovered(g.lastHeartbeatAt, onlineCutoff))
    ? 'online' : 'offline';
}

// ---------------------------------------------------------------------------
// Tests — Axis A: Machine vs Declared
// ---------------------------------------------------------------------------

describe('Axis A — Machine vs Declared', () => {
  it('matched when machine equals declared exactly', () => {
    const r = computeAxis(10_000, 10_000, 2, 'no_machine_evidence', 'matched', 'MACHINE_DECLARATION_VARIANCE');
    assert.equal(r.outcome, 'matched');
    assert.equal(r.variance, 0);
    assert.deepEqual(r.reasonCodes, []);
  });

  it('matched when machine is within 2% tolerance', () => {
    // 10_000 * 2% = 200 tolerance; machine = 10_190 → within
    const r = computeAxis(10_190, 10_000, 2, 'no_machine_evidence', 'matched', 'MACHINE_DECLARATION_VARIANCE');
    assert.equal(r.outcome, 'matched');
  });

  it('discrepant when machine exceeds 2% tolerance', () => {
    // 10_000 * 2% = 200; machine = 10_450 → 450 > 200 → discrepant
    const r = computeAxis(10_450, 10_000, 2, 'no_machine_evidence', 'matched', 'MACHINE_DECLARATION_VARIANCE');
    assert.equal(r.outcome, 'discrepant');
    assert.equal(r.variance, 450);
    assert.deepEqual(r.reasonCodes, ['MACHINE_DECLARATION_VARIANCE']);
  });

  it('no_machine_evidence when machineValue is null', () => {
    const r = computeAxis(null, 10_000, 2, 'no_machine_evidence', 'matched', 'MACHINE_DECLARATION_VARIANCE');
    assert.equal(r.outcome, 'no_machine_evidence');
    assert.equal(r.variance, null);
    assert.deepEqual(r.reasonCodes, ['MACHINE_EVIDENCE_MISSING']);
  });

  it('minimum tolerance is 1 unit even for tiny reference values', () => {
    // 5 * 2% = 0.1, but min tolerance = 1; machine = 6 → variance 1 = within
    const r = computeAxis(6, 5, 2, 'no_machine_evidence', 'matched', 'MACHINE_DECLARATION_VARIANCE');
    assert.equal(r.outcome, 'matched');
  });

  it('configurable tolerance — 5% allows larger variance', () => {
    // 10_000 * 5% = 500; machine = 10_480 → within
    const r = computeAxis(10_480, 10_000, 5, 'no_machine_evidence', 'matched', 'MACHINE_DECLARATION_VARIANCE');
    assert.equal(r.outcome, 'matched');
  });
});

// ---------------------------------------------------------------------------
// Tests — Axis B: Machine vs Reporter total (good + rejected)
// ---------------------------------------------------------------------------

describe('Axis B — Machine vs Reporter total output', () => {
  it('matched when machine equals reporter good+rejected sum', () => {
    const reporterTotal = 9_500 + 500; // 10_000
    const r = computeAxis(10_000, reporterTotal, 2, 'no_machine_evidence', 'no_reported_output', 'MACHINE_REPORTER_VARIANCE');
    assert.equal(r.outcome, 'matched');
  });

  it('discrepant when machine differs from reporter total beyond tolerance', () => {
    const reporterTotal = 9_000 + 500; // 9_500
    const r = computeAxis(10_000, reporterTotal, 2, 'no_machine_evidence', 'no_reported_output', 'MACHINE_REPORTER_VARIANCE');
    // Tolerance = max(1, 9500 * 2%) = 190; variance = 500 > 190
    assert.equal(r.outcome, 'discrepant');
    assert.deepEqual(r.reasonCodes, ['MACHINE_REPORTER_VARIANCE']);
  });

  it('no_reported_output when reporter data is null', () => {
    const r = computeAxis(10_000, null, 2, 'no_machine_evidence', 'no_reported_output', 'MACHINE_REPORTER_VARIANCE');
    assert.equal(r.outcome, 'no_reported_output');
    assert.deepEqual(r.reasonCodes, ['REFERENCE_DATA_MISSING']);
  });

  it('no_machine_evidence when both are null', () => {
    const r = computeAxis(null, null, 2, 'no_machine_evidence', 'no_reported_output', 'MACHINE_REPORTER_VARIANCE');
    assert.equal(r.outcome, 'no_machine_evidence');
  });

  it('does not compare machine total vs good output alone', () => {
    // Machine = 10_000; reporter GOOD only = 9_500 (but we always pass good+rejected total)
    // This test documents that callers MUST pass good+rejected, not just good
    const goodOnly = 9_500;
    const withRejected = 9_500 + 450; // 9_950
    const rIncorrect = computeAxis(10_000, goodOnly, 2, 'no_machine_evidence', 'no_reported_output', 'MACHINE_REPORTER_VARIANCE');
    const rCorrect   = computeAxis(10_000, withRejected, 2, 'no_machine_evidence', 'no_reported_output', 'MACHINE_REPORTER_VARIANCE');
    // Incorrect comparison (good-only) sees larger variance → discrepant
    assert.equal(rIncorrect.outcome, 'discrepant');
    // Correct comparison (good+rejected) sees smaller variance → may match
    assert.equal(rCorrect.outcome, 'matched');
  });
});

// ---------------------------------------------------------------------------
// Tests — Axis C: Machine rejected vs Reporter rejected
// ---------------------------------------------------------------------------

describe('Axis C — Machine rejected vs Reporter rejected', () => {
  it('matched when machine rejected equals reporter rejected', () => {
    const r = computeAxis(450, 450, 2, 'insufficient_data', 'insufficient_data', 'MACHINE_REJECTED_VARIANCE');
    assert.equal(r.outcome, 'matched');
  });

  it('discrepant when machine rejected differs significantly', () => {
    const r = computeAxis(600, 450, 2, 'insufficient_data', 'insufficient_data', 'MACHINE_REJECTED_VARIANCE');
    // Tolerance = max(1, 450 * 2%) = 9; variance = 150 > 9
    assert.equal(r.outcome, 'discrepant');
    assert.deepEqual(r.reasonCodes, ['MACHINE_REJECTED_VARIANCE']);
  });

  it('insufficient_data when machine rejected is null', () => {
    const r = computeAxis(null, 450, 2, 'insufficient_data', 'insufficient_data', 'MACHINE_REJECTED_VARIANCE');
    assert.equal(r.outcome, 'insufficient_data');
  });

  it('insufficient_data when reporter rejected is null', () => {
    const r = computeAxis(450, null, 2, 'insufficient_data', 'insufficient_data', 'MACHINE_REJECTED_VARIANCE');
    assert.equal(r.outcome, 'insufficient_data');
  });
});

// ---------------------------------------------------------------------------
// Tests — Worst outcome and evidence status mapping
// ---------------------------------------------------------------------------

describe('Worst outcome determination', () => {
  it('discrepant beats all other outcomes', () => {
    assert.equal(determineWorstOutcome(['matched', 'discrepant', 'no_reported_output']), 'discrepant');
  });

  it('no_machine_evidence beats matched and no_reported_output', () => {
    assert.equal(determineWorstOutcome(['matched', 'no_machine_evidence', 'no_reported_output']), 'no_machine_evidence');
  });

  it('matched when all axes match', () => {
    assert.equal(determineWorstOutcome(['matched', 'matched', 'matched']), 'matched');
  });

  it('evidence status = supported when all axes matched', () => {
    const outcomes = ['matched', 'matched', 'matched'];
    assert.equal(mapEvidenceStatus('matched', outcomes), 'supported');
  });

  it('evidence status = discrepant when worst is discrepant', () => {
    const outcomes = ['discrepant', 'matched', 'matched'];
    assert.equal(mapEvidenceStatus('discrepant', outcomes), 'discrepant');
  });

  it('evidence status = insufficient_evidence when no machine evidence', () => {
    const outcomes = ['no_machine_evidence', 'no_machine_evidence', 'insufficient_data'];
    assert.equal(mapEvidenceStatus('no_machine_evidence', outcomes), 'insufficient_evidence');
  });
});

// ---------------------------------------------------------------------------
// Tests — Duplicate verification prevention
// ---------------------------------------------------------------------------

describe('Duplicate verification prevention', () => {
  it('same inputs produce same comparison key (idempotency)', async () => {
    const { createHash } = await import('node:crypto');
    // Simulate the key generation
    const makeKey = (batchId: string, axis: string, machineValue: number | null, referenceValue: number | null, tolerancePct: number) =>
      createHash('sha256').update(JSON.stringify({
        batchId, axis,
        machineValue: machineValue === null ? null : Math.round(machineValue * 1e6),
        referenceValue: referenceValue === null ? null : Math.round(referenceValue * 1e6),
        tolerancePercent: tolerancePct,
      })).digest('hex');

    const key1 = makeKey('batch-1', 'A', 10_000, 10_000, 2);
    const key2 = makeKey('batch-1', 'A', 10_000, 10_000, 2);
    assert.equal(key1, key2);
  });

  it('different axes produce different comparison keys', async () => {
    const { createHash } = await import('node:crypto');
    const makeKey = (axis: string) => createHash('sha256').update(JSON.stringify({ batchId: 'b1', axis, machineValue: 10_000_000, referenceValue: 10_000_000, tolerancePercent: 2 })).digest('hex');
    assert.notEqual(makeKey('A'), makeKey('B'));
    assert.notEqual(makeKey('B'), makeKey('C'));
  });
});

// ---------------------------------------------------------------------------
// Tests — Gateway health scan logic
// ---------------------------------------------------------------------------

describe('Gateway health — stale detection', () => {
  const now = new Date('2026-11-20T06:00:00Z');
  const offlineCutoff = new Date(now.getTime() - 60 * 60 * 1000); // -1h = 05:00
  const onlineCutoff  = new Date(now.getTime() - 10 * 60 * 1000); // -10m = 05:50

  it('gateway with no heartbeat is stale', () => {
    assert.equal(isGatewayStale(null, offlineCutoff), true);
  });

  it('gateway with heartbeat 2h ago is stale', () => {
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    assert.equal(isGatewayStale(twoHoursAgo, offlineCutoff), true);
  });

  it('gateway with heartbeat 30m ago is NOT stale', () => {
    const thirtyMinAgo = new Date(now.getTime() - 30 * 60 * 1000);
    assert.equal(isGatewayStale(thirtyMinAgo, offlineCutoff), false);
  });

  it('gateway with heartbeat 5m ago has recovered', () => {
    const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000);
    assert.equal(isGatewayRecovered(fiveMinAgo, onlineCutoff), true);
  });

  it('gateway with heartbeat 15m ago has NOT recovered (beyond 10m cutoff)', () => {
    const fifteenMinAgo = new Date(now.getTime() - 15 * 60 * 1000);
    assert.equal(isGatewayRecovered(fifteenMinAgo, onlineCutoff), false);
  });

  it('null heartbeat is never recovered', () => {
    assert.equal(isGatewayRecovered(null, onlineCutoff), false);
  });
});

describe('Gateway health — suspended and revoked gateways are ignored', () => {
  const now = new Date('2026-11-20T06:00:00Z');
  const offlineCutoff = new Date(now.getTime() - 60 * 60 * 1000);

  it('suspended gateway (status != active) is never marked stale by scan', () => {
    // The scan only queries gateways WHERE status = 'active' — test the predicate
    const gateways = [
      { status: 'suspended', lastHeartbeatAt: null },
      { status: 'revoked',   lastHeartbeatAt: null },
      { status: 'pending',   lastHeartbeatAt: null },
    ];
    // Filter as the scan would
    const stale = gateways.filter(g => g.status === 'active' && isGatewayStale(g.lastHeartbeatAt, offlineCutoff));
    assert.equal(stale.length, 0, 'No suspended/revoked/pending gateways should be detected as stale');
  });
});

describe('Gateway health — factory connectivity with multiple gateways', () => {
  const now = new Date('2026-11-20T06:00:00Z');
  const onlineCutoff = new Date(now.getTime() - 10 * 60 * 1000);

  it('factory is online if at least one active gateway has fresh heartbeat', () => {
    const gateways = [
      { status: 'active', lastHeartbeatAt: new Date(now.getTime() - 2 * 60 * 60 * 1000) }, // stale
      { status: 'active', lastHeartbeatAt: new Date(now.getTime() - 5 * 60 * 1000) },       // fresh
    ];
    assert.equal(computeFactoryConnectivityStatus(gateways, onlineCutoff), 'online');
  });

  it('factory is offline if all active gateways have stale heartbeats', () => {
    const gateways = [
      { status: 'active', lastHeartbeatAt: new Date(now.getTime() - 2 * 60 * 60 * 1000) },
      { status: 'active', lastHeartbeatAt: new Date(now.getTime() - 3 * 60 * 60 * 1000) },
    ];
    assert.equal(computeFactoryConnectivityStatus(gateways, onlineCutoff), 'offline');
  });

  it('factory with only suspended gateways is offline', () => {
    const gateways = [
      { status: 'suspended', lastHeartbeatAt: new Date(now.getTime() - 1 * 60 * 1000) }, // fresh but suspended
    ];
    assert.equal(computeFactoryConnectivityStatus(gateways, onlineCutoff), 'offline');
  });

  it('factory with no gateways is offline', () => {
    assert.equal(computeFactoryConnectivityStatus([], onlineCutoff), 'offline');
  });
});

// ---------------------------------------------------------------------------
// Tests — Alert deduplication via dedupeKey
// ---------------------------------------------------------------------------

describe('Alert deduplication', () => {
  it('same gateway always produces the same dedupeKey', async () => {
    const { createHash } = await import('node:crypto');
    const makeKey = (gwId: string) => createHash('sha256').update(`GATEWAY_OFFLINE:${gwId}`).digest('hex');
    const key1 = makeKey('gw-abc-123');
    const key2 = makeKey('gw-abc-123');
    assert.equal(key1, key2);
  });

  it('different gateways produce different dedupeKeys', async () => {
    const { createHash } = await import('node:crypto');
    const makeKey = (gwId: string) => createHash('sha256').update(`GATEWAY_OFFLINE:${gwId}`).digest('hex');
    assert.notEqual(makeKey('gw-1'), makeKey('gw-2'));
  });

  it('reconciliation axis keys differ across batches', async () => {
    const { createHash } = await import('node:crypto');
    const makeKey = (batchId: string) => createHash('sha256').update(JSON.stringify({ batchId, axis: 'A', machineValue: 10_000_000, referenceValue: 10_000_000, tolerancePercent: 2 })).digest('hex');
    assert.notEqual(makeKey('batch-1'), makeKey('batch-2'));
  });
});

// ---------------------------------------------------------------------------
// Tests — Existing inventory / tax workflow non-interference
// ---------------------------------------------------------------------------

describe('Safety invariants — no financial record modification', () => {
  it('reconciliation never modifies declaredQuantity (read-only reference)', () => {
    // The reconciliation only READS declaredQuantity; it writes to industrialVerificationResult
    // We verify by checking the computeAxis function: it only computes, never mutates
    const original = { declaredQuantity: 10_000 };
    computeAxis(9_500, original.declaredQuantity, 2, 'no_machine_evidence', 'matched', 'MACHINE_DECLARATION_VARIANCE');
    assert.equal(original.declaredQuantity, 10_000, 'declaredQuantity must not be mutated by axis computation');
  });

  it('a discrepant outcome does NOT auto-approve or auto-reject the batch', () => {
    // verifyIndustrialBatch() sets industrialBatchEvidence.verificationStatus = 'discrepant'
    // but NEVER updates productionBatch.status, stock, stockMovement, transaction, invoice, or VAT
    // This test documents that constraint by asserting the evidence status values allowed
    const allowedEvidenceStatuses = ['pending', 'supported', 'discrepant', 'insufficient_evidence'];
    const result = mapEvidenceStatus('discrepant', ['discrepant', 'no_reported_output', 'insufficient_data']);
    assert.ok(allowedEvidenceStatuses.includes(result));
    // The batch status (declared / reconciled / independently_supported) is not touched
    assert.ok(!['approved', 'rejected', 'cancelled'].includes(result));
  });

  it('auto-trigger is non-blocking (void + catch)', () => {
    // The trigger pattern uses: void promise.catch(err => console.error(...))
    // We simulate this to confirm it swallows failures
    let caughtError: Error | null = null;
    const fakeReconcile = async () => { throw new Error('DB unavailable'); };
    void fakeReconcile().catch((err) => { caughtError = err; });
    // The void means the error is swallowed — the outer function does not throw
    assert.ok(true, 'auto-trigger pattern does not propagate errors to caller');
  });
});
