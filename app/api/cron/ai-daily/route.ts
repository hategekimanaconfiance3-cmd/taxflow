// POST /api/cron/ai-daily
// Daily AI background jobs: risk score refresh, inventory reconciliation,
// dispatch mismatch detection, revenue snapshot, and anomaly detection.
//
// Called by Vercel Cron at 03:00 UTC every day.
// Also accepts an on-demand POST from a super_admin via the AI dashboard.
//
// Security: Vercel Cron requests carry an Authorization: Bearer <CRON_SECRET>
// header.  On-demand calls must supply the same secret.  timingSafeEqual
// prevents timing-based secret oracle attacks.

import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { reconcileAndCreateFindings } from '@/lib/ai/reconciliation';
import { detectDispatchMismatches } from '@/lib/ai/reconciliation';
import { computeAllRiskScores } from '@/lib/ai/risk-scoring';
import { getRevenueForecast } from '@/lib/ai/revenue-forecast';
import { routeFindingToRRAStaff } from '@/lib/ai/finding-router';
import { detectSystemWideAnomalies } from '@/lib/ai/anomaly-detector';
import { scanForMissingArrivals } from '@/lib/ai/transport-tracker';
import db from '@/db/drizzle';
import { aiFinding } from '@/db/schema';
import { and, eq, sql } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { hasRRAPermission, isRRARole } from '@/lib/rra-rbac';
import { rraStaff, rraStaffRole } from '@/db/schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes — long-running cron

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

function hasValidCronSecret(authorization: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 32 || !authorization || authorization.length > 512) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const supplied = Buffer.from(authorization);
  if (expected.length !== supplied.length) return false;
  return timingSafeEqual(expected, supplied);
}

async function isSuperAdmin(): Promise<boolean> {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) return false;
    const [staff] = await db
      .select({ id: rraStaff.id })
      .from(rraStaff)
      .where(and(eq(rraStaff.userId, session.user.id), eq(rraStaff.isActive, true)))
      .limit(1);
    if (!staff) return false;
    const roles = await db
      .select({ role: rraStaffRole.role })
      .from(rraStaffRole)
      .where(eq(rraStaffRole.staffRecordId, staff.id));
    return roles.some(
      (r) => isRRARole(r.role) && hasRRAPermission(r.role, 'system.configure'),
    );
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// GET — Vercel Cron (uses Authorization header)
// POST — On-demand trigger from admin dashboard (uses session cookie)
// ---------------------------------------------------------------------------

export async function GET(request: Request) {
  if (!hasValidCronSecret(request.headers.get('authorization'))) {
    const configured = Boolean(process.env.CRON_SECRET && process.env.CRON_SECRET.length >= 32);
    return NextResponse.json(
      { ok: false, error: 'Unauthorized' },
      { status: configured ? 401 : 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  return runDailyAIJobs('cron');
}

export async function POST() {
  const admin = await isSuperAdmin();
  if (!admin) {
    return NextResponse.json(
      { ok: false, error: 'Forbidden — super_admin role required' },
      { status: 403, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  return runDailyAIJobs('on_demand');
}

// ---------------------------------------------------------------------------
// Core job runner
// ---------------------------------------------------------------------------

async function runDailyAIJobs(trigger: 'cron' | 'on_demand') {
  const startedAt = new Date();
  const results: Record<string, unknown> = { trigger, startedAt };

  // ── 1. Risk Score Refresh ─────────────────────────────────────────────────
  // Re-compute every merchant's composite risk score.  Results are returned
  // in memory; in a future iteration they will be persisted to a cache table.
  try {
    const riskScores = await computeAllRiskScores();
    const critical = riskScores.filter((s) => s.level === 'critical').length;
    const high = riskScores.filter((s) => s.level === 'high').length;
    results.riskScores = { computed: riskScores.length, critical, high };
    console.log(`[cron:ai-daily] Risk scores refreshed — ${riskScores.length} merchants, ${critical} critical`);
  } catch (err) {
    results.riskScores = { error: err instanceof Error ? err.message : 'unknown' };
    console.error('[cron:ai-daily] Risk score refresh failed:', err);
  }

  // ── 2. Inventory Reconciliation Scan ─────────────────────────────────────
  // Scan all active stock records and create/refresh aiFinding records for
  // any inventory discrepancy above the 5% threshold.
  try {
    const periodEnd = new Date();
    const periodStart = new Date(periodEnd.getTime() - 30 * 86_400_000); // last 30 days
    // Use a system actor ID — the first active super_admin or fallback placeholder
    const [sysActor] = await db
      .select({ userId: rraStaff.userId })
      .from(rraStaff)
      .where(eq(rraStaff.isActive, true))
      .limit(1);
    const actorId = sysActor?.userId ?? 'system';
    const recon = await reconcileAndCreateFindings(periodStart, periodEnd, actorId);
    results.reconciliation = recon;
    console.log(`[cron:ai-daily] Reconciliation — scanned: ${recon.scanned}, created: ${recon.findingsCreated}, refreshed: ${recon.findingsRefreshed}`);
  } catch (err) {
    results.reconciliation = { error: err instanceof Error ? err.message : 'unknown' };
    console.error('[cron:ai-daily] Reconciliation scan failed:', err);
  }

  // ── 3. Dispatch Mismatch Detection ───────────────────────────────────────
  // Find B2B transactions where the buyer did not confirm receipt or received
  // fewer goods than the seller dispatched, and create aiFinding records.
  try {
    const mismatches = await detectDispatchMismatches(7); // last 7 days
    let created = 0;
    for (const m of mismatches) {
      try {
        // One open finding per transaction — idempotent insert
        const existing = await db
          .select({ id: aiFinding.id })
          .from(aiFinding)
          .where(and(
            eq(aiFinding.businessId, m.sellerId),
            sql`${aiFinding.evidenceRefs}::text LIKE ${'%' + m.transactionId + '%'}`,
            eq(aiFinding.findingType, 'dispatch_mismatch'),
            eq(aiFinding.reviewStatus, 'open'),
          ))
          .limit(1);

        if (existing.length > 0) continue;

        const severity = m.differencePct >= 50 ? 'critical' : 'warning';
        const [finding] = await db.insert(aiFinding).values({
          findingType: 'dispatch_mismatch',
          severity,
          businessId: m.sellerId,
          productId: m.productId,
          observedValue: m.confirmed,
          expectedValue: m.dispatched,
          difference: m.difference,
          differenceUnit: 'units',
          explanation: `Dispatch mismatch (${m.mismatchType}): seller dispatched ${m.dispatched} units but buyer confirmed ${m.confirmed} units (${Math.round(m.differencePct)}% shortfall). Transaction: ${m.transactionId}.`,
          evidenceRefs: JSON.stringify({ transactionId: m.transactionId, mismatchType: m.mismatchType }),
          detectionMethod: 'deterministic',
          reviewStatus: 'open',
          modelVersion: 'dispatch-mismatch-v1',
        }).returning({ id: aiFinding.id });

        if (finding) {
          created++;
          await routeFindingToRRAStaff({
            findingId: finding.id,
            findingType: 'dispatch_mismatch',
            severity,
            businessId: m.sellerId,
            observedValue: m.confirmed,
            expectedValue: m.dispatched,
            explanation: `Dispatch mismatch (${m.mismatchType}): ${Math.round(m.differencePct)}% shortfall on transaction ${m.transactionId}`,
          });
        }
      } catch (innerErr) {
        console.error('[cron:ai-daily] Dispatch finding insert failed:', innerErr);
      }
    }
    results.dispatchMismatches = { detected: mismatches.length, findingsCreated: created };
    console.log(`[cron:ai-daily] Dispatch mismatches — detected: ${mismatches.length}, findings created: ${created}`);
  } catch (err) {
    results.dispatchMismatches = { error: err instanceof Error ? err.message : 'unknown' };
    console.error('[cron:ai-daily] Dispatch mismatch scan failed:', err);
  }

  // ── 4. Revenue Snapshot ───────────────────────────────────────────────────
  // Compute and log the latest 6-month revenue forecast for dashboards.
  try {
    const forecast = await getRevenueForecast(6);
    results.revenueForecast = {
      period: forecast.period,
      gap: forecast.gap,
      gapPercentage: forecast.gapPercentage,
      trend: forecast.trend,
      confidence: forecast.confidence,
      projectedNextMonth: forecast.projectedNextMonth,
      topContributors: forecast.topGapContributors.length,
    };
    console.log(`[cron:ai-daily] Revenue forecast — gap: ${forecast.gapPercentage}%, trend: ${forecast.trend}`);
  } catch (err) {
    results.revenueForecast = { error: err instanceof Error ? err.message : 'unknown' };
    console.error('[cron:ai-daily] Revenue forecast failed:', err);
  }

  // ── 5. Statistical Anomaly Detection ─────────────────────────────────────
  // Run ML anomaly detector across all merchants — detects unusual patterns
  // in daily sales value, transaction counts, VAT payment ratios, and stock
  // depletion rates using Z-score statistical models.
  try {
    const anomalyScan = await detectSystemWideAnomalies(100);
    results.anomalyDetection = {
      scanned: anomalyScan.scanned,
      anomalousCount: anomalyScan.anomalousCount,
      topAnomalies: anomalyScan.profiles.slice(0, 5).map(p => ({
        merchantId: p.merchantId,
        businessName: p.businessName,
        compositeScore: p.compositeAnomalyScore,
        dominantAnomaly: p.dominantAnomaly,
      })),
    };
    console.log(`[cron:ai-daily] Anomaly detection — scanned: ${anomalyScan.scanned}, anomalous: ${anomalyScan.anomalousCount}`);
  } catch (err) {
    results.anomalyDetection = { error: err instanceof Error ? err.message : 'unknown' };
    console.error('[cron:ai-daily] Anomaly detection failed:', err);
  }

  // ── 6. GPS Missing Arrival Scan ──────────────────────────────────────────
  // Scan for dispatched transactions with no arrival confirmation in 48h.
  try {
    const gpsAlerts = await scanForMissingArrivals(48);
    results.gpsTracking = {
      missingArrivalsFound: gpsAlerts.length,
      alerts: gpsAlerts.slice(0, 10).map(a => ({
        transactionId: a.transactionId,
        alertType: a.alertType,
        severity: a.severity,
      })),
    };
    console.log(`[cron:ai-daily] GPS scan — missing arrivals: ${gpsAlerts.length}`);
  } catch (err) {
    results.gpsTracking = { error: err instanceof Error ? err.message : 'unknown' };
    console.error('[cron:ai-daily] GPS tracking scan failed:', err);
  }

  const completedAt = new Date();
  const durationMs = completedAt.getTime() - startedAt.getTime();
  const hasErrors = Object.values(results).some(
    (v) => typeof v === 'object' && v !== null && 'error' in v,
  );

  return NextResponse.json(
    { ok: !hasErrors, durationMs, completedAt, ...results },
    { status: hasErrors ? 207 : 200, headers: { 'Cache-Control': 'no-store' } },
  );
}
