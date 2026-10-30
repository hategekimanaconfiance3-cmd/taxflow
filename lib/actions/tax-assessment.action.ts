"use server";

import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import db from '@/db/drizzle';
import {
  auditLog,
  taxObligation,
  taxObligationAdjustment,
  taxObligationEvent,
  taxPayment,
  taxPeriodPaymentScoreSnapshot,
  user,
} from '@/db/schema';
import { requireRRAPermission, requireTraderSession } from '@/lib/auth-guard';
import { amountToMinorUnits, minorUnitsToAmount } from '@/lib/payment-engine/money';
import { capturePaymentScoreSnapshot, obligationAdjustmentDelta } from '@/lib/payment-engine/period-score-service';
import {
  disputeTaxObligationSchema,
  recordOfficialTaxAssessmentSchema,
  taxObligationAdjustmentDecisionSchema,
  taxObligationAdjustmentProposalSchema,
  taxObligationIdSchema,
} from '@/lib/validation/tax-assessment.schema';

export async function recordOfficialTaxAssessment(input: unknown) {
  const session = await requireRRAPermission('tax.assessment.create');
  const parsed = recordOfficialTaxAssessmentSchema.safeParse(input);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Assessment details are invalid.');
  const data = parsed.data;
  if (data.currency === 'RWF' && !/^(?:0|[1-9]\d{0,17})$/.test(data.originalAmount)) {
    throw new Error('RWF assessment amounts must be whole units.');
  }

  return db.transaction(async (tx) => {
    const [taxpayer] = await tx.select({ id: user.id, role: user.role }).from(user)
      .where(eq(user.id, data.taxpayerId)).for('update').limit(1);
    if (!taxpayer || !['manufacturer', 'wholesaler', 'retailer'].includes(taxpayer.role)) {
      throw new Error('Assessment taxpayer was not found or is not a registered trader.');
    }

    const [created] = await tx.insert(taxObligation).values({
      taxpayerId: taxpayer.id,
      taxType: data.taxType,
      periodKey: data.periodKey,
      assessmentReference: data.assessmentReference,
      assessmentSource: 'OFFICIAL_RRA',
      assessmentDate: new Date(data.assessmentDate),
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      originalAmount: data.originalAmount,
      currency: data.currency,
      status: 'FINALIZED',
      supportingEvidenceReference: data.supportingEvidenceReference,
      sourcePayloadHash: data.sourcePayloadHash ?? null,
      createdBy: session.user.id,
      finalizedBy: session.user.id,
      finalizedAt: new Date(),
    }).returning();

    await tx.insert(taxObligationEvent).values({
      obligationId: created.id,
      eventKey: `${created.id}:official-assessment-recorded`,
      eventType: 'OFFICIAL_ASSESSMENT_RECORDED',
      fromStatus: null,
      toStatus: 'FINALIZED',
      actorUserId: session.user.id,
      details: {
        taxpayerId: taxpayer.id,
        assessmentReference: data.assessmentReference,
        assessmentSource: 'OFFICIAL_RRA',
        originalAmount: data.originalAmount,
        currency: data.currency,
        evidenceReference: data.supportingEvidenceReference,
        sourcePayloadHash: data.sourcePayloadHash ?? null,
      },
    });
    await tx.insert(auditLog).values({
      userId: session.user.id,
      action: 'TAX_OFFICIAL_ASSESSMENT_RECORDED',
      targetType: 'tax_obligation',
      targetId: created.id,
      afterState: { status: created.status, assessmentReference: created.assessmentReference, originalAmount: created.originalAmount, currency: created.currency },
      metadata: JSON.stringify({ taxpayerId: taxpayer.id, taxType: created.taxType, periodKey: created.periodKey, evidenceReference: data.supportingEvidenceReference }),
    });
    await capturePaymentScoreSnapshot(tx, taxpayer.id, created.taxType, created.periodKey, created.currency);
    return created;
  });
}

/** Independent approval is what makes an official record payable. */
export async function approveOfficialTaxAssessment(input: unknown) {
  const session = await requireRRAPermission('tax.assessment.approve');
  const parsed = taxObligationIdSchema.safeParse(input);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Assessment reference is invalid.');

  return db.transaction(async (tx) => {
    const [obligation] = await tx.select().from(taxObligation)
      .where(eq(taxObligation.id, parsed.data.obligationId)).for('update').limit(1);
    if (!obligation) throw new Error('Assessment was not found.');
    if (obligation.status !== 'FINALIZED' || obligation.assessmentSource !== 'OFFICIAL_RRA') {
      throw new Error('Only a finalized official assessment can be approved for payment.');
    }
    if (obligation.createdBy === session.user.id || obligation.finalizedBy === session.user.id) {
      throw new Error('The assessment creator cannot approve their own assessment.');
    }

    const [updated] = await tx.update(taxObligation)
      .set({ status: 'PAYABLE', approvedBy: session.user.id, approvedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(taxObligation.id, obligation.id), eq(taxObligation.status, 'FINALIZED')))
      .returning();
    if (!updated) throw new Error('Assessment status changed before approval completed.');

    await tx.insert(taxObligationEvent).values({
      obligationId: obligation.id,
      eventKey: `${obligation.id}:payable:${crypto.randomUUID()}`,
      eventType: 'OFFICIAL_ASSESSMENT_APPROVED_PAYABLE',
      fromStatus: obligation.status,
      toStatus: 'PAYABLE',
      actorUserId: session.user.id,
      details: { assessmentReference: obligation.assessmentReference, originalAmount: obligation.originalAmount, currency: obligation.currency },
    });
    await tx.insert(auditLog).values({
      userId: session.user.id,
      action: 'TAX_ASSESSMENT_APPROVED_PAYABLE',
      targetType: 'tax_obligation',
      targetId: obligation.id,
      beforeState: { status: obligation.status },
      afterState: { status: updated.status },
      metadata: JSON.stringify({ assessmentReference: obligation.assessmentReference, creatorUserId: obligation.createdBy }),
    });
    await capturePaymentScoreSnapshot(tx, updated.taxpayerId, updated.taxType, updated.periodKey, updated.currency);
    return updated;
  });
}

export async function proposeTaxObligationAdjustment(input: unknown) {
  const session = await requireRRAPermission('tax.adjustment.propose');
  const parsed = taxObligationAdjustmentProposalSchema.safeParse(input);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Adjustment details are invalid.');
  const data = parsed.data;
  const amount = amountToMinorUnits(data.amount);
  if (amount <= BigInt(0)) throw new Error('Adjustment amount must be greater than zero.');

  return db.transaction(async (tx) => {
    const [obligation] = await tx.select().from(taxObligation)
      .where(eq(taxObligation.id, data.obligationId)).for('update').limit(1);
    if (!obligation || obligation.status !== 'PAYABLE') throw new Error('Only a payable official obligation can be adjusted.');
    if (obligation.currency === 'RWF' && amount % BigInt(100) !== BigInt(0)) throw new Error('RWF adjustments must use whole units.');
    if (obligation.createdBy === session.user.id || obligation.approvedBy === session.user.id) {
      throw new Error('An assessment authorizer may not propose its adjustment.');
    }

    const [adjustment] = await tx.insert(taxObligationAdjustment).values({
      obligationId: obligation.id,
      kind: data.kind,
      amount: data.amount,
      reason: data.reason,
      evidenceReference: data.evidenceReference,
      status: 'PROPOSED',
      createdBy: session.user.id,
    }).returning();
    await tx.insert(taxObligationEvent).values({
      obligationId: obligation.id,
      eventKey: `${obligation.id}:adjustment-proposed:${adjustment.id}`,
      eventType: 'ASSESSMENT_ADJUSTMENT_PROPOSED',
      fromStatus: obligation.status,
      toStatus: obligation.status,
      actorUserId: session.user.id,
      details: { adjustmentId: adjustment.id, kind: data.kind, amount: data.amount, reason: data.reason, evidenceReference: data.evidenceReference },
    });
    await tx.insert(auditLog).values({
      userId: session.user.id,
      action: 'TAX_ASSESSMENT_ADJUSTMENT_PROPOSED',
      targetType: 'tax_obligation_adjustment',
      targetId: adjustment.id,
      afterState: { status: adjustment.status, kind: adjustment.kind, amount: adjustment.amount },
      metadata: JSON.stringify({ obligationId: obligation.id, reason: data.reason, evidenceReference: data.evidenceReference }),
    });
    return adjustment;
  });
}

export async function decideTaxObligationAdjustment(input: unknown, decision: 'APPROVED' | 'REJECTED') {
  const session = await requireRRAPermission('tax.adjustment.approve');
  if (decision !== 'APPROVED' && decision !== 'REJECTED') throw new Error('Adjustment decision is invalid.');
  const parsed = taxObligationAdjustmentDecisionSchema.safeParse(input);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Adjustment review is invalid.');

  return db.transaction(async (tx) => {
    const [adjustment] = await tx.select().from(taxObligationAdjustment)
      .where(eq(taxObligationAdjustment.id, parsed.data.adjustmentId)).for('update').limit(1);
    if (!adjustment || adjustment.status !== 'PROPOSED') throw new Error('Only a proposed adjustment can be decided.');
    if (adjustment.createdBy === session.user.id) throw new Error('The adjustment proposer cannot decide their own adjustment.');
    const [obligation] = await tx.select().from(taxObligation)
      .where(eq(taxObligation.id, adjustment.obligationId)).for('update').limit(1);
    if (!obligation || obligation.status !== 'PAYABLE') throw new Error('The obligation is not currently payable.');

    if (decision === 'APPROVED') {
      const [existingPayment] = await tx.select({ id: taxPayment.id, status: taxPayment.status }).from(taxPayment)
        .where(and(eq(taxPayment.obligationId, obligation.id), inArray(taxPayment.status, ['pending', 'confirmed']))).limit(1);
      if (existingPayment) throw new Error('An obligation with a pending or settled payment requires a separate reviewed adjustment/refund process.');
      const approved = await tx.select({ kind: taxObligationAdjustment.kind, amount: taxObligationAdjustment.amount })
        .from(taxObligationAdjustment)
        .where(and(eq(taxObligationAdjustment.obligationId, obligation.id), eq(taxObligationAdjustment.status, 'APPROVED')));
      let netMinor = amountToMinorUnits(obligation.originalAmount);
      for (const row of approved) netMinor += obligationAdjustmentDelta(row.kind, row.amount);
      netMinor += obligationAdjustmentDelta(adjustment.kind, adjustment.amount);
      if (netMinor < BigInt(0)) throw new Error('This adjustment would make the obligation negative.');
      if (obligation.currency === 'RWF' && netMinor % BigInt(100) !== BigInt(0)) throw new Error('The adjustment would create a fractional-RWF obligation.');
    }

    const [updatedAdjustment] = await tx.update(taxObligationAdjustment)
      .set({ status: decision, approvedBy: session.user.id, approvedAt: new Date() })
      .where(and(eq(taxObligationAdjustment.id, adjustment.id), eq(taxObligationAdjustment.status, 'PROPOSED')))
      .returning();
    if (!updatedAdjustment) throw new Error('Adjustment state changed before review completed.');

    let updatedObligation = obligation;
    if (decision === 'APPROVED') {
      const approved = await tx.select({ kind: taxObligationAdjustment.kind, amount: taxObligationAdjustment.amount })
        .from(taxObligationAdjustment)
        .where(and(eq(taxObligationAdjustment.obligationId, obligation.id), eq(taxObligationAdjustment.status, 'APPROVED')));
      let netMinor = amountToMinorUnits(obligation.originalAmount);
      for (const row of approved) netMinor += obligationAdjustmentDelta(row.kind, row.amount);
      if (netMinor === BigInt(0)) {
        const [closed] = await tx.update(taxObligation).set({ status: 'CLOSED_ZERO_BALANCE', updatedAt: new Date() })
          .where(and(eq(taxObligation.id, obligation.id), eq(taxObligation.status, 'PAYABLE'))).returning();
        if (!closed) throw new Error('Obligation status changed while applying adjustment.');
        updatedObligation = closed;
      }
    }

    await tx.insert(taxObligationEvent).values({
      obligationId: obligation.id,
      eventKey: `${obligation.id}:adjustment-decision:${adjustment.id}`,
      eventType: decision === 'APPROVED' ? 'ASSESSMENT_ADJUSTMENT_APPROVED' : 'ASSESSMENT_ADJUSTMENT_REJECTED',
      fromStatus: obligation.status,
      toStatus: updatedObligation.status,
      actorUserId: session.user.id,
      details: { adjustmentId: adjustment.id, kind: adjustment.kind, amount: adjustment.amount, reason: parsed.data.reason, evidenceReference: adjustment.evidenceReference },
    });
    await tx.insert(auditLog).values({
      userId: session.user.id,
      action: decision === 'APPROVED' ? 'TAX_ASSESSMENT_ADJUSTMENT_APPROVED' : 'TAX_ASSESSMENT_ADJUSTMENT_REJECTED',
      targetType: 'tax_obligation_adjustment',
      targetId: adjustment.id,
      beforeState: { status: adjustment.status },
      afterState: { status: updatedAdjustment.status, obligationStatus: updatedObligation.status },
      metadata: JSON.stringify({ obligationId: obligation.id, proposerUserId: adjustment.createdBy, reason: parsed.data.reason }),
    });
    await capturePaymentScoreSnapshot(tx, obligation.taxpayerId, obligation.taxType, obligation.periodKey, obligation.currency);
    return { adjustment: updatedAdjustment, obligation: updatedObligation };
  });
}

export async function disputeOwnTaxObligation(input: unknown) {
  const session = await requireTraderSession();
  const parsed = disputeTaxObligationSchema.safeParse(input);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Dispute details are invalid.');

  return db.transaction(async (tx) => {
    const [obligation] = await tx.select().from(taxObligation)
      .where(and(eq(taxObligation.id, parsed.data.obligationId), eq(taxObligation.taxpayerId, session.user.id)))
      .for('update').limit(1);
    if (!obligation || !['FINALIZED', 'PAYABLE'].includes(obligation.status)) throw new Error('This obligation cannot be disputed in its current state.');
    const [pendingPayment] = await tx.select({ id: taxPayment.id }).from(taxPayment)
      .where(and(eq(taxPayment.obligationId, obligation.id), eq(taxPayment.status, 'pending'))).limit(1);
    if (pendingPayment) throw new Error('A payment is under review; wait for its decision before disputing the obligation.');

    const [updated] = await tx.update(taxObligation).set({ status: 'DISPUTED', updatedAt: new Date() })
      .where(eq(taxObligation.id, obligation.id)).returning();
    await tx.insert(taxObligationEvent).values({
      obligationId: obligation.id,
      eventKey: `${obligation.id}:disputed:${crypto.randomUUID()}`,
      eventType: 'TAXPAYER_DISPUTED_ASSESSMENT',
      fromStatus: obligation.status,
      toStatus: 'DISPUTED',
      actorUserId: session.user.id,
      details: { reason: parsed.data.reason, evidenceReference: parsed.data.evidenceReference },
    });
    await tx.insert(auditLog).values({
      userId: session.user.id,
      action: 'TAX_OBLIGATION_DISPUTED',
      targetType: 'tax_obligation',
      targetId: obligation.id,
      beforeState: { status: obligation.status }, afterState: { status: updated.status },
      metadata: JSON.stringify({ reason: parsed.data.reason, evidenceReference: parsed.data.evidenceReference }),
    });
    return updated;
  });
}

export async function getOwnTaxObligations() {
  const session = await requireTraderSession();
  return db.select().from(taxObligation)
    .where(eq(taxObligation.taxpayerId, session.user.id))
    .orderBy(desc(taxObligation.assessmentDate)).limit(200);
}

export async function getOwnLatestPaymentScores() {
  const session = await requireTraderSession();
  const snapshots = await db.select().from(taxPeriodPaymentScoreSnapshot)
    .where(eq(taxPeriodPaymentScoreSnapshot.taxpayerId, session.user.id))
    .orderBy(desc(taxPeriodPaymentScoreSnapshot.calculatedAt)).limit(200);
  const latest = new Map<string, (typeof snapshots)[number]>();
  for (const snapshot of snapshots) {
    const key = `${snapshot.taxType}\u0000${snapshot.periodKey}\u0000${snapshot.currency}`;
    if (!latest.has(key)) latest.set(key, snapshot);
  }
  return [...latest.values()];
}

export async function getPayableTaxObligationsForPayment() {
  const session = await requireTraderSession();
  const obligations = await db.select().from(taxObligation)
    .where(and(eq(taxObligation.taxpayerId, session.user.id), eq(taxObligation.status, 'PAYABLE')))
    .orderBy(taxObligation.dueDate).limit(100);
  if (obligations.length === 0) return [];
  const obligationIds = obligations.map((obligation) => obligation.id);
  const adjustments = await db.select({ obligationId: taxObligationAdjustment.obligationId, kind: taxObligationAdjustment.kind, amount: taxObligationAdjustment.amount })
    .from(taxObligationAdjustment)
    .where(and(inArray(taxObligationAdjustment.obligationId, obligationIds), eq(taxObligationAdjustment.status, 'APPROVED')));
  const paidRows = await db.select({
    obligationId: taxPayment.obligationId,
    total: sql<string>`COALESCE(SUM(${taxPayment.amount}),0)::text`.as('total'),
  }).from(taxPayment)
    .where(and(
      inArray(taxPayment.obligationId, obligationIds),
      eq(taxPayment.status, 'confirmed'),
      eq(taxPayment.workflowStatus, 'PAID'),
    ))
    .groupBy(taxPayment.obligationId);
  const adjustmentByObligation = new Map<string, typeof adjustments>();
  for (const adjustment of adjustments) adjustmentByObligation.set(adjustment.obligationId, [...(adjustmentByObligation.get(adjustment.obligationId) ?? []), adjustment]);
  const paidByObligation = new Map(paidRows.map((row) => [row.obligationId, row.total]));
  const result = [];
  for (const obligation of obligations) {
    let dueMinor = amountToMinorUnits(obligation.originalAmount);
    for (const adjustment of adjustmentByObligation.get(obligation.id) ?? []) dueMinor += obligationAdjustmentDelta(adjustment.kind, adjustment.amount);
    dueMinor -= BigInt(paidByObligation.get(obligation.id) ?? '0') * BigInt(100);
    if (dueMinor > BigInt(0)) result.push({
      id: obligation.id,
      taxType: obligation.taxType,
      periodKey: obligation.periodKey,
      assessmentReference: obligation.assessmentReference,
      dueDate: obligation.dueDate,
      currency: obligation.currency,
      outstandingAmount: minorUnitsToAmount(dueMinor),
      isSupportedForPayment: obligation.currency === 'RWF' && dueMinor % BigInt(100) === BigInt(0),
    });
  }
  return result;
}
