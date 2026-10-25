'use server';

import { and, asc, eq, sql } from 'drizzle-orm';
import db from '@/db/drizzle';
import { auditLog, b2bDispatch, b2bOrderAcceptance, b2bReceipt, businessRepresentative, stock, stockMovement, stockReservation, transaction, user } from '@/db/schema';
import { assertBusinessActor, assertVerifiedBusinessOwner } from '@/lib/b2b-authorization';
import { requireTraderSession } from '@/lib/auth-guard';
import { dispatchInputSchema, receiptInputSchema, representativeIdSchema, representativeInviteSchema } from '@/lib/validation/b2b-fulfillment.schema';

function parseOrThrow<T>(schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false } }, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new Error('The submitted fulfillment details are invalid.');
  return result.data;
}

export async function inviteBusinessRepresentative(input: unknown): Promise<{ success: true }> {
  const { email } = parseOrThrow(representativeInviteSchema, input);
  const session = await requireTraderSession();

  await db.transaction(async (tx) => {
    await assertVerifiedBusinessOwner(tx, session.user.id);
    const [representative] = await tx.select({
      id: user.id,
      email: user.email,
      emailVerified: user.emailVerified,
      isActive: user.isActive,
      clearanceStatus: user.clearanceStatus,
    }).from(user).where(sql`lower(${user.email}) = ${email}`).limit(1);

    if (!representative || !representative.emailVerified || !representative.isActive || representative.clearanceStatus !== 'approved') {
      throw new Error('An invitation can be sent only to an existing, active, approved TaxFlow account with a verified email.');
    }
    if (representative.id === session.user.id) throw new Error('A business owner cannot authorize themselves as a representative.');

    const [membership] = await tx.select().from(businessRepresentative)
      .where(and(
        eq(businessRepresentative.businessId, session.user.id),
        eq(businessRepresentative.representativeUserId, representative.id),
      ))
      .for('update')
      .limit(1);

    let membershipId: string;
    if (membership?.status === 'active' || membership?.status === 'pending') {
      throw new Error('This user already has an active or pending representative invitation.');
    } else if (membership) {
      const [updated] = await tx.update(businessRepresentative).set({
        status: 'pending', invitedByUserId: session.user.id, invitedAt: new Date(), acceptedAt: null, revokedAt: null, updatedAt: new Date(),
      }).where(eq(businessRepresentative.id, membership.id)).returning({ id: businessRepresentative.id });
      if (!updated) throw new Error('The representative invitation could not be renewed.');
      membershipId = updated.id;
    } else {
      const [created] = await tx.insert(businessRepresentative).values({
        businessId: session.user.id,
        representativeUserId: representative.id,
        invitedByUserId: session.user.id,
        status: 'pending',
      }).returning({ id: businessRepresentative.id });
      if (!created) throw new Error('The representative invitation could not be created.');
      membershipId = created.id;
    }

    await tx.insert(auditLog).values({
      userId: session.user.id,
      action: 'BUSINESS_REPRESENTATIVE_INVITED',
      targetType: 'business_representative',
      targetId: membershipId,
      metadata: JSON.stringify({ businessId: session.user.id, representativeUserId: representative.id, permission: 'receipt_confirmation', status: 'pending', previousStatus: membership?.status ?? null, invitationRenewed: Boolean(membership) }),
    });
  });

  return { success: true };
}

export async function acceptBusinessRepresentativeInvitation(input: unknown): Promise<{ success: true }> {
  const { representativeId } = parseOrThrow(representativeIdSchema, input);
  const session = await requireTraderSession();

  await db.transaction(async (tx) => {
    const [membership] = await tx.select().from(businessRepresentative)
      .where(eq(businessRepresentative.id, representativeId)).for('update').limit(1);
    if (!membership || membership.representativeUserId !== session.user.id || membership.status !== 'pending') {
      throw new Error('This invitation is unavailable or is not addressed to your account.');
    }
    await assertVerifiedBusinessOwner(tx, membership.businessId);
    const [representative] = await tx.select({
      id: user.id, emailVerified: user.emailVerified, clearanceStatus: user.clearanceStatus, isActive: user.isActive,
    }).from(user).where(eq(user.id, session.user.id)).limit(1);
    if (!representative?.emailVerified || !representative.isActive || representative.clearanceStatus !== 'approved') {
      throw new Error('Your account must be active, approved, and email-verified to accept this invitation.');
    }
    const acceptedAt = new Date();
    const [accepted] = await tx.update(businessRepresentative).set({ status: 'active', acceptedAt, updatedAt: acceptedAt })
      .where(and(eq(businessRepresentative.id, membership.id), eq(businessRepresentative.status, 'pending')))
      .returning({ id: businessRepresentative.id });
    if (!accepted) throw new Error('The invitation changed before it could be accepted.');

    await tx.insert(auditLog).values({
      userId: session.user.id,
      action: 'BUSINESS_REPRESENTATIVE_PERMISSION_GRANTED',
      targetType: 'business_representative',
      targetId: membership.id,
      metadata: JSON.stringify({ businessId: membership.businessId, representativeUserId: session.user.id, permission: 'receipt_confirmation', acceptedAt }),
    });
  });

  return { success: true };
}

export async function revokeBusinessRepresentative(input: unknown): Promise<{ success: true }> {
  const { representativeId } = parseOrThrow(representativeIdSchema, input);
  const session = await requireTraderSession();

  await db.transaction(async (tx) => {
    await assertVerifiedBusinessOwner(tx, session.user.id);
    const [membership] = await tx.select().from(businessRepresentative)
      .where(and(
        eq(businessRepresentative.id, representativeId),
        eq(businessRepresentative.businessId, session.user.id),
      )).for('update').limit(1);
    if (!membership || membership.status === 'revoked') throw new Error('Active representative not found.');

    const revokedAt = new Date();
    const [revoked] = await tx.update(businessRepresentative).set({ status: 'revoked', revokedAt, updatedAt: revokedAt })
      .where(and(eq(businessRepresentative.id, membership.id), sql`${businessRepresentative.status} <> 'revoked'`))
      .returning({ id: businessRepresentative.id });
    if (!revoked) throw new Error('The representative status changed before revocation.');

    await tx.insert(auditLog).values({
      userId: session.user.id,
      action: 'BUSINESS_REPRESENTATIVE_REVOKED',
      targetType: 'business_representative',
      targetId: membership.id,
      metadata: JSON.stringify({ businessId: session.user.id, representativeUserId: membership.representativeUserId, permission: 'receipt_confirmation', previousStatus: membership.status, revokedAt }),
    });
  });

  return { success: true };
}

export async function recordB2BDispatch(input: unknown): Promise<{ success: true; dispatchId: string }> {
  const data = parseOrThrow(dispatchInputSchema, input);
  const session = await requireTraderSession();
  const dispatchId = await db.transaction(async (tx) => {
    const [txn] = await tx.select().from(transaction).where(eq(transaction.id, data.transactionId)).for('update').limit(1);
    if (!txn || !txn.buyerId || txn.sellerId !== session.user.id || txn.status !== 'confirmed') {
      throw new Error('Only the seller of an accepted B2B transaction can record dispatch.');
    }
    await assertVerifiedBusinessOwner(tx, txn.sellerId);
    const [acceptance] = await tx.select({ id: b2bOrderAcceptance.id }).from(b2bOrderAcceptance)
      .where(eq(b2bOrderAcceptance.transactionId, txn.id)).limit(1);
    if (!acceptance) throw new Error('This legacy transaction has no recorded order acceptance and cannot enter the new fulfillment workflow.');

    const [prior] = await tx.select().from(b2bDispatch).where(and(
      eq(b2bDispatch.transactionId, txn.id), eq(b2bDispatch.idempotencyKey, data.idempotencyKey),
    )).limit(1);
    if (prior) {
      if (prior.quantity !== data.quantity || prior.dispatchReference !== (data.dispatchReference ?? null)) {
        throw new Error('This dispatch idempotency key was already used with different details.');
      }
      return prior.id;
    }

    const [totals] = await tx.select({ quantity: sql<number>`coalesce(sum(${b2bDispatch.quantity}), 0)` })
      .from(b2bDispatch).where(eq(b2bDispatch.transactionId, txn.id));
    if (Number(totals?.quantity ?? 0) + data.quantity - txn.quantity > 0.000001) {
      throw new Error('Total dispatched quantity cannot exceed the agreed transaction quantity.');
    }
    const dispatchedTotal = Number(totals?.quantity ?? 0) + data.quantity;

    const [saved] = await tx.insert(b2bDispatch).values({
      transactionId: txn.id, sellerBusinessId: txn.sellerId, actorUserId: session.user.id,
      quantity: data.quantity, dispatchReference: data.dispatchReference ?? null, idempotencyKey: data.idempotencyKey,
    }).returning({ id: b2bDispatch.id });
    if (!saved) throw new Error('Dispatch evidence could not be saved.');
    if (dispatchedTotal >= txn.quantity - 0.000001) {
      const [reservation] = await tx.select().from(stockReservation)
        .where(eq(stockReservation.transactionId, txn.id)).for('update').limit(1);
      if (reservation?.status === 'active') {
        const [converted] = await tx.update(stockReservation).set({ status: 'converted' })
          .where(and(eq(stockReservation.id, reservation.id), eq(stockReservation.status, 'active')))
          .returning({ id: stockReservation.id });
        if (!converted) throw new Error('The fully dispatched reservation changed before it could be closed.');
      }
    }
    await tx.insert(auditLog).values({
      userId: session.user.id, action: 'B2B_DISPATCH_RECORDED', targetType: 'b2b_dispatch', targetId: saved.id,
      metadata: JSON.stringify({ transactionId: txn.id, sellerBusinessId: txn.sellerId, buyerBusinessId: txn.buyerId, quantity: data.quantity, dispatchReference: data.dispatchReference ?? null }),
    });
    return saved.id;
  });

  return { success: true, dispatchId };
}

export async function recordB2BReceipt(input: unknown): Promise<{ success: true; receiptId: string }> {
  const data = parseOrThrow(receiptInputSchema, input);
  const session = await requireTraderSession();
  const receiptId = await db.transaction(async (tx) => {
    const [dispatchPreview] = await tx.select({ transactionId: b2bDispatch.transactionId })
      .from(b2bDispatch).where(eq(b2bDispatch.id, data.dispatchId)).limit(1);
    if (!dispatchPreview) throw new Error('Dispatch record not found.');

    const [txn] = await tx.select().from(transaction).where(eq(transaction.id, dispatchPreview.transactionId)).for('update').limit(1);
    const [dispatch] = await tx.select().from(b2bDispatch).where(eq(b2bDispatch.id, data.dispatchId)).for('update').limit(1);
    if (!txn || !dispatch || !txn.buyerId || txn.status !== 'confirmed' || dispatch.transactionId !== txn.id || dispatch.sellerBusinessId !== txn.sellerId) {
      throw new Error('The dispatch is not valid for an accepted B2B transaction.');
    }
    await assertBusinessActor(tx, txn.buyerId, session.user.id);

    const [prior] = await tx.select().from(b2bReceipt).where(and(
      eq(b2bReceipt.dispatchId, dispatch.id), eq(b2bReceipt.idempotencyKey, data.idempotencyKey),
    )).limit(1);
    if (prior) {
      const matches = prior.quantityReceived === data.quantityReceived
        && prior.acceptedQuantity === data.acceptedQuantity
        && prior.damagedQuantity === data.damagedQuantity
        && prior.rejectedQuantity === data.rejectedQuantity
        && prior.disputedQuantity === data.disputedQuantity
        && prior.notes === (data.notes ?? null);
      if (!matches) throw new Error('This receipt idempotency key was already used with different details.');
      return prior.id;
    }

    const [totals] = await tx.select({ quantity: sql<number>`coalesce(sum(${b2bReceipt.quantityReceived}), 0)` })
      .from(b2bReceipt).where(eq(b2bReceipt.dispatchId, dispatch.id));
    if (Number(totals?.quantity ?? 0) + data.quantityReceived - dispatch.quantity > 0.000001) {
      throw new Error('Measured receipt quantity cannot exceed the quantity recorded on this dispatch.');
    }

    const [saved] = await tx.insert(b2bReceipt).values({
      dispatchId: dispatch.id, transactionId: txn.id, buyerBusinessId: txn.buyerId, actorUserId: session.user.id,
      quantityReceived: data.quantityReceived, acceptedQuantity: data.acceptedQuantity,
      damagedQuantity: data.damagedQuantity, rejectedQuantity: data.rejectedQuantity,
      disputedQuantity: data.disputedQuantity, notes: data.notes ?? null, idempotencyKey: data.idempotencyKey,
    }).returning({ id: b2bReceipt.id });
    if (!saved) throw new Error('Receipt evidence could not be saved.');

    if (data.acceptedQuantity > 0) {
      const [buyerStock] = await tx.select().from(stock).where(and(
        eq(stock.businessId, txn.buyerId), eq(stock.productId, txn.productId),
      )).orderBy(asc(stock.businessId)).for('update').limit(1);
      const before = buyerStock?.quantity ?? 0;
      const after = before + data.acceptedQuantity;
      if (buyerStock) {
        const [updated] = await tx.update(stock).set({ quantity: after }).where(eq(stock.id, buyerStock.id)).returning({ quantity: stock.quantity });
        if (!updated) throw new Error('Buyer available stock could not be updated.');
      } else {
        await tx.insert(stock).values({ businessId: txn.buyerId, productId: txn.productId, quantity: after });
      }
      await tx.insert(stockMovement).values({
        businessId: txn.buyerId, productId: txn.productId, quantityDelta: data.acceptedQuantity,
        quantityBefore: before, quantityAfter: after, movementType: 'b2b_receipt_accepted',
        sourceType: 'b2b_receipt', sourceId: saved.id, actorUserId: session.user.id,
        reason: `Accepted quantity from dispatch ${dispatch.id}`,
      });
    }

    await tx.insert(auditLog).values({
      userId: session.user.id, action: 'B2B_RECEIPT_RECORDED', targetType: 'b2b_receipt', targetId: saved.id,
      metadata: JSON.stringify({ transactionId: txn.id, dispatchId: dispatch.id, buyerBusinessId: txn.buyerId, quantityReceived: data.quantityReceived, acceptedQuantity: data.acceptedQuantity, damagedQuantity: data.damagedQuantity, rejectedQuantity: data.rejectedQuantity, disputedQuantity: data.disputedQuantity, stockCredited: data.acceptedQuantity, taxChanged: false }),
    });
    return saved.id;
  });

  return { success: true, receiptId };
}
