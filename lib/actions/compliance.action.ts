'use server';

import { eq, desc, sql, and } from 'drizzle-orm';
import db from '@/db/drizzle';
import { auditLog, vatRecord, taxPayment, user } from '@/db/schema';
import { requireTraderSession, requireRRASession } from '@/lib/auth-guard';
import { logAudit } from '@/lib/audit';
import { createNotification } from '@/lib/actions/notification.action';
import { getSystemConfig } from '@/lib/actions/system-config.action';
import { taxPaymentSubmissionSchema } from '@/lib/validation/tax-payment.schema';

const CRITICAL_THRESHOLD = 0.8; // 80% — also notify RRA admins

// ---------------------------------------------------------------------------
// Tax Compliance Status — the core compliance check
// ---------------------------------------------------------------------------

/**
 * Calculate a trader's tax compliance percentage.
 * Formula: totalPaid / netOwed * 100
 * A trader is compliant if they've paid >= 95% of their net VAT due.
 */
export async function getTaxComplianceStatus(userId?: string) {
  const session = await requireTraderSession();
  const targetId = userId ?? session.user.id;

  // 1. Get net VAT owed (output - input)
  const vatResult = await db
    .select({
      vatType: vatRecord.vatType,
      total: sql<number>`COALESCE(SUM(${vatRecord.amount}), 0)::float8`.as('total'),
    })
    .from(vatRecord)
    .where(and(eq(vatRecord.businessId, targetId), eq(vatRecord.isFrozen, false)))
    .groupBy(vatRecord.vatType);

  const vatOutput = Number(vatResult.find((r) => r.vatType === 'output')?.total) || 0;
  const vatInput = Number(vatResult.find((r) => r.vatType === 'input')?.total) || 0;
  const netOwed = Math.max(0, vatOutput - vatInput);

  // 2. Get total confirmed payments
  const [paymentResult] = await db
    .select({
      totalPaid: sql<number>`COALESCE(SUM(${taxPayment.amount}), 0)::float8`.as('total_paid'),
    })
    .from(taxPayment)
    .where(sql`${taxPayment.businessId} = ${targetId} AND ${taxPayment.status} = 'confirmed'`);

  const totalPaid = Number(paymentResult?.totalPaid) || 0;

  // 3. Calculate compliance percentage
  // If nothing is owed, the trader is 100% compliant
  const config = await getSystemConfig();
  const compliancePct = netOwed === 0 ? 100 : Math.min(100, (totalPaid / netOwed) * 100);
  const isCompliant = compliancePct >= config.complianceThreshold * 100;

  return {
    vatOutput,
    vatInput,
    netOwed,
    totalPaid,
    outstanding: Math.max(0, netOwed - totalPaid),
    compliancePct: Math.round(compliancePct * 10) / 10, // 1 decimal
    isCompliant,
    threshold: config.complianceThreshold * 100,
  };
}

// ---------------------------------------------------------------------------
// Record Tax Payment
// ---------------------------------------------------------------------------

export async function recordTaxPayment(data: {
  amount: number;
  method: 'mobile_money' | 'bank_transfer' | 'cash';
  reference?: string;
}, idempotencyKey: string) {
  const session = await requireTraderSession();
  const parsed = taxPaymentSubmissionSchema.safeParse({ ...data, idempotencyKey });
  if (!parsed.success) {
    throw new Error('Payment details are invalid. Please review them and try again.');
  }
  const paymentInput = parsed.data;

  const [existingPayment] = await db
    .select()
    .from(taxPayment)
    .where(and(eq(taxPayment.businessId, session.user.id), eq(taxPayment.idempotencyKey, paymentInput.idempotencyKey)))
    .limit(1);
  if (existingPayment) {
    if (
      existingPayment.amount !== paymentInput.amount ||
      existingPayment.method !== paymentInput.method ||
      existingPayment.reference !== (paymentInput.reference || null)
    ) {
      throw new Error('This payment request key was already used for different payment details.');
    }
    return existingPayment;
  }

  // ── Re-compute outstanding from DB (never trust client) ────────────
  const vatResult = await db
    .select({
      vatType: vatRecord.vatType,
      total: sql<number>`COALESCE(SUM(${vatRecord.amount}), 0)::float8`.as('total'),
    })
    .from(vatRecord)
    .where(and(eq(vatRecord.businessId, session.user.id), eq(vatRecord.isFrozen, false)))
    .groupBy(vatRecord.vatType);

  const vatOutput = Number(vatResult.find((r) => r.vatType === 'output')?.total) || 0;
  const vatInput = Number(vatResult.find((r) => r.vatType === 'input')?.total) || 0;
  const netOwed = Math.max(0, vatOutput - vatInput);

  const [paymentResult] = await db
    .select({
      totalPaid: sql<number>`COALESCE(SUM(${taxPayment.amount}), 0)::float8`.as('total_paid'),
    })
    .from(taxPayment)
    .where(sql`${taxPayment.businessId} = ${session.user.id} AND ${taxPayment.status} = 'confirmed'`);

  const totalPaid = Number(paymentResult?.totalPaid) || 0;
  const outstanding = Math.max(0, netOwed - totalPaid);

  // ── Validate ───────────────────────────────────────────────────────
  if (outstanding <= 0) {
    throw new Error('No tax is currently outstanding. Payment not allowed.');
  }

  if (paymentInput.amount > outstanding) {
    throw new Error(
      `Payment amount (${paymentInput.amount.toLocaleString()} RWF) exceeds outstanding balance of ${outstanding.toLocaleString()} RWF.`,
    );
  }

  // ── Insert payment ─────────────────────────────────────────────────
  const payment = await db.transaction(async (tx) => {
    const [createdPayment] = await tx
      .insert(taxPayment)
      .values({
        businessId: session.user.id,
        amount: paymentInput.amount,
        method: paymentInput.method,
        reference: paymentInput.reference || null,
        idempotencyKey: paymentInput.idempotencyKey,
        status: 'pending',
      })
      .onConflictDoNothing({ target: [taxPayment.businessId, taxPayment.idempotencyKey] })
      .returning();

    if (!createdPayment) {
      const [retryPayment] = await tx
        .select()
        .from(taxPayment)
        .where(and(eq(taxPayment.businessId, session.user.id), eq(taxPayment.idempotencyKey, paymentInput.idempotencyKey)))
        .limit(1);
      if (!retryPayment) throw new Error('Payment retry could not be reconciled. Please contact support.');
      if (
        retryPayment.amount !== paymentInput.amount ||
        retryPayment.method !== paymentInput.method ||
        retryPayment.reference !== (paymentInput.reference || null)
      ) {
        throw new Error('This payment request key was already used for different payment details.');
      }
      return retryPayment;
    }

    await tx.insert(auditLog).values({
      userId: session.user.id,
      action: 'TAX_PAYMENT_SUBMITTED',
      targetType: 'tax_payment',
      targetId: createdPayment.id,
      metadata: JSON.stringify({
        amount: paymentInput.amount,
        method: paymentInput.method,
        reference: paymentInput.reference,
        outstandingAtSubmission: outstanding,
      }),
    });

    return createdPayment;
  });

  return payment;
}

// ---------------------------------------------------------------------------
// Get Payment History
// ---------------------------------------------------------------------------

export async function getTaxPayments() {
  const session = await requireTraderSession();

  return db
    .select()
    .from(taxPayment)
    .where(eq(taxPayment.businessId, session.user.id))
    .orderBy(desc(taxPayment.createdAt));
}

// ---------------------------------------------------------------------------
// Compliance Alert — auto-detect and notify non-compliant traders
// ---------------------------------------------------------------------------

/**
 * Check a trader's compliance and create notifications if below threshold.
 * Called after confirmTransaction, createRetailSale, and recordTaxPayment.
 *
 * - Below 95%: notify the trader
 * - Below 80%: also notify all RRA admin users
 * - Below auto_suspension_threshold (50%): auto-suspend trader
 */
export async function checkAndAlertCompliance(traderId: string) {
  try {
    // Calculate compliance without auth guard (called from server actions)
    const vatResult = await db
      .select({
        vatType: vatRecord.vatType,
        total: sql<number>`COALESCE(SUM(${vatRecord.amount}), 0)::float8`.as('total'),
      })
      .from(vatRecord)
      .where(and(eq(vatRecord.businessId, traderId), eq(vatRecord.isFrozen, false)))
      .groupBy(vatRecord.vatType);

    const vatOutput = Number(vatResult.find((r) => r.vatType === 'output')?.total) || 0;
    const vatInput = Number(vatResult.find((r) => r.vatType === 'input')?.total) || 0;
    const netOwed = Math.max(0, vatOutput - vatInput);

    if (netOwed === 0) return; // No tax owed, nothing to check

    const [paymentResult] = await db
      .select({
        totalPaid: sql<number>`COALESCE(SUM(${taxPayment.amount}), 0)::float8`.as('total_paid'),
      })
      .from(taxPayment)
      .where(sql`${taxPayment.businessId} = ${traderId} AND ${taxPayment.status} = 'confirmed'`);

    const totalPaid = Number(paymentResult?.totalPaid) || 0;
    const compliancePct = Math.min(100, (totalPaid / netOwed) * 100);
    const outstanding = Math.max(0, netOwed - totalPaid);

    // Read dynamic thresholds
    const config = await getSystemConfig();

    // Get the trader info (needed for multiple branches below)
    const [trader] = await db
      .select({
        businessName: user.businessName,
        name: user.name,
        clearanceStatus: user.clearanceStatus,
      })
      .from(user)
      .where(eq(user.id, traderId))
      .limit(1);

    const traderName = trader?.businessName || trader?.name || 'Unknown';

    // ── Auto-suspend if below suspension threshold ──────────────────
    if (compliancePct < config.autoSuspensionThreshold * 100) {
      // Only suspend if not already suspended
      if (trader && trader.clearanceStatus !== 'suspended') {
        await db.update(user).set({ clearanceStatus: 'suspended' }).where(eq(user.id, traderId));

        await logAudit({
          userId: traderId,
          action: 'AUTO_SUSPENDED',
          targetType: 'user',
          targetId: traderId,
          metadata: {
            compliancePct: Math.round(compliancePct),
            outstanding,
            threshold: config.autoSuspensionThreshold * 100,
            reason: 'Compliance below auto-suspension threshold',
          },
        });

        // Notify the trader
        await createNotification({
          userId: traderId,
          type: 'compliance_alert',
          title: 'Account Suspended — Non-Compliance',
          message: `Your account has been automatically suspended. Tax compliance is at ${Math.round(compliancePct)}% (minimum: ${config.autoSuspensionThreshold * 100}%). Outstanding: ${outstanding.toLocaleString()} RWF. Pay your outstanding balance to restore trading.`,
          link: '/dashboard/payments',
        });

        // Notify all RRA staff
        const rraUsers = await db.select({ id: user.id }).from(user).where(eq(user.role, 'rra_staff'));

        for (const rraUser of rraUsers) {
          await createNotification({
            userId: rraUser.id,
            type: 'compliance_alert',
            title: 'Trader Auto-Suspended',
            message: `"${traderName}" has been auto-suspended. Compliance: ${Math.round(compliancePct)}%. Outstanding: ${outstanding.toLocaleString()} RWF.`,
            link: '/admin/traders',
          });
        }
      }
    }

    // ── Below compliance threshold — notify trader ──────────────────
    if (compliancePct < config.complianceThreshold * 100) {
      await createNotification({
        userId: traderId,
        type: 'compliance_alert',
        title: 'Tax Compliance Warning',
        message: `Your tax compliance is at ${Math.round(compliancePct)}% (minimum: 95%). Outstanding balance: ${outstanding.toLocaleString()} RWF. Pay now to avoid trade restrictions.`,
        link: '/dashboard/payments',
      });
    }

    // ── Below 80% — also alert RRA admins ───────────────────────────
    if (compliancePct < CRITICAL_THRESHOLD * 100) {
      const rraUsers = await db.select({ id: user.id }).from(user).where(eq(user.role, 'rra_staff'));

      for (const rraUser of rraUsers) {
        await createNotification({
          userId: rraUser.id,
          type: 'compliance_alert',
          title: 'Critical Compliance Alert',
          message: `Trader "${traderName}" is at ${Math.round(compliancePct)}% tax compliance (critical threshold: 80%). Outstanding: ${outstanding.toLocaleString()} RWF.`,
          link: `/admin/traders`,
        });
      }
    }
  } catch (error) {
    // Compliance check should never break the main flow
    console.error('[Compliance] Alert check failed for trader:', traderId, error);
  }
}

// ---------------------------------------------------------------------------
// System-wide Compliance Check (Admin only)
// ---------------------------------------------------------------------------

/**
 * Iterate all traders, check compliance for each, and create alerts.
 * Returns a summary of the check.
 */
export async function runSystemComplianceCheck() {
  await requireRRASession('compliance_officer', 'audit_officer');

  const traders = await db
    .select({ id: user.id, businessName: user.businessName, name: user.name })
    .from(user)
    .where(sql`${user.role} IN ('manufacturer', 'wholesaler', 'retailer')`);

  let compliant = 0;
  let nonCompliant = 0;
  let suspended = 0;
  let alerts = 0;

  const complianceConfig = await getSystemConfig();

  for (const trader of traders) {
    try {
      // Delegate to checkAndAlertCompliance — includes auto-suspension logic
      await checkAndAlertCompliance(trader.id);

      // Re-read compliance to classify result for the summary
      const vatResult = await db
        .select({
          vatType: vatRecord.vatType,
          total: sql<number>`COALESCE(SUM(${vatRecord.amount}), 0)::float8`.as('total'),
        })
        .from(vatRecord)
        .where(and(eq(vatRecord.businessId, trader.id), eq(vatRecord.isFrozen, false)))
        .groupBy(vatRecord.vatType);

      const vatOutput = Number(vatResult.find((r) => r.vatType === 'output')?.total) || 0;
      const vatInput = Number(vatResult.find((r) => r.vatType === 'input')?.total) || 0;
      const netOwed = Math.max(0, vatOutput - vatInput);

      if (netOwed === 0) {
        compliant++;
        continue;
      }

      const [paymentResult] = await db
        .select({
          totalPaid: sql<number>`COALESCE(SUM(${taxPayment.amount}), 0)::float8`.as('total_paid'),
        })
        .from(taxPayment)
        .where(sql`${taxPayment.businessId} = ${trader.id} AND ${taxPayment.status} = 'confirmed'`);

      const totalPaid = Number(paymentResult?.totalPaid) || 0;
      const compliancePct = Math.min(100, (totalPaid / netOwed) * 100);

      if (compliancePct < complianceConfig.autoSuspensionThreshold * 100) {
        suspended++;
        nonCompliant++;
        alerts++;
      } else if (compliancePct < complianceConfig.complianceThreshold * 100) {
        nonCompliant++;
        alerts++;
      } else {
        compliant++;
      }
    } catch {
      // Skip individual trader errors
    }
  }

  return {
    totalChecked: traders.length,
    compliant,
    nonCompliant,
    suspended,
    alerts,
  };
}
