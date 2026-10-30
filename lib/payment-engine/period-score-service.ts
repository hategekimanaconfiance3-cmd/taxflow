import { and, eq, inArray, sql } from 'drizzle-orm';
import db from '@/db/drizzle';
import { taxObligation, taxObligationAdjustment, taxPayment, taxPeriodPaymentScoreSnapshot } from '@/db/schema';
import { calculatePeriodPaymentScore } from '@/lib/payment-engine/domain';
import { amountToMinorUnits, minorUnitsToAmount } from '@/lib/payment-engine/money';

export type PaymentScoreTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export function obligationAdjustmentDelta(kind: string, amount: string): bigint {
  const value = amountToMinorUnits(amount);
  if (kind === 'INCREASE') return value;
  if (kind === 'DECREASE' || kind === 'CREDIT' || kind === 'EXEMPTION') return -value;
  throw new Error('Unknown approved obligation adjustment kind.');
}

export async function capturePaymentScoreSnapshot(
  tx: PaymentScoreTransaction,
  taxpayerId: string,
  taxType: string,
  periodKey: string,
  currency: string,
): Promise<void> {
  if (currency !== 'RWF') {
    await tx.insert(taxPeriodPaymentScoreSnapshot).values({
      taxpayerId, taxType, periodKey, currency, state: 'INSUFFICIENT_DATA',
      netObligation: null, confirmedPayments: null, outstandingAmount: null, score: null,
      explanation: { reason: 'Payment records currently support RWF only; a cross-currency payment total cannot be calculated.' },
    });
    return;
  }

  const obligations = await tx.select({ id: taxObligation.id, originalAmount: taxObligation.originalAmount })
    .from(taxObligation)
    .where(and(
      eq(taxObligation.taxpayerId, taxpayerId),
      eq(taxObligation.taxType, taxType),
      eq(taxObligation.periodKey, periodKey),
      eq(taxObligation.currency, currency),
      inArray(taxObligation.status, ['PAYABLE', 'PAID', 'CLOSED_ZERO_BALANCE']),
      sql`${taxObligation.approvedBy} IS NOT NULL`,
    ));

  if (obligations.length === 0) {
    await tx.insert(taxPeriodPaymentScoreSnapshot).values({
      taxpayerId, taxType, periodKey, currency, state: 'INSUFFICIENT_DATA',
      netObligation: null, confirmedPayments: null, outstandingAmount: null, score: null,
      explanation: { reason: 'No finalized, approved obligation exists for this period and tax type.' },
    });
    return;
  }

  const obligationIds = obligations.map((row) => row.id);
  const adjustments = await tx.select({ kind: taxObligationAdjustment.kind, amount: taxObligationAdjustment.amount })
    .from(taxObligationAdjustment)
    .where(and(inArray(taxObligationAdjustment.obligationId, obligationIds), eq(taxObligationAdjustment.status, 'APPROVED')));
  const paidRows = await tx.select({ total: sql<string>`COALESCE(SUM(${taxPayment.amount}),0)::text`.as('total') })
    .from(taxPayment)
    .where(and(
      inArray(taxPayment.obligationId, obligationIds),
      eq(taxPayment.currency, currency),
      eq(taxPayment.status, 'confirmed'),
      eq(taxPayment.workflowStatus, 'PAID'),
    ));

  let netMinor = obligations.reduce((sum, row) => sum + amountToMinorUnits(row.originalAmount), BigInt(0));
  for (const adjustment of adjustments) netMinor += obligationAdjustmentDelta(adjustment.kind, adjustment.amount);
  const paidMinor = BigInt(paidRows[0]?.total ?? '0') * BigInt(100);
  const calculation = netMinor < BigInt(0)
    ? { state: 'INSUFFICIENT_DATA' as const, score: null, reason: 'Approved adjustments exceed the original assessment.' }
    : calculatePeriodPaymentScore(minorUnitsToAmount(netMinor), minorUnitsToAmount(paidMinor));

  await tx.insert(taxPeriodPaymentScoreSnapshot).values({
    taxpayerId, taxType, periodKey, currency,
    state: calculation.state,
    netObligation: calculation.state === 'INSUFFICIENT_DATA' ? null : calculation.netObligation,
    confirmedPayments: calculation.state === 'INSUFFICIENT_DATA' ? null : calculation.confirmedPayments,
    outstandingAmount: calculation.state === 'INSUFFICIENT_DATA' ? null : calculation.outstandingAmount,
    score: calculation.state === 'AVAILABLE' ? calculation.score.toFixed(4) : null,
    explanation: calculation.state === 'INSUFFICIENT_DATA'
      ? { reason: calculation.reason }
      : {
        formula: '(confirmed eligible payments / net approved obligations) × 100',
        includedObligationIds: obligationIds,
        includedPaymentStates: ['status=confirmed', 'workflowStatus=PAID'],
        excludedStatuses: ['pending', 'failed', 'expired', 'reversed', 'review-required'],
        calculationTimestamp: new Date().toISOString(),
      },
  });
}
