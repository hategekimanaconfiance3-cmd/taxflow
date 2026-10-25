'use server';

import { eq, desc, sql, and } from 'drizzle-orm';
import db from '@/db/drizzle';
import { auditLog, vatRecord, taxPayment, user } from '@/db/schema';
import { requireTraderSession, requireRRASession, requireRRAOperationalPermission } from '@/lib/auth-guard';
import { createNotification } from '@/lib/notifications';
import { getSystemConfig } from '@/lib/actions/system-config.action';
import { taxPaymentSubmissionSchema } from '@/lib/validation/tax-payment.schema';
import { getBusinessComplianceStatus } from '@/lib/compliance-status';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';

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
  if (targetId !== session.user.id) {
    throw new Error('You can only view tax compliance for your own business.');
  }
  return getBusinessComplianceStatus(targetId);
}

// ---------------------------------------------------------------------------
// Record Tax Payment
// ---------------------------------------------------------------------------

export async function recordTaxPayment(data: {
  amount: number;
  method: 'mobile_money' | 'bank_transfer' | 'cash';
  reference?: string;
}, idempotencyKey: string): Promise<typeof taxPayment.$inferSelect> {
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
      beforeState: { status: null },
      afterState: {
        status: createdPayment.status,
        amount: createdPayment.amount,
        method: createdPayment.method,
        reference: createdPayment.reference,
      },
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
// RRA payment verification queue
// ---------------------------------------------------------------------------

/** List unverified submissions for authorized compliance/audit staff only. */
export async function getPendingTaxPaymentsForReview() {
  await requireRRASession('compliance_officer', 'audit_officer', 'payments_reconciliation_officer');

  return db
    .select({
      id: taxPayment.id,
      businessId: taxPayment.businessId,
      businessName: user.businessName,
      traderName: user.name,
      tinNumber: user.tinNumber,
      amount: taxPayment.amount,
      method: taxPayment.method,
      reference: taxPayment.reference,
      status: taxPayment.status,
      createdAt: taxPayment.createdAt,
    })
    .from(taxPayment)
    .innerJoin(user, eq(taxPayment.businessId, user.id))
    .where(eq(taxPayment.status, 'pending'))
    .orderBy(desc(taxPayment.createdAt))
    .limit(100);
}

/**
 * Confirm a payment only after an authorized officer independently checks the
 * bank/provider/cash evidence. The evidence reference and reviewer are audited.
 */
export async function verifyTaxPayment(input: {
  paymentId: string;
  evidenceReference: string;
}) {
  const session = await requireRRAOperationalPermission("payments.reconcile");
  const paymentId = input.paymentId.trim();
  const evidenceReference = input.evidenceReference.trim();

  if (!paymentId || evidenceReference.length < 5 || evidenceReference.length > 120) {
    throw new Error('A valid payment and evidence reference (5–120 characters) are required.');
  }

  const verifiedPayment = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(taxPayment)
      .where(eq(taxPayment.id, paymentId))
      .for('update')
      .limit(1);

    if (!existing) throw new Error('Payment submission not found.');
    if (existing.status !== 'pending') throw new Error('Only pending payment submissions can be verified.');

    const [lockedTrader] = await tx
      .select({ id: user.id })
      .from(user)
      .where(eq(user.id, existing.businessId))
      .for('update')
      .limit(1);
    if (!lockedTrader) throw new Error('Taxpayer account was not found.');

    const vatTotals = await tx
      .select({
        vatType: vatRecord.vatType,
        total: sql<number>`COALESCE(SUM(${vatRecord.amount}), 0)::float8`.as('total'),
      })
      .from(vatRecord)
      .where(and(eq(vatRecord.businessId, existing.businessId), eq(vatRecord.isFrozen, false)))
      .groupBy(vatRecord.vatType);
    const outputVat = Number(vatTotals.find((row) => row.vatType === 'output')?.total) || 0;
    const inputVat = Number(vatTotals.find((row) => row.vatType === 'input')?.total) || 0;
    const [paidRow] = await tx
      .select({ total: sql<number>`COALESCE(SUM(${taxPayment.amount}), 0)::float8`.as('total') })
      .from(taxPayment)
      .where(and(eq(taxPayment.businessId, existing.businessId), eq(taxPayment.status, 'confirmed')));
    const outstanding = Math.max(0, outputVat - inputVat - (Number(paidRow?.total) || 0));
    if (existing.amount > outstanding) {
      throw new Error("Payment exceeds the taxpayer's current outstanding balance.");
    }

    // If the trader submitted a provider reference, it must match the reviewed evidence.
    if (existing.reference && existing.reference.trim() !== evidenceReference) {
      throw new Error('The evidence reference does not match the reference submitted with this payment.');
    }

    const [updated] = await tx
      .update(taxPayment)
      .set({
        status: 'confirmed',
        reference: existing.reference ?? evidenceReference,
        updatedAt: new Date(),
      })
      .where(and(eq(taxPayment.id, existing.id), eq(taxPayment.status, 'pending')))
      .returning();

    if (!updated) throw new Error('Payment status changed before verification completed.');

    await tx.insert(auditLog).values({
      userId: session.user.id,
      action: 'TAX_PAYMENT_VERIFIED',
      targetType: 'tax_payment',
      targetId: existing.id,
      beforeState: {
        status: existing.status,
        amount: existing.amount,
        reference: existing.reference,
      },
      afterState: {
        status: updated.status,
        amount: updated.amount,
        reference: updated.reference,
      },
      metadata: JSON.stringify({
        traderId: existing.businessId,
        method: existing.method,
        evidenceReference,
        reviewerUserId: session.user.id,
        verificationMode: 'manual_authorized_review',
      }),
    });

    return updated;
  });

  return { success: true, payment: verifiedPayment };
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
 * - Below the legacy suspension threshold (50% by default): notify RRA staff
 *   that an authorized officer should review the case. This check never changes
 *   taxpayer status or initiates an enforcement action.
 */
export async function checkAndAlertCompliance(traderId: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new Error('Authentication is required.');
  if (traderId !== session.user.id) {
    await requireRRASession('compliance_officer', 'audit_officer');
  }
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
      })
      .from(user)
      .where(eq(user.id, traderId))
      .limit(1);

    const traderName = trader?.businessName || trader?.name || 'Unknown';

    // A threshold crossing is only a signal for human review. Automated
    // compliance checks must never suspend, restrict, or otherwise decide a
    // taxpayer's status.
    if (compliancePct < config.reviewRecommendationThreshold * 100) {
      const rraUsers = await db.select({ id: user.id }).from(user).where(eq(user.role, 'rra_staff'));
      for (const rraUser of rraUsers) {
        await createNotification({
          userId: rraUser.id,
          type: 'compliance_alert',
          title: 'Potential Compliance Risk — Requires Human Review',
          message: `"${traderName}" has a TaxFlow payment indicator of ${Math.round(compliancePct)}%. Recorded outstanding amount: ${outstanding.toLocaleString()} RWF. This is not a confirmed violation or official assessment; review the authorized records before deciding any action.`,
          link: '/admin/traders',
        });
      }
    }

    // ── Below compliance threshold — notify trader ──────────────────
    if (compliancePct < config.complianceThreshold * 100) {
      await createNotification({
        userId: traderId,
        type: 'compliance_alert',
        title: 'TaxFlow Payment Indicator — Review',
        message: `Your TaxFlow payment indicator is ${Math.round(compliancePct)}%. The recorded outstanding amount is ${outstanding.toLocaleString()} RWF. Please review your records or contact support if you believe this information is incorrect.`,
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
          title: 'Potential Compliance Risk — Requires Human Review',
          message: `Trader "${traderName}" has a TaxFlow payment indicator of ${Math.round(compliancePct)}%. Recorded outstanding amount: ${outstanding.toLocaleString()} RWF. This is not a confirmed violation or official assessment.`,
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

  let meetingConfiguredThreshold = 0;
  let belowConfiguredThreshold = 0;
  let reviewRecommended = 0;
  let alerts = 0;

  const complianceConfig = await getSystemConfig();

  for (const trader of traders) {
    try {
      // Delegate to checkAndAlertCompliance — this only creates notifications.
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
        meetingConfiguredThreshold++;
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

      if (compliancePct < complianceConfig.reviewRecommendationThreshold * 100) {
        reviewRecommended++;
        belowConfiguredThreshold++;
        alerts++;
      } else if (compliancePct < complianceConfig.complianceThreshold * 100) {
        belowConfiguredThreshold++;
        alerts++;
      } else {
        meetingConfiguredThreshold++;
      }
    } catch {
      // Skip individual trader errors
    }
  }

  return {
    totalChecked: traders.length,
    meetingConfiguredThreshold,
    belowConfiguredThreshold,
    reviewRecommended,
    alerts,
  };
}
