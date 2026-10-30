'use server';

import { and, eq, inArray, sql } from 'drizzle-orm';
import db from '@/db/drizzle';
import {
  auditLog,
  b2bDispatch,
  b2bOrderAcceptance,
  productionFinishedGoodsAllocation,
  productionFinishedGoodsAllocationEvent,
  productionFinishedGoodsLot,
  productionFinishedGoodsMovement,
  productionFinishedGoodsReturn,
  productionFinishedGoodsReturnInspection,
  productionFinishedGoodsWarehouse,
  product,
  stock,
  stockMovement,
  stockReservation,
  transaction,
} from '@/db/schema';
import { requireApprovedClearance, requireRRAPermission, requireTraderSession } from '@/lib/auth-guard';
import { assertVerifiedBusinessOwner } from '@/lib/b2b-authorization';
import { decimalToMicros, microsToDecimal } from '@/lib/material-accounting';
import {
  finishedGoodsAllocationCancelSchema,
  finishedGoodsAllocationSchema,
  finishedGoodsDispatchSchema,
  finishedGoodsReturnInspectionSchema,
  finishedGoodsReturnSchema,
  finishedGoodsTransferSchema,
  finishedGoodsWarehouseSchema,
} from '@/lib/validation/finished-goods.schema';
import { z } from 'zod';

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type FinishedGoodsMovementType = typeof productionFinishedGoodsMovement.$inferInsert.eventType;

function parseOrThrow<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Enter valid finished-goods details.');
  return parsed.data;
}

async function requireManufacturer(): Promise<{ id: string; name: string }> {
  const session = await requireTraderSession(['manufacturer']);
  const { suspended } = await requireApprovedClearance();
  if (suspended || session.user.isActive === false) throw new Error('An active, approved manufacturer account is required.');
  return { id: session.user.id, name: session.user.name };
}

async function lockLot(tx: DbTransaction, lotId: string, manufacturerId: string) {
  const [lot] = await tx.select().from(productionFinishedGoodsLot).where(and(
    eq(productionFinishedGoodsLot.id, lotId),
    eq(productionFinishedGoodsLot.manufacturerId, manufacturerId),
  )).for('update').limit(1);
  if (!lot) throw new Error('Verified finished-goods lot was not found for this manufacturer.');
  return lot;
}

async function lotBalanceMicros(tx: DbTransaction, lotId: string): Promise<bigint> {
  const movements = await tx.select({ eventType: productionFinishedGoodsMovement.eventType, quantityDelta: productionFinishedGoodsMovement.quantityDelta })
    .from(productionFinishedGoodsMovement).where(eq(productionFinishedGoodsMovement.lotId, lotId));
  return movements.reduce((balance, movement) => movement.eventType === 'warehouse_assignment'
    ? balance
    : balance + decimalToMicros(movement.quantityDelta), decimalToMicros((await tx.select({ quantity: productionFinishedGoodsLot.quantity })
      .from(productionFinishedGoodsLot).where(eq(productionFinishedGoodsLot.id, lotId)).limit(1))[0]?.quantity ?? '0'));
}

async function activeAllocatedMicros(tx: DbTransaction, lotId: string): Promise<bigint> {
  const allocations = await tx.select({ id: productionFinishedGoodsAllocation.id, quantity: productionFinishedGoodsAllocation.quantity })
    .from(productionFinishedGoodsAllocation).where(eq(productionFinishedGoodsAllocation.lotId, lotId));
  if (allocations.length === 0) return BigInt(0);
  const events = await tx.select({ allocationId: productionFinishedGoodsAllocationEvent.allocationId, eventType: productionFinishedGoodsAllocationEvent.eventType, quantity: productionFinishedGoodsAllocationEvent.quantity })
    .from(productionFinishedGoodsAllocationEvent)
    .where(inArray(productionFinishedGoodsAllocationEvent.allocationId, allocations.map((allocation) => allocation.id)));
  const byAllocation = new Map<string, bigint>();
  for (const event of events) {
    const quantity = decimalToMicros(event.quantity);
    byAllocation.set(event.allocationId, (byAllocation.get(event.allocationId) ?? BigInt(0))
      + (event.eventType === 'reserved' ? quantity : -quantity));
  }
  return allocations.reduce((sum, allocation) => sum + (byAllocation.get(allocation.id) ?? BigInt(0)), BigInt(0));
}

async function activeAllocatedForTransactionMicros(tx: DbTransaction, transactionId: string): Promise<bigint> {
  const allocations = await tx.select({ id: productionFinishedGoodsAllocation.id })
    .from(productionFinishedGoodsAllocation).where(eq(productionFinishedGoodsAllocation.transactionId, transactionId));
  if (allocations.length === 0) return BigInt(0);
  const events = await tx.select({ allocationId: productionFinishedGoodsAllocationEvent.allocationId, eventType: productionFinishedGoodsAllocationEvent.eventType, quantity: productionFinishedGoodsAllocationEvent.quantity })
    .from(productionFinishedGoodsAllocationEvent)
    .where(inArray(productionFinishedGoodsAllocationEvent.allocationId, allocations.map((allocation) => allocation.id)));
  return events.reduce((sum, event) => sum + (event.eventType === 'reserved'
    ? decimalToMicros(event.quantity) : -decimalToMicros(event.quantity)), BigInt(0));
}

async function warehouseBalanceMicros(tx: DbTransaction, lotId: string, warehouseId: string): Promise<bigint> {
  const rows = await tx.select({ quantityDelta: productionFinishedGoodsMovement.quantityDelta })
    .from(productionFinishedGoodsMovement).where(and(
      eq(productionFinishedGoodsMovement.lotId, lotId),
      eq(productionFinishedGoodsMovement.warehouseId, warehouseId),
    ));
  return rows.reduce((balance, row) => balance + decimalToMicros(row.quantityDelta), BigInt(0));
}

async function recordMovement(
  tx: DbTransaction,
  input: {
    manufacturerId: string; lotId: string; warehouseId: string; eventType: FinishedGoodsMovementType;
    quantityDelta: bigint; sourceType: string; sourceId: string; idempotencyKey: string;
    actorUserId: string; reference?: string; reason?: string; evidenceReference?: string;
  },
) {
  const [movement] = await tx.insert(productionFinishedGoodsMovement).values({
    manufacturerId: input.manufacturerId,
    lotId: input.lotId,
    warehouseId: input.warehouseId,
    eventType: input.eventType,
    quantityDelta: microsToDecimal(input.quantityDelta),
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    idempotencyKey: input.idempotencyKey,
    actorUserId: input.actorUserId,
    reference: input.reference ?? null,
    reason: input.reason ?? null,
    evidenceReference: input.evidenceReference ?? null,
  }).returning({ id: productionFinishedGoodsMovement.id });
  if (!movement) throw new Error('Finished-goods movement could not be recorded.');
  return movement.id;
}

export async function createFinishedGoodsWarehouse(input: unknown): Promise<{ warehouseId: string }> {
  const data = parseOrThrow(finishedGoodsWarehouseSchema, input);
  const actor = await requireManufacturer();
  return db.transaction(async (tx) => {
    await assertVerifiedBusinessOwner(tx, actor.id);
    const [warehouse] = await tx.insert(productionFinishedGoodsWarehouse).values({
      manufacturerId: actor.id,
      code: data.code,
      name: data.name,
      createdByUserId: actor.id,
    }).returning({ id: productionFinishedGoodsWarehouse.id });
    if (!warehouse) throw new Error('Warehouse could not be created.');
    await tx.insert(auditLog).values({
      userId: actor.id, action: 'FINISHED_GOODS_WAREHOUSE_CREATED', targetType: 'production_finished_goods_warehouse', targetId: warehouse.id,
      metadata: JSON.stringify({ code: data.code, name: data.name }),
    });
    return { warehouseId: warehouse.id };
  });
}

export async function assignFinishedGoodsLotToWarehouse(input: unknown): Promise<{ movementId: string }> {
  const data = parseOrThrow(z.object({ lotId: z.uuid(), warehouseId: z.uuid(), idempotencyKey: z.uuid() }), input);
  const actor = await requireManufacturer();
  return db.transaction(async (tx) => {
    await assertVerifiedBusinessOwner(tx, actor.id);
    const lot = await lockLot(tx, data.lotId, actor.id);
    const [warehouse] = await tx.select().from(productionFinishedGoodsWarehouse).where(and(
      eq(productionFinishedGoodsWarehouse.id, data.warehouseId),
      eq(productionFinishedGoodsWarehouse.manufacturerId, actor.id),
    )).limit(1);
    if (!warehouse) throw new Error('Warehouse was not found for this manufacturer.');
    const [prior] = await tx.select().from(productionFinishedGoodsMovement).where(and(
      eq(productionFinishedGoodsMovement.manufacturerId, actor.id),
      eq(productionFinishedGoodsMovement.idempotencyKey, data.idempotencyKey),
    )).limit(1);
    if (prior) {
      if (prior.lotId !== lot.id || prior.warehouseId !== warehouse.id || prior.eventType !== 'warehouse_assignment') {
        throw new Error('This assignment idempotency key already has different details.');
      }
      return { movementId: prior.id };
    }
    const priorAssignments = await tx.select({ id: productionFinishedGoodsMovement.id })
      .from(productionFinishedGoodsMovement).where(and(
        eq(productionFinishedGoodsMovement.lotId, lot.id),
        eq(productionFinishedGoodsMovement.eventType, 'warehouse_assignment'),
      )).limit(1);
    if (priorAssignments.length) throw new Error('This lot already has a warehouse assignment. Use a warehouse transfer.');
    const quantity = await lotBalanceMicros(tx, lot.id);
    if (quantity <= BigInt(0)) throw new Error('The lot has no remaining quantity to assign.');
    const movementId = await recordMovement(tx, {
      manufacturerId: actor.id, lotId: lot.id, warehouseId: warehouse.id,
      eventType: 'warehouse_assignment', quantityDelta: quantity,
      sourceType: 'warehouse_assignment', sourceId: lot.id, idempotencyKey: data.idempotencyKey,
      actorUserId: actor.id, reference: warehouse.code, reason: 'Initial warehouse location assignment',
    });
    await tx.insert(auditLog).values({
      userId: actor.id, action: 'FINISHED_GOODS_WAREHOUSE_ASSIGNED', targetType: 'production_finished_goods_lot', targetId: lot.id,
      metadata: JSON.stringify({ warehouseId: warehouse.id, movementId, quantity: microsToDecimal(quantity) }),
    });
    return { movementId };
  });
}

export async function allocateFinishedGoodsLot(input: unknown): Promise<{ allocationId: string; replayed: boolean }> {
  const data = parseOrThrow(finishedGoodsAllocationSchema, input);
  const actor = await requireManufacturer();
  const requested = decimalToMicros(String(data.quantity));
  return db.transaction(async (tx) => {
    await assertVerifiedBusinessOwner(tx, actor.id);
    const [sale] = await tx.select().from(transaction).where(eq(transaction.id, data.transactionId)).for('update').limit(1);
    if (!sale || sale.sellerId !== actor.id || sale.status !== 'confirmed' || !sale.buyerId) {
      throw new Error('Lot allocation requires this manufacturer’s confirmed B2B sale.');
    }
    const [prior] = await tx.select().from(productionFinishedGoodsAllocation).where(and(
      eq(productionFinishedGoodsAllocation.manufacturerId, actor.id),
      eq(productionFinishedGoodsAllocation.idempotencyKey, data.idempotencyKey),
    )).limit(1);
    if (prior) {
      if (prior.transactionId !== sale.id || prior.lotId !== data.lotId || decimalToMicros(prior.quantity) !== requested) {
        throw new Error('This allocation idempotency key already has different details.');
      }
      return { allocationId: prior.id, replayed: true };
    }
    await lockLot(tx, data.lotId, actor.id);
    const [acceptance] = await tx.select({ id: b2bOrderAcceptance.id }).from(b2bOrderAcceptance)
      .where(and(eq(b2bOrderAcceptance.transactionId, sale.id), eq(b2bOrderAcceptance.buyerBusinessId, sale.buyerId))).limit(1);
    if (!acceptance) throw new Error('Only an explicitly accepted sale can reserve a finished-goods lot.');
    const balance = await lotBalanceMicros(tx, data.lotId);
    const held = await activeAllocatedMicros(tx, data.lotId);
    if (requested > balance - held) throw new Error('Requested quantity exceeds available verified lot quantity.');
    const activeSaleAllocations = await activeAllocatedForTransactionMicros(tx, sale.id);
    const [existingDispatches] = await tx.select({ quantity: sql<string>`COALESCE(SUM(${b2bDispatch.quantity}), 0)::text` })
      .from(b2bDispatch).where(eq(b2bDispatch.transactionId, sale.id));
    const totalDispatched = decimalToMicros(existingDispatches?.quantity ?? '0');
    if (requested + activeSaleAllocations + totalDispatched > decimalToMicros(String(sale.quantity))) {
      throw new Error('Lot allocations cannot exceed the accepted sale quantity.');
    }
    const [allocation] = await tx.insert(productionFinishedGoodsAllocation).values({
      manufacturerId: actor.id, lotId: data.lotId, transactionId: sale.id,
      quantity: microsToDecimal(requested), idempotencyKey: data.idempotencyKey, actorUserId: actor.id,
    }).returning({ id: productionFinishedGoodsAllocation.id });
    if (!allocation) throw new Error('Finished-goods allocation could not be recorded.');
    await tx.insert(productionFinishedGoodsAllocationEvent).values({
      allocationId: allocation.id, eventType: 'reserved', quantity: microsToDecimal(requested), actorUserId: actor.id,
    });
    await tx.insert(auditLog).values({
      userId: actor.id, action: 'FINISHED_GOODS_LOT_ALLOCATED', targetType: 'production_finished_goods_allocation', targetId: allocation.id,
      metadata: JSON.stringify({ transactionId: sale.id, lotId: data.lotId, quantity: microsToDecimal(requested) }),
    });
    return { allocationId: allocation.id, replayed: false };
  });
}

export async function cancelFinishedGoodsAllocation(input: unknown): Promise<{ success: true }> {
  const data = parseOrThrow(finishedGoodsAllocationCancelSchema, input);
  const actor = await requireManufacturer();
  await db.transaction(async (tx) => {
    await assertVerifiedBusinessOwner(tx, actor.id);
    const [allocation] = await tx.select().from(productionFinishedGoodsAllocation)
      .where(eq(productionFinishedGoodsAllocation.id, data.allocationId)).for('update').limit(1);
    if (!allocation || allocation.manufacturerId !== actor.id) throw new Error('Finished-goods allocation was not found.');
    const [sale] = await tx.select({ sellerId: transaction.sellerId, status: transaction.status })
      .from(transaction).where(eq(transaction.id, allocation.transactionId)).for('update').limit(1);
    if (!sale || sale.sellerId !== actor.id || sale.status !== 'confirmed') throw new Error('Only an active allocation for your confirmed sale can be cancelled.');
    const events = await tx.select().from(productionFinishedGoodsAllocationEvent)
      .where(eq(productionFinishedGoodsAllocationEvent.allocationId, allocation.id));
    const remaining = events.reduce((sum, event) => sum + (event.eventType === 'reserved'
      ? decimalToMicros(event.quantity) : -decimalToMicros(event.quantity)), BigInt(0));
    if (remaining <= BigInt(0)) throw new Error('This allocation has no remaining reserved quantity.');
    await tx.insert(productionFinishedGoodsAllocationEvent).values({
      allocationId: allocation.id, eventType: 'cancelled', quantity: microsToDecimal(remaining), actorUserId: actor.id, reference: data.reason,
    });
    await tx.insert(auditLog).values({
      userId: actor.id, action: 'FINISHED_GOODS_ALLOCATION_CANCELLED', targetType: 'production_finished_goods_allocation', targetId: allocation.id,
      metadata: JSON.stringify({ quantity: microsToDecimal(remaining), reason: data.reason }),
    });
  });
  return { success: true };
}

export async function recordFinishedGoodsDispatch(input: unknown): Promise<{ dispatchId: string; replayed: boolean }> {
  const data = parseOrThrow(finishedGoodsDispatchSchema, input);
  const actor = await requireManufacturer();
  const quantity = decimalToMicros(String(data.quantity));
  return db.transaction(async (tx) => {
    await assertVerifiedBusinessOwner(tx, actor.id);
    const [sale] = await tx.select().from(transaction).where(eq(transaction.id, data.transactionId)).for('update').limit(1);
    if (!sale || sale.sellerId !== actor.id || !sale.buyerId || sale.status !== 'confirmed') {
      throw new Error('Only this manufacturer’s confirmed B2B sale can be dispatched.');
    }
    const [prior] = await tx.select().from(b2bDispatch).where(and(
      eq(b2bDispatch.transactionId, sale.id), eq(b2bDispatch.idempotencyKey, data.idempotencyKey),
    )).limit(1);
    if (prior) {
      if (prior.quantity !== Number(microsToDecimal(quantity)) || prior.dispatchReference !== data.dispatchReference) {
        throw new Error('This dispatch idempotency key already has different details.');
      }
      const [movement] = await tx.select({ id: productionFinishedGoodsMovement.id })
        .from(productionFinishedGoodsMovement).where(and(
          eq(productionFinishedGoodsMovement.sourceType, 'b2b_dispatch'),
          eq(productionFinishedGoodsMovement.sourceId, prior.id),
          eq(productionFinishedGoodsMovement.eventType, 'dispatch'),
        )).limit(1);
      if (!movement) throw new Error('Existing dispatch lacks its required finished-goods lot movement and needs investigation.');
      return { dispatchId: prior.id, replayed: true };
    }
    const [acceptance] = await tx.select({ id: b2bOrderAcceptance.id }).from(b2bOrderAcceptance)
      .where(and(eq(b2bOrderAcceptance.transactionId, sale.id), eq(b2bOrderAcceptance.buyerBusinessId, sale.buyerId))).limit(1);
    if (!acceptance) throw new Error('Dispatch requires explicit buyer acceptance.');
    const [allocation] = await tx.select().from(productionFinishedGoodsAllocation)
      .where(and(eq(productionFinishedGoodsAllocation.id, data.allocationId), eq(productionFinishedGoodsAllocation.transactionId, sale.id)))
      .for('update').limit(1);
    if (!allocation || allocation.manufacturerId !== actor.id) throw new Error('A matching finished-goods allocation is required.');
    const lot = await lockLot(tx, allocation.lotId, actor.id);
    const [warehouse] = await tx.select().from(productionFinishedGoodsWarehouse).where(and(
      eq(productionFinishedGoodsWarehouse.id, data.warehouseId), eq(productionFinishedGoodsWarehouse.manufacturerId, actor.id),
    )).limit(1);
    if (!warehouse) throw new Error('Dispatch warehouse was not found for this manufacturer.');
    const allocationEvents = await tx.select().from(productionFinishedGoodsAllocationEvent)
      .where(eq(productionFinishedGoodsAllocationEvent.allocationId, allocation.id));
    const allocatable = allocationEvents.reduce((sum, event) => sum + (event.eventType === 'reserved'
      ? decimalToMicros(event.quantity) : -decimalToMicros(event.quantity)), BigInt(0));
    if (quantity > allocatable) throw new Error('Dispatch quantity exceeds the remaining quantity reserved to this lot.');
    if (quantity > await warehouseBalanceMicros(tx, lot.id, warehouse.id)) throw new Error('Dispatch quantity exceeds this lot’s warehouse balance.');
    const [priorDispatchTotal] = await tx.select({ quantity: sql<string>`COALESCE(SUM(${b2bDispatch.quantity}), 0)::text` })
      .from(b2bDispatch).where(eq(b2bDispatch.transactionId, sale.id));
    const totalDispatched = decimalToMicros(priorDispatchTotal?.quantity ?? '0');
    if (totalDispatched + quantity > decimalToMicros(String(sale.quantity))) throw new Error('Dispatch exceeds the accepted transaction quantity.');
    const [dispatch] = await tx.insert(b2bDispatch).values({
      transactionId: sale.id, sellerBusinessId: actor.id, actorUserId: actor.id,
      quantity: Number(microsToDecimal(quantity)), dispatchReference: data.dispatchReference,
      idempotencyKey: data.idempotencyKey,
    }).returning({ id: b2bDispatch.id });
    if (!dispatch) throw new Error('Dispatch evidence could not be recorded.');
    const movementId = await recordMovement(tx, {
      manufacturerId: actor.id, lotId: lot.id, warehouseId: warehouse.id,
      eventType: 'dispatch', quantityDelta: -quantity, sourceType: 'b2b_dispatch', sourceId: dispatch.id,
      idempotencyKey: `dispatch:${dispatch.id}`, actorUserId: actor.id, reference: data.dispatchReference,
      reason: `Dispatch for confirmed transaction ${sale.id}`,
    });
    await tx.insert(productionFinishedGoodsAllocationEvent).values({
      allocationId: allocation.id, eventType: 'dispatched', quantity: microsToDecimal(quantity), actorUserId: actor.id,
      reference: dispatch.id,
    });
    if (totalDispatched + quantity >= decimalToMicros(String(sale.quantity))) {
      const [reservation] = await tx.select().from(stockReservation).where(eq(stockReservation.transactionId, sale.id)).for('update').limit(1);
      if (reservation?.status === 'active') {
        const [converted] = await tx.update(stockReservation).set({ status: 'converted' })
          .where(and(eq(stockReservation.id, reservation.id), eq(stockReservation.status, 'active')))
          .returning({ id: stockReservation.id });
        if (!converted) throw new Error('The stock reservation changed before dispatch could be finalized.');
      }
    }
    await tx.insert(auditLog).values({
      userId: actor.id, action: 'FINISHED_GOODS_LOT_DISPATCHED', targetType: 'b2b_dispatch', targetId: dispatch.id,
      metadata: JSON.stringify({ transactionId: sale.id, buyerId: sale.buyerId, lotId: lot.id, allocationId: allocation.id, warehouseId: warehouse.id, movementId, quantity: microsToDecimal(quantity), dispatchReference: data.dispatchReference, invoiceReference: sale.invoiceReference }),
    });
    return { dispatchId: dispatch.id, replayed: false };
  });
}

export async function transferFinishedGoodsLot(input: unknown): Promise<{ movementIds: string[]; replayed: boolean }> {
  const data = parseOrThrow(finishedGoodsTransferSchema, input);
  const actor = await requireManufacturer();
  const quantity = decimalToMicros(String(data.quantity));
  return db.transaction(async (tx) => {
    await assertVerifiedBusinessOwner(tx, actor.id);
    const [prior] = await tx.select({ id: productionFinishedGoodsMovement.id })
      .from(productionFinishedGoodsMovement).where(and(
        eq(productionFinishedGoodsMovement.manufacturerId, actor.id),
        eq(productionFinishedGoodsMovement.idempotencyKey, `${data.idempotencyKey}:out`),
      )).limit(1);
    if (prior) {
      const [priorOut] = await tx.select().from(productionFinishedGoodsMovement)
        .where(eq(productionFinishedGoodsMovement.id, prior.id)).limit(1);
      const [priorIn] = priorOut ? await tx.select().from(productionFinishedGoodsMovement).where(and(
        eq(productionFinishedGoodsMovement.manufacturerId, actor.id),
        eq(productionFinishedGoodsMovement.idempotencyKey, `${data.idempotencyKey}:in`),
      )).limit(1) : [];
      if (!priorOut || !priorIn || priorOut.lotId !== data.lotId || priorOut.warehouseId !== data.sourceWarehouseId
        || priorIn.warehouseId !== data.destinationWarehouseId || priorOut.eventType !== 'transfer_out'
        || priorIn.eventType !== 'transfer_in' || decimalToMicros(priorOut.quantityDelta) !== -quantity
        || decimalToMicros(priorIn.quantityDelta) !== quantity || priorOut.reference !== data.reference
        || priorOut.reason !== data.reason || priorOut.evidenceReference !== data.evidenceReference) {
        throw new Error('This transfer idempotency key already has different or incomplete movement details.');
      }
      return { movementIds: [priorOut.id, priorIn.id], replayed: true };
    }
    const lot = await lockLot(tx, data.lotId, actor.id);
    const [source] = await tx.select().from(productionFinishedGoodsWarehouse).where(and(
      eq(productionFinishedGoodsWarehouse.id, data.sourceWarehouseId), eq(productionFinishedGoodsWarehouse.manufacturerId, actor.id),
    )).limit(1);
    const [destination] = await tx.select().from(productionFinishedGoodsWarehouse).where(and(
      eq(productionFinishedGoodsWarehouse.id, data.destinationWarehouseId), eq(productionFinishedGoodsWarehouse.manufacturerId, actor.id),
    )).limit(1);
    if (!source || !destination) throw new Error('Both warehouses must belong to this manufacturer.');
    if (await activeAllocatedMicros(tx, lot.id) > BigInt(0)) throw new Error('Cancel lot allocations before transferring the lot.');
    if (quantity > await warehouseBalanceMicros(tx, lot.id, source.id)) throw new Error('Transfer quantity exceeds lot quantity at the source warehouse.');
    const sourceId = `${source.id}:${destination.id}:${data.idempotencyKey}`;
    const outId = await recordMovement(tx, {
      manufacturerId: actor.id, lotId: lot.id, warehouseId: source.id, eventType: 'transfer_out', quantityDelta: -quantity,
      sourceType: 'warehouse_transfer', sourceId, idempotencyKey: `${data.idempotencyKey}:out`, actorUserId: actor.id,
      reference: data.reference, reason: data.reason, evidenceReference: data.evidenceReference,
    });
    const inId = await recordMovement(tx, {
      manufacturerId: actor.id, lotId: lot.id, warehouseId: destination.id, eventType: 'transfer_in', quantityDelta: quantity,
      sourceType: 'warehouse_transfer', sourceId, idempotencyKey: `${data.idempotencyKey}:in`, actorUserId: actor.id,
      reference: data.reference, reason: data.reason, evidenceReference: data.evidenceReference,
    });
    await tx.insert(auditLog).values({
      userId: actor.id, action: 'FINISHED_GOODS_LOT_TRANSFERRED', targetType: 'production_finished_goods_movement', targetId: outId,
      metadata: JSON.stringify({ inMovementId: inId, lotId: lot.id, sourceWarehouseId: source.id, destinationWarehouseId: destination.id, quantity: microsToDecimal(quantity), reference: data.reference, evidenceReference: data.evidenceReference }),
    });
    return { movementIds: [outId, inId], replayed: false };
  });
}

export async function recordFinishedGoodsReturn(input: unknown): Promise<{ returnId: string; replayed: boolean }> {
  const data = parseOrThrow(finishedGoodsReturnSchema, input);
  const actor = await requireManufacturer();
  return db.transaction(async (tx) => {
    await assertVerifiedBusinessOwner(tx, actor.id);
    const [prior] = await tx.select().from(productionFinishedGoodsReturn).where(and(
      eq(productionFinishedGoodsReturn.manufacturerId, actor.id),
      eq(productionFinishedGoodsReturn.idempotencyKey, data.idempotencyKey),
    )).limit(1);
    if (prior) {
      if (prior.lotId !== data.lotId || prior.transactionId !== data.transactionId
        || prior.returnReference !== data.returnReference || decimalToMicros(prior.quantity) !== decimalToMicros(String(data.quantity))
        || prior.reason !== data.reason || prior.evidenceReference !== data.evidenceReference) {
        throw new Error('This return idempotency key already has different details.');
      }
      return { returnId: prior.id, replayed: true };
    }
    const lot = await lockLot(tx, data.lotId, actor.id);
    const [sale] = await tx.select().from(transaction).where(eq(transaction.id, data.transactionId)).for('update').limit(1);
    if (!sale || sale.sellerId !== actor.id || sale.productId !== lot.productId || !['confirmed', 'completed'].includes(sale.status)) {
      throw new Error('Return reference must match a completed sale of this lot product.');
    }
    const dispatchRows = await tx.select({ id: b2bDispatch.id, quantity: b2bDispatch.quantity })
      .from(b2bDispatch).where(eq(b2bDispatch.transactionId, sale.id));
    const dispatchIds = dispatchRows.map((dispatch) => dispatch.id);
    const lotDispatchMovements = dispatchIds.length ? await tx.select({ sourceId: productionFinishedGoodsMovement.sourceId, quantityDelta: productionFinishedGoodsMovement.quantityDelta })
      .from(productionFinishedGoodsMovement).where(and(
        eq(productionFinishedGoodsMovement.lotId, lot.id),
        eq(productionFinishedGoodsMovement.eventType, 'dispatch'),
        inArray(productionFinishedGoodsMovement.sourceId, dispatchIds),
      )) : [];
    const dispatchedFromLot = lotDispatchMovements.reduce((sum, movement) => sum - decimalToMicros(movement.quantityDelta), BigInt(0));
    const [previousReturns] = await tx.select({ quantity: sql<string>`COALESCE(SUM(${productionFinishedGoodsReturn.quantity}), 0)::text` })
      .from(productionFinishedGoodsReturn).where(and(
        eq(productionFinishedGoodsReturn.transactionId, sale.id),
        eq(productionFinishedGoodsReturn.lotId, lot.id),
      ));
    const returnedForLot = decimalToMicros(previousReturns?.quantity ?? '0');
    if (decimalToMicros(String(data.quantity)) + returnedForLot > dispatchedFromLot) {
      throw new Error('Return quantity exceeds the dispatched quantity recorded for this exact lot and sale.');
    }
    const [saved] = await tx.insert(productionFinishedGoodsReturn).values({
      manufacturerId: actor.id, lotId: lot.id, transactionId: data.transactionId,
      returnReference: data.returnReference, quantity: String(data.quantity), reason: data.reason,
      evidenceReference: data.evidenceReference, idempotencyKey: data.idempotencyKey, actorUserId: actor.id,
    }).returning({ id: productionFinishedGoodsReturn.id });
    if (!saved) throw new Error('Return evidence could not be recorded.');
    await tx.insert(auditLog).values({
      userId: actor.id, action: 'FINISHED_GOODS_RETURN_RECORDED', targetType: 'production_finished_goods_return', targetId: saved.id,
      metadata: JSON.stringify({ lotId: lot.id, transactionId: data.transactionId, quantity: data.quantity, status: 'awaiting_independent_inspection', reference: data.returnReference }),
    });
    return { returnId: saved.id, replayed: false };
  });
}

export async function inspectFinishedGoodsReturn(input: unknown): Promise<{ inspectionId: string }> {
  const data = parseOrThrow(finishedGoodsReturnInspectionSchema, input);
  const { user: reviewer } = await requireRRAPermission('production.batch.review');
  const accepted = decimalToMicros(String(data.acceptedQuantity));
  const rejected = decimalToMicros(String(data.rejectedQuantity));
  return db.transaction(async (tx) => {
    const [returned] = await tx.select().from(productionFinishedGoodsReturn)
      .where(eq(productionFinishedGoodsReturn.id, data.returnId)).for('update').limit(1);
    if (!returned) throw new Error('Return evidence was not found.');
    if (returned.actorUserId === reviewer.id) throw new Error('The return submitter cannot inspect their own return.');
    const [returnLot] = await tx.select({ productId: productionFinishedGoodsLot.productId })
      .from(productionFinishedGoodsLot).where(and(
        eq(productionFinishedGoodsLot.id, returned.lotId),
        eq(productionFinishedGoodsLot.manufacturerId, returned.manufacturerId),
      )).for('update').limit(1);
    if (!returnLot) throw new Error('The return lot is unavailable.');
    const [warehouse] = await tx.select().from(productionFinishedGoodsWarehouse).where(and(
      eq(productionFinishedGoodsWarehouse.id, data.warehouseId),
      eq(productionFinishedGoodsWarehouse.manufacturerId, returned.manufacturerId),
    )).limit(1);
    if (!warehouse) throw new Error('Inspection warehouse is not part of the return’s manufacturer.');
    if (accepted + rejected !== decimalToMicros(returned.quantity)) throw new Error('Inspected quantities must equal the returned quantity exactly.');
    const [duplicate] = await tx.select({ id: productionFinishedGoodsReturnInspection.id })
      .from(productionFinishedGoodsReturnInspection).where(eq(productionFinishedGoodsReturnInspection.returnId, returned.id)).limit(1);
    if (duplicate) throw new Error('This return has already been inspected.');
    const [inspection] = await tx.insert(productionFinishedGoodsReturnInspection).values({
      returnId: returned.id, warehouseId: warehouse.id, decision: data.decision, acceptedQuantity: microsToDecimal(accepted),
      rejectedQuantity: microsToDecimal(rejected), reason: data.reason, evidenceReference: data.evidenceReference,
      inspectorUserId: reviewer.id,
    }).returning({ id: productionFinishedGoodsReturnInspection.id });
    if (!inspection) throw new Error('Return inspection could not be saved.');
    if (accepted > BigInt(0)) {
      const acceptedNumber = Number(microsToDecimal(accepted));
      const [updatedStock] = await tx.insert(stock).values({
        businessId: returned.manufacturerId, productId: returnLot.productId, quantity: acceptedNumber,
      }).onConflictDoUpdate({
        target: [stock.businessId, stock.productId],
        set: { quantity: sql`${stock.quantity} + ${acceptedNumber}` },
      }).returning({ quantity: stock.quantity });
      if (!updatedStock) throw new Error('Saleable inventory could not be updated for the accepted return.');
      const after = updatedStock.quantity;
      const before = after - acceptedNumber;
      await tx.insert(stockMovement).values({
        businessId: returned.manufacturerId,
        productId: returnLot.productId,
        quantityDelta: acceptedNumber, quantityBefore: before, quantityAfter: after,
        movementType: 'b2b_return_accepted', sourceType: 'finished_goods_return', sourceId: returned.id,
        actorUserId: reviewer.id, reason: data.reason,
      });
      await recordMovement(tx, {
        manufacturerId: returned.manufacturerId, lotId: returned.lotId, warehouseId: warehouse.id,
        eventType: 'return_accepted', quantityDelta: accepted, sourceType: 'finished_goods_return', sourceId: returned.id,
        idempotencyKey: `return-accepted:${returned.id}`, actorUserId: reviewer.id,
        reference: returned.returnReference, reason: data.reason, evidenceReference: data.evidenceReference,
      });
    }
    await tx.insert(auditLog).values({
      userId: reviewer.id, action: 'FINISHED_GOODS_RETURN_INSPECTED', targetType: 'production_finished_goods_return', targetId: returned.id,
      metadata: JSON.stringify({ inspectionId: inspection.id, decision: data.decision, acceptedQuantity: microsToDecimal(accepted), rejectedQuantity: microsToDecimal(rejected), evidenceReference: data.evidenceReference }),
    });
    return { inspectionId: inspection.id };
  });
}

export async function getFinishedGoodsReconciliation(): Promise<Array<{
  productId: string;
  productName: string;
  aggregateStock: string;
  activeB2BReservations: string;
  trackedLotBalance: string;
  untrackedDifference: string;
}>> {
  const actor = await requireManufacturer();
  const stockRows = await db.select({ productId: stock.productId, quantity: stock.quantity })
    .from(stock).where(eq(stock.businessId, actor.id));
  const lotProductRows = await db.selectDistinct({ productId: productionFinishedGoodsLot.productId })
    .from(productionFinishedGoodsLot).where(eq(productionFinishedGoodsLot.manufacturerId, actor.id));
  const stockByProduct = new Map(stockRows.map((row) => [row.productId, row.quantity]));
  const productIds = [...new Set([...stockRows.map((row) => row.productId), ...lotProductRows.map((row) => row.productId)])];
  const results = await Promise.all(productIds.map(async (productId) => {
    const aggregateQuantity = stockByProduct.get(productId) ?? 0;
    const [lotTotals] = await db.select({
      lotQuantity: sql<string>`COALESCE(SUM(${productionFinishedGoodsLot.quantity}), 0)::text`,
    }).from(productionFinishedGoodsLot).where(and(
      eq(productionFinishedGoodsLot.manufacturerId, actor.id),
      eq(productionFinishedGoodsLot.productId, productId),
    ));
    const lots = await db.select({ id: productionFinishedGoodsLot.id })
      .from(productionFinishedGoodsLot).where(and(
        eq(productionFinishedGoodsLot.manufacturerId, actor.id),
        eq(productionFinishedGoodsLot.productId, productId),
      ));
    const movements = lots.length ? await db.select({ eventType: productionFinishedGoodsMovement.eventType, quantityDelta: productionFinishedGoodsMovement.quantityDelta })
      .from(productionFinishedGoodsMovement).where(inArray(productionFinishedGoodsMovement.lotId, lots.map((lot) => lot.id))) : [];
    const tracked = decimalToMicros(lotTotals?.lotQuantity ?? '0') + movements.reduce((sum, movement) => movement.eventType === 'warehouse_assignment'
      ? sum : sum + decimalToMicros(movement.quantityDelta), BigInt(0));
    const activeReservations = await db.select({
      transactionId: stockReservation.transactionId,
      quantity: stockReservation.quantity,
    }).from(stockReservation).where(and(
      eq(stockReservation.sellerId, actor.id),
      eq(stockReservation.productId, productId),
      eq(stockReservation.status, 'active'),
    ));
    const reservationTransactionIds = activeReservations.map((row) => row.transactionId);
    const dispatchedByTransaction = reservationTransactionIds.length ? await db.select({
      transactionId: b2bDispatch.transactionId,
      quantity: sql<string>`COALESCE(SUM(${b2bDispatch.quantity}), 0)::text`,
    }).from(b2bDispatch).where(inArray(b2bDispatch.transactionId, reservationTransactionIds))
      .groupBy(b2bDispatch.transactionId) : [];
    const dispatched = new Map(dispatchedByTransaction.map((row) => [row.transactionId, decimalToMicros(row.quantity)]));
    const reservationMicros = activeReservations.reduce((sum, row) => {
      const remaining = decimalToMicros(String(row.quantity)) - (dispatched.get(row.transactionId) ?? BigInt(0));
      return sum + (remaining > BigInt(0) ? remaining : BigInt(0));
    }, BigInt(0));
    const [item] = await db.select({ name: product.name }).from(product).where(eq(product.id, productId)).limit(1);
    const reservationQuantity = reservationMicros;
    const accounted = decimalToMicros(String(aggregateQuantity)) + reservationQuantity;
    return {
      productId,
      productName: item?.name ?? 'Product without verified finished-goods lots',
      aggregateStock: String(aggregateQuantity),
      activeB2BReservations: microsToDecimal(reservationQuantity),
      trackedLotBalance: microsToDecimal(tracked),
      untrackedDifference: microsToDecimal(accounted - tracked),
    };
  }));
  return results;
}
