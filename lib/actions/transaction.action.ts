'use server';

import { eq, and, or, asc, desc, lt, sql } from 'drizzle-orm';
import db from '@/db/drizzle';
import { transaction, stock, stockMovement, stockReservation, vatRecord, product, user, auditLog, notification, customer, b2bOrderAcceptance } from '@/db/schema';
import {
  requireTraderSession,
  requireApprovedClearance,
  validateRoleCompatibility,
  type TraderRole,
} from '@/lib/auth-guard';
import { logAudit } from '@/lib/audit';
import { emitToUser } from '@/lib/realtime';
import { checkAndAlertCompliance } from '@/lib/actions/compliance.action';
import { getBusinessComplianceStatus } from '@/lib/compliance-status';
import { getSystemConfig } from '@/lib/actions/system-config.action';
import { validatePriceFloor } from '@/lib/ai/price-suggestion';
import { calculateVat } from '@/lib/intelligence/tax-engine';
import { assertVerifiedBusinessOwner } from '@/lib/b2b-authorization';

type ReservationReleaseStatus = 'released' | 'expired' | 'cancelled';

/** Caller must hold the transaction row lock before releasing its reservation. */
async function releaseStockReservation(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  txn: typeof transaction.$inferSelect,
  terminalStatus: ReservationReleaseStatus,
  actorUserId: string,
  reason: string,
): Promise<boolean> {
  const [reservation] = await tx.select().from(stockReservation)
    .where(eq(stockReservation.transactionId, txn.id)).for('update').limit(1);
  if (!reservation) return false; // Legacy pending transaction has no reserved quantity to release.
  if (reservation.status !== 'active') throw new Error(`Reservation ${reservation.id} is ${reservation.status}, not active.`);
  if (reservation.sellerId !== txn.sellerId || reservation.buyerId !== txn.buyerId
    || reservation.productId !== txn.productId || reservation.quantity !== txn.quantity) {
    throw new Error(`Reservation ${reservation.id} does not match transaction ${txn.id}`);
  }

  const [transitioned] = await tx.update(stockReservation).set({ status: terminalStatus, releasedAt: new Date() })
    .where(and(eq(stockReservation.id, reservation.id), eq(stockReservation.status, 'active')))
    .returning({ id: stockReservation.id });
  if (!transitioned) return false;

  const [sellerStock] = await tx.select().from(stock).where(and(
    eq(stock.businessId, reservation.sellerId), eq(stock.productId, reservation.productId),
  )).for('update').limit(1);
  if (!sellerStock) throw new Error(`Reserved inventory row missing for reservation ${reservation.id}`);
  const restored = sellerStock.quantity + reservation.quantity;
  await tx.update(stock).set({ quantity: restored }).where(eq(stock.id, sellerStock.id));
  await tx.insert(stockMovement).values({
    businessId: reservation.sellerId, productId: reservation.productId,
    quantityDelta: reservation.quantity, quantityBefore: sellerStock.quantity, quantityAfter: restored,
    movementType: 'sale_reservation_released', sourceType: 'stock_reservation', sourceId: reservation.id,
    actorUserId, reason,
  });
  return true;
}

function isRetryableTransactionError(error: unknown): boolean {
  const code = getDatabaseErrorCode(error);
  return code === '40P01' || code === '40001';
}

function getDatabaseErrorCode(error: unknown): string | null {
  const visited = new Set<object>();
  let current: unknown = error;
  for (let depth = 0; depth < 5 && typeof current === 'object' && current !== null && !visited.has(current); depth += 1) {
    visited.add(current);
    if ('code' in current && typeof current.code === 'string' && /^[0-9A-Z]{5}$/.test(current.code)) {
      return current.code;
    }
    current = 'cause' in current ? current.cause : null;
  }
  return null;
}

async function withTransactionRetry<T>(operation: () => Promise<T>): Promise<T> {
  const maxAttempts = 3;
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!isRetryableTransactionError(error) || attempt >= maxAttempts) throw error;
      await new Promise<void>((resolve) => setTimeout(resolve, attempt * 50));
    }
  }
}

function transactionActionFailure(error: unknown, action: 'confirm' | 'reject') {
  const safeMessages = new Set([
    'Transaction not found or already processed',
    'Only the verified business owner can accept this order. Representatives may confirm receipts only.',
    'The registered business owner must have a verified email, Taxpayer Identification Number, approved clearance, and active account.',
    'This transaction already has an order acceptance record.',
    'The transaction reservation does not match its commercial agreement; acceptance requires manual review.',
    'Seller no longer has sufficient stock',
    'The buyer confirmation window has expired. Reserved stock has been released.',
  ]);

  if (error instanceof Error && safeMessages.has(error.message)) {
    return { success: false as const, error: error.message };
  }

  const reference = crypto.randomUUID();
  console.error(`[TransactionAction:${action}:${reference}] Failed to process buyer decision`, {
    errorName: error instanceof Error ? error.name : typeof error,
    databaseCode: getDatabaseErrorCode(error),
  });
  return {
    success: false as const,
    error: `We could not ${action} this order. Contact support with reference ${reference}.`,
  };
}

async function runBuyerDecision<T>(
  action: 'confirm' | 'reject',
  operation: () => Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false; result: ReturnType<typeof transactionActionFailure> }> {
  try {
    return { ok: true, value: await operation() };
  } catch (error) {
    return { ok: false, result: transactionActionFailure(error, action) };
  }
}

// ---------------------------------------------------------------------------
// Auto-expire stale pending transactions
// ---------------------------------------------------------------------------

/**
 * Releases stale active reservations and expires legacy pending transactions.
 * Called lazily before queries and transaction actions; active pending pages
 * also refresh periodically so holds are released shortly after expiry.
 */
async function expireStalePendingTransactions(): Promise<void> {
  try {
    const now = new Date();
    const config = await getSystemConfig();
    const legacyCutoff = new Date(now.getTime() - config.buyerConfirmationWindowHours * 60 * 60 * 1000);
    const [legacyPending, expiredReservations] = await Promise.all([
      db.select({ id: transaction.id }).from(transaction)
        .where(and(eq(transaction.status, 'pending'), lt(transaction.createdAt, legacyCutoff))),
      db.select({ id: transaction.id }).from(transaction)
        .innerJoin(stockReservation, eq(stockReservation.transactionId, transaction.id))
        .where(and(eq(transaction.status, 'pending'), eq(stockReservation.status, 'active'), lt(stockReservation.expiresAt, now))),
    ]);
    const stalePendingIds = new Set([...legacyPending, ...expiredReservations].map(({ id }) => id));

    for (const id of stalePendingIds) {
      try {
        const expired = await withTransactionRetry(() => db.transaction(async (tx) => {
          const [lockedTxn] = await tx.select().from(transaction).where(eq(transaction.id, id)).for('update').limit(1);
          if (!lockedTxn || lockedTxn.status !== 'pending') return null;

          const [reservation] = await tx.select().from(stockReservation)
            .where(eq(stockReservation.transactionId, lockedTxn.id)).for('update').limit(1);
          if (reservation) {
            if (reservation.status !== 'active' || reservation.expiresAt > now) return null;
            const released = await releaseStockReservation(tx, lockedTxn, 'expired', lockedTxn.sellerId, 'Buyer confirmation window expired');
            if (!released) return null;
          } else if (lockedTxn.createdAt > legacyCutoff) {
            return null;
          }

          await tx.update(transaction).set({ status: 'expired' }).where(and(eq(transaction.id, lockedTxn.id), eq(transaction.status, 'pending')));
          await tx.insert(auditLog).values({
            userId: lockedTxn.sellerId, action: 'TRANSACTION_EXPIRED', targetType: 'transaction', targetId: lockedTxn.id,
            beforeState: { status: 'pending' }, afterState: { status: 'expired' },
            metadata: JSON.stringify({ reservationId: reservation?.id ?? null, reservationReleased: reservation?.status === 'active' }),
          });
          const [sellerNotification] = await tx.insert(notification).values({
            userId: lockedTxn.sellerId, type: 'txn_expired', title: 'Sale reservation expired',
            message: `Buyer confirmation expired for transaction ${lockedTxn.id}. Any reserved stock has been released.`,
            link: '/dashboard/pending',
          }).returning();
          const [buyerNotification] = lockedTxn.buyerId ? await tx.insert(notification).values({
            userId: lockedTxn.buyerId, type: 'txn_expired', title: 'Purchase request expired',
            message: `The confirmation window for transaction ${lockedTxn.id} expired. The seller may send a new request if stock remains available.`,
            link: '/dashboard/pending',
          }).returning() : [];
          return { txn: lockedTxn, sellerNotification, buyerNotification };
        }));
        if (expired) {
          try {
            emitToUser(expired.txn.sellerId, 'txn:expired', { transactionId: expired.txn.id });
            emitToUser(expired.txn.sellerId, 'notification', {
              id: expired.sellerNotification.id, type: expired.sellerNotification.type,
              title: expired.sellerNotification.title, message: expired.sellerNotification.message,
              link: expired.sellerNotification.link,
            });
            if (expired.txn.buyerId && expired.buyerNotification) {
              emitToUser(expired.txn.buyerId, 'txn:expired', { transactionId: expired.txn.id });
              emitToUser(expired.txn.buyerId, 'notification', {
                id: expired.buyerNotification.id, type: expired.buyerNotification.type,
                title: expired.buyerNotification.title, message: expired.buyerNotification.message,
                link: expired.buyerNotification.link,
              });
            }
          } catch (error) {
            console.error(`Transaction ${id} expired and stock was released, but realtime notification delivery failed`, error);
          }
        }
      } catch (error) {
        console.error(`Failed to expire pending transaction ${id}; reservation remains unchanged`, error);
      }
    }
  } catch (error) {
    // Log but don't block the page from loading
    console.error('Failed to expire stale pending transactions', error);
  }
}

// ---------------------------------------------------------------------------
// Create an atomic multi-product B2B sale with stock reservations
// ---------------------------------------------------------------------------

async function createSaleForConfirmationInternal(data: {
  buyerTin: string;
  items: Array<{ productId: string; quantity: number; unitPrice: number }>;
  transactionType?: 'STANDARD_B2B_SALE' | 'DIRECT_BULK_SALE';
  invoiceReference?: string;
  deliveryInformation?: { address?: string; schedule?: string; notes?: string };
}, setFailureStage: (stage: string) => void) {
  setFailureStage('verify seller clearance');
  const { suspended, clearanceStatus, ...session } = await requireApprovedClearance();
  if (suspended) throw new Error(`Your account is ${clearanceStatus}. Cannot create transactions.`);
  setFailureStage('expire stale sales');
  await expireStalePendingTransactions();
  const sellerRole = session.user.role as TraderRole;
  if (sellerRole === 'retailer') throw new Error('Retailers must use consumer sales instead.');
  if (!/^\d{9}$/.test(data.buyerTin)) throw new Error('Buyer TIN must contain exactly 9 digits.');
  if (!Array.isArray(data.items) || data.items.length === 0 || data.items.length > 100) {
    throw new Error('Add between 1 and 100 products to the sale.');
  }
  const itemIds = new Set<string>();
  for (const item of data.items) {
    if (!item.productId || itemIds.has(item.productId)) throw new Error('Each product can appear only once in a sale.');
    itemIds.add(item.productId);
    if (!Number.isFinite(item.quantity) || item.quantity <= 0 || !Number.isSafeInteger(item.unitPrice) || item.unitPrice <= 0) {
      throw new Error('Every quantity and unit price must be a positive valid amount.');
    }
  }
  if (data.invoiceReference !== undefined && (typeof data.invoiceReference !== 'string' || data.invoiceReference.length > 120)) {
    throw new Error('Invoice/reference number must be text with at most 120 characters.');
  }
  if (data.deliveryInformation !== undefined && (!data.deliveryInformation || typeof data.deliveryInformation !== 'object'
    || Array.isArray(data.deliveryInformation)
    || Object.values(data.deliveryInformation).some((value) => typeof value !== 'string' || value.length > 500))) {
    throw new Error('Delivery information fields must be text with at most 500 characters.');
  }

  setFailureStage('look up buyer');
  const [buyer] = await db.select().from(user).where(eq(user.tinNumber, data.buyerTin)).limit(1);
  if (!buyer) throw new Error('Buyer not found with that TIN.');
  if (buyer.id === session.user.id) throw new Error('Cannot sell to yourself.');
  if (!buyer.isActive) throw new Error('Buyer account is inactive.');
  if (!buyer.role) throw new Error('Buyer has no assigned role.');
  validateRoleCompatibility(sellerRole, buyer.role as TraderRole);
  if (buyer.clearanceStatus !== 'approved') throw new Error(`Buyer account is ${buyer.clearanceStatus}; RRA approval is required.`);

  setFailureStage('check tax compliance');
  const [sellerCompliance, buyerCompliance, config] = await Promise.all([
    getBusinessComplianceStatus(session.user.id), getBusinessComplianceStatus(buyer.id), getSystemConfig(),
  ]);
  if (!sellerCompliance.isCompliant) throw new Error(`You must pay at least ${sellerCompliance.threshold}% of your tax to sell. Current: ${sellerCompliance.compliancePct}%.`);
  if (!buyerCompliance.isCompliant) throw new Error(`Buyer has not met tax compliance (${buyerCompliance.compliancePct}% paid). They must pay at least ${buyerCompliance.threshold}% to purchase.`);

  setFailureStage('check product price and access');
  const validatedItems = await Promise.all(data.items.map(async (item) => {
    const priceCheck = await validatePriceFloor(item.productId, session.user.id, item.unitPrice);
    if (!priceCheck.valid) throw new Error(priceCheck.error ?? 'Price is below the AI-computed minimum.');
    const [details] = await db.select({ id: product.id, name: product.name })
      .from(product).innerJoin(stock, eq(stock.productId, product.id))
      .where(and(eq(product.id, item.productId), eq(stock.businessId, session.user.id))).limit(1);
    if (!details) throw new Error('A selected product is not in your authorized inventory.');
    const totalAmount = Math.round(item.quantity * item.unitPrice);
    if (!Number.isSafeInteger(totalAmount) || totalAmount <= 0) throw new Error('Sale total is outside the supported amount range.');
    const vatAmount = calculateVat({ amountRwf: totalAmount, rateBasisPoints: Math.round(config.vatRate * 10_000), pricingMode: 'exclusive' }).vatAmountRwf;
    return { ...item, name: details.name, totalAmount, vatAmount, priceCheck };
  }));

  const transactionType = data.transactionType ?? 'STANDARD_B2B_SALE';
  if (!['STANDARD_B2B_SALE', 'DIRECT_BULK_SALE'].includes(transactionType)) throw new Error('Invalid transaction type.');
  setFailureStage('reserve inventory and save sale');
  const expiresAt = new Date(Date.now() + config.buyerConfirmationWindowHours * 60 * 60 * 1000);
  const created = await withTransactionRetry(() => db.transaction(async (tx) => {
    setFailureStage('lock seller inventory');
    const lockedStocks = await tx.select().from(stock).where(and(
      eq(stock.businessId, session.user.id),
      or(...validatedItems.map((item) => eq(stock.productId, item.productId))),
    )).orderBy(asc(stock.productId)).for('update');
    const stockByProduct = new Map(lockedStocks.map((row) => [row.productId, row]));
    for (const item of validatedItems) {
      const row = stockByProduct.get(item.productId);
      if (!row || row.quantity < item.quantity) throw new Error(`Insufficient stock for ${item.name}. Available: ${row?.quantity ?? 0}.`);
    }

    const txns = [];
    for (const item of validatedItems) {
      const row = stockByProduct.get(item.productId)!;
      const quantityAfter = row.quantity - item.quantity;
      setFailureStage('save transaction');
      const [txn] = await tx.insert(transaction).values({
        sellerId: session.user.id, buyerId: buyer.id, productId: item.productId, transactionType,
        buyerType: transactionType === 'DIRECT_BULK_SALE' && (!buyer.businessType || buyer.businessType === 'registered_business')
          ? 'large_bulk_buyer' : buyer.businessType,
        invoiceReference: data.invoiceReference?.trim() || null,
        deliveryInformation: data.deliveryInformation ?? null, paymentStatus: 'unpaid',
        quantity: item.quantity, unitPrice: item.unitPrice, totalAmount: item.totalAmount,
        vatAmount: item.vatAmount, vatRateBasisPoints: Math.round(config.vatRate * 10_000),
        pricingMode: 'exclusive', status: 'pending',
      }).returning();
      setFailureStage('create stock reservation');
      const [reservation] = await tx.insert(stockReservation).values({
        transactionId: txn.id,
        productId: item.productId,
        quantity: item.quantity,
        sellerId: session.user.id,
        buyerId: buyer.id,
        status: 'active',
        expiresAt,
      }).returning({ id: stockReservation.id });
      if (!reservation) throw new Error('Could not create the stock reservation.');
      setFailureStage('deduct seller stock');
      await tx.update(stock).set({ quantity: quantityAfter }).where(eq(stock.id, row.id));
      setFailureStage('append stock movement');
      await tx.insert(stockMovement).values({
        businessId: session.user.id, productId: item.productId, quantityDelta: -item.quantity,
        quantityBefore: row.quantity, quantityAfter, movementType: 'sale_reservation',
        sourceType: 'stock_reservation', sourceId: reservation.id, actorUserId: session.user.id,
        reason: 'Held until buyer confirms or the request expires',
      });
      setFailureStage('write transaction audit');
      await tx.insert(auditLog).values({
        userId: session.user.id, action: 'TRANSACTION_CREATED', targetType: 'transaction', targetId: txn.id,
        metadata: JSON.stringify({ buyerId: buyer.id, buyerTin: data.buyerTin, productId: item.productId,
          quantity: item.quantity, totalAmount: item.totalAmount, vatAmount: item.vatAmount, status: 'pending',
          reservationId: reservation.id, expiresAt }),
      });
      if (item.priceCheck.suggestion.status !== 'no_data' && item.priceCheck.suggestion.ceiling > 0
        && item.unitPrice > item.priceCheck.suggestion.ceiling) {
        setFailureStage('write price review audit');
        await tx.insert(auditLog).values({
          userId: session.user.id, action: 'PRICE_ABOVE_CEILING', targetType: 'transaction', targetId: txn.id,
          metadata: JSON.stringify({ declaredPrice: item.unitPrice, ceiling: item.priceCheck.suggestion.ceiling,
            suggested: item.priceCheck.suggestion.suggested, district: item.priceCheck.suggestion.district }),
        });
      }
      txns.push(txn);
    }

    const total = validatedItems.reduce((sum, item) => sum + item.totalAmount + item.vatAmount, 0);
    const summary = validatedItems.map((item) => `${item.name}: ${item.quantity} × ${item.unitPrice.toLocaleString()} RWF (tax ${item.vatAmount.toLocaleString()} RWF)`).join('; ');
    setFailureStage('notify buyer');
    const [savedNotification] = await tx.insert(notification).values({
      userId: buyer.id, type: 'txn_incoming', title: 'New Purchase Confirmation Required',
      message: `${session.user.name} (TIN ${session.user.tinNumber ?? '—'}) sent ${summary}. Total incl. tax: ${total.toLocaleString()} RWF. References: ${txns.map((txn) => txn.id).join(', ')}. Confirm each item in Pending Confirmations by ${expiresAt.toLocaleString()}.`,
      link: '/dashboard/pending',
    }).returning();
    return { txns, savedNotification };
  }));

  try {
    for (const txn of created.txns) emitToUser(buyer.id, 'txn:incoming', {
      transactionId: txn.id, sellerName: session.user.name, productId: txn.productId,
      quantity: txn.quantity, totalAmount: txn.totalAmount, status: 'pending',
    });
    emitToUser(buyer.id, 'notification', {
      id: created.savedNotification.id, type: created.savedNotification.type,
      title: created.savedNotification.title, message: created.savedNotification.message,
      link: created.savedNotification.link,
    });
  } catch (error) {
    console.error('Sale and reservation were committed, but realtime notification delivery failed', error);
  }
  return created.txns;
}

type SaleCreationResult =
  | { success: true; transactions: Awaited<ReturnType<typeof createSaleForConfirmationInternal>> }
  | { success: false; error: string; reference: string };

/** Keep production action failures user-safe while returning a reference for support. */
export async function createSaleForConfirmation(data: {
  buyerTin: string;
  items: Array<{ productId: string; quantity: number; unitPrice: number }>;
  transactionType?: 'STANDARD_B2B_SALE' | 'DIRECT_BULK_SALE';
  invoiceReference?: string;
  deliveryInformation?: { address?: string; schedule?: string; notes?: string };
}): Promise<SaleCreationResult> {
  let failureStage = 'validate sale request';
  try {
    return { success: true, transactions: await createSaleForConfirmationInternal(data, (stage) => { failureStage = stage; }) };
  } catch (error) {
    const reference = crypto.randomUUID();
    const errorCode = getDatabaseErrorCode(error);
    console.error(`[sale-create:${reference}] Sale creation failed during ${failureStage} (${errorCode ?? 'server validation or unexpected error'})`);

    // Domain validation/auth errors are already safe messages created by this action.
    const message = error instanceof Error && [
      'Your account is', 'Retailers must', 'Buyer TIN must', 'Add between',
      'Each product', 'Every quantity', 'Invoice/reference', 'Delivery information',
      'Buyer not found', 'Cannot sell to yourself', 'Buyer account is', 'Buyer has no',
      'A ', 'The minimum price for this product', 'Price is below', 'Could not create the stock reservation',
      'Incompatible', 'You must pay at least', 'Buyer has not met tax compliance',
      'A selected product', 'Sale total is', 'Invalid transaction type', 'Insufficient stock',
    ].some((prefix) => error.message.startsWith(prefix))
      ? error.message
      : `Sale could not be saved during ${failureStage}. Reference ${reference}${errorCode ? ` (database code: ${errorCode})` : ''}.`;

    return { success: false, error: message, reference };
  }
}

// ---------------------------------------------------------------------------
// Create B2B Transaction (Manufacturer/Wholesaler → Buyer)
// ---------------------------------------------------------------------------

export async function createTransaction(data: {
  buyerTin: string; // TIN of the buyer
  productId: string;
  quantity: number;
  unitPrice: number; // RWF
  transactionType?: 'STANDARD_B2B_SALE' | 'DIRECT_BULK_SALE';
  invoiceReference?: string;
  deliveryInformation?: { address?: string; schedule?: string; notes?: string };
}) {
  const result = await createSaleForConfirmation({
    buyerTin: data.buyerTin,
    items: [{ productId: data.productId, quantity: data.quantity, unitPrice: data.unitPrice }],
    transactionType: data.transactionType,
    invoiceReference: data.invoiceReference,
    deliveryInformation: data.deliveryInformation,
  });
  if (!result.success) throw new Error(result.error);
  const [created] = result.transactions;
  if (!created) throw new Error('Sale could not be saved.');
  return created;
}

// ---------------------------------------------------------------------------
// Accept B2B order. VAT remains at its existing confirmation trigger; stock is
// credited only from separately recorded accepted receipt quantities.
// ---------------------------------------------------------------------------

export async function confirmTransaction(transactionId: string) {
  const { suspended, clearanceStatus, ...session } = await requireApprovedClearance();
  await requireTraderSession();

  if (suspended) {
    return { success: false as const, error: `Your account is ${clearanceStatus}. Cannot confirm transactions.` };
  }

  await expireStalePendingTransactions();

  const confirmationResult = await runBuyerDecision('confirm', () => withTransactionRetry(() => db.transaction(async (tx) => {
    // Serialize concurrent confirmations by locking the transaction row first.
    const [lockedTxn] = await tx
      .select()
      .from(transaction)
      .where(eq(transaction.id, transactionId))
      .for('update')
      .limit(1);

    if (!lockedTxn || !lockedTxn.buyerId || lockedTxn.status !== 'pending') {
      throw new Error('Transaction not found or already processed');
    }

    if (session.user.id !== lockedTxn.buyerId) {
      throw new Error('Only the verified business owner can accept this order. Representatives may confirm receipts only.');
    }
    await assertVerifiedBusinessOwner(tx, lockedTxn.buyerId);
    const actorAuthority = 'owner';
    const [existingAcceptance] = await tx.select({ id: b2bOrderAcceptance.id })
      .from(b2bOrderAcceptance).where(eq(b2bOrderAcceptance.transactionId, lockedTxn.id)).limit(1);
    if (existingAcceptance) throw new Error('This transaction already has an order acceptance record.');

    const [reservation] = await tx.select().from(stockReservation)
      .where(eq(stockReservation.transactionId, lockedTxn.id)).for('update').limit(1);
    if (reservation && reservation.status !== 'active') {
      throw new Error(`The transaction reservation is ${reservation.status}; acceptance requires manual review.`);
    }
    if (reservation && (
      reservation.quantity !== lockedTxn.quantity || reservation.productId !== lockedTxn.productId
      || reservation.sellerId !== lockedTxn.sellerId || reservation.buyerId !== lockedTxn.buyerId
    )) {
      throw new Error('The transaction reservation does not match its commercial agreement; acceptance requires manual review.');
    }
    if (reservation && reservation.expiresAt <= new Date()) {
      const reservationId = await releaseStockReservation(tx, lockedTxn, 'expired', session.user.id, 'Buyer confirmation window expired before confirmation');
      await tx.update(transaction).set({ status: 'expired' })
        .where(and(eq(transaction.id, lockedTxn.id), eq(transaction.status, 'pending')));
      await tx.insert(auditLog).values({
        userId: session.user.id, action: 'TRANSACTION_EXPIRED', targetType: 'transaction', targetId: lockedTxn.id,
        beforeState: { status: 'pending' }, afterState: { status: 'expired' },
        metadata: JSON.stringify({ reservationId, reservationReleased: Boolean(reservationId), expiredDuringConfirmation: true }),
      });
      const [savedNotification] = await tx.insert(notification).values({
        userId: lockedTxn.sellerId, type: 'txn_expired', title: 'Sale reservation expired',
        message: `The buyer confirmation window ended for transaction ${lockedTxn.id}. Reserved stock was released.`,
        link: '/dashboard/pending',
      }).returning();
      return { txn: lockedTxn, expired: true, savedNotification };
    }
    // The sale creation already removes reserved stock from seller availability.
    // Legacy pending rows without a reservation retain the historical seller
    // decrement here. No buyer stock is credited until receipt evidence exists.
    const [sellerStock] = await tx
      .select()
      .from(stock)
      .where(
        and(eq(stock.businessId, lockedTxn.sellerId), eq(stock.productId, lockedTxn.productId)),
      )
      .for('update');

    if (!sellerStock || (!reservation && sellerStock.quantity < lockedTxn.quantity)) {
      throw new Error('Seller no longer has sufficient stock');
    }

    const sellerQuantityAfter = reservation ? sellerStock.quantity : sellerStock.quantity - lockedTxn.quantity;
    if (!reservation) {
      await tx.update(stock).set({ quantity: sellerQuantityAfter }).where(eq(stock.id, sellerStock.id));
    }

    if (!reservation) {
      await tx.insert(stockMovement).values({
        businessId: lockedTxn.sellerId, productId: lockedTxn.productId,
        quantityDelta: -lockedTxn.quantity, quantityBefore: sellerStock.quantity, quantityAfter: sellerQuantityAfter,
        movementType: 'sale', sourceType: 'transaction', sourceId: lockedTxn.id, actorUserId: session.user.id,
      });
    }

    const [acceptance] = await tx.insert(b2bOrderAcceptance).values({
      transactionId: lockedTxn.id, buyerBusinessId: lockedTxn.buyerId, actorUserId: session.user.id,
    }).returning({ id: b2bOrderAcceptance.id, acceptedAt: b2bOrderAcceptance.acceptedAt });
    if (!acceptance) throw new Error('Order acceptance evidence could not be saved.');

    // 3. Create VAT output record (seller)
    await tx.insert(vatRecord).values({
      transactionId: lockedTxn.id,
      businessId: lockedTxn.sellerId,
      vatType: 'output',
      amount: lockedTxn.vatAmount,
    });

    // 4. Create VAT input record (buyer)
    await tx.insert(vatRecord).values({
      transactionId: lockedTxn.id,
      businessId: session.user.id,
      vatType: 'input',
      amount: lockedTxn.vatAmount,
    });

    // 5. Update transaction status
    const confirmed = await tx
      .update(transaction)
      .set({
        status: 'confirmed',
        confirmedAt: new Date(),
      })
      .where(and(eq(transaction.id, lockedTxn.id), eq(transaction.status, 'pending')))
      .returning({ id: transaction.id });

    if (confirmed.length !== 1) {
      throw new Error('Transaction was already processed');
    }

    await tx.insert(auditLog).values({
      userId: session.user.id,
      action: 'TRANSACTION_CONFIRMED',
      targetType: 'transaction',
      targetId: lockedTxn.id,
      beforeState: {
        status: 'pending',
        sellerStockQuantity: sellerStock.quantity,
        buyerStockQuantity: null,
      },
      afterState: {
        status: 'confirmed',
        sellerStockQuantity: sellerQuantityAfter,
        buyerStockQuantity: null,
        vatAmount: lockedTxn.vatAmount,
      },
      metadata: JSON.stringify({
        sellerId: lockedTxn.sellerId,
        quantity: lockedTxn.quantity,
        vatAmount: lockedTxn.vatAmount,
        eventType: 'b2b_order_accepted',
        acceptanceId: acceptance.id,
        acceptedAt: acceptance.acceptedAt,
        acceptedBy: actorAuthority,
        receiptRequiredForBuyerStockCredit: true,
        stockMovements: !reservation ? [{
            movementId: `${lockedTxn.id}:seller`,
            movementType: 'sale',
            businessId: lockedTxn.sellerId,
            productId: lockedTxn.productId,
            quantityDelta: -lockedTxn.quantity,
            quantityBefore: sellerStock.quantity,
            quantityAfter: sellerQuantityAfter,
          }] : [],
        stockCreditedToBuyer: 0,
        reservationId: reservation?.id ?? null,
      }),
    });

    const [savedNotification] = await tx.insert(notification).values({
      userId: lockedTxn.sellerId, type: 'txn_confirmed', title: 'Order accepted',
      message: `${session.user.name} accepted your order for ${lockedTxn.quantity} units. Dispatch and receipt are recorded separately.`,
      link: '/dashboard/pending',
    }).returning();
    return { txn: lockedTxn, savedNotification, expired: false };
  })));
  if (!confirmationResult.ok) return confirmationResult.result;
  const confirmation = confirmationResult.value;
  const { txn } = confirmation;

  if (confirmation.expired) {
    try {
      emitToUser(txn.sellerId, 'txn:expired', { transactionId: txn.id });
      emitToUser(txn.sellerId, 'notification', {
        id: confirmation.savedNotification.id, type: confirmation.savedNotification.type,
        title: confirmation.savedNotification.title, message: confirmation.savedNotification.message,
        link: confirmation.savedNotification.link,
      });
    } catch (error) {
      console.error('Expired reservation was released, but realtime notification delivery failed', error);
    }
    return { success: false as const, error: 'The buyer confirmation window has expired. Reserved stock has been released.' };
  }

  try {
    emitToUser(txn.sellerId, 'txn:confirmed', {
      transactionId: txn.id, buyerName: session.user.name, quantity: txn.quantity, totalAmount: txn.totalAmount,
    });
    emitToUser(txn.sellerId, 'notification', {
      id: confirmation.savedNotification.id, type: confirmation.savedNotification.type,
      title: confirmation.savedNotification.title, message: confirmation.savedNotification.message,
      link: confirmation.savedNotification.link,
    });
  } catch (error) {
    console.error('Transaction confirmed, but realtime notification delivery failed', error);
  }

  // Compliance alert auto-detection — check both seller and buyer
  try {
    await checkAndAlertCompliance(session.user.id);
  } catch (error) {
    console.error('Transaction confirmed, but post-confirmation compliance alerting failed', error);
  }

  return { success: true as const };
}

// ---------------------------------------------------------------------------
// Reject Transaction (Buyer rejects)
// ---------------------------------------------------------------------------

export async function rejectTransaction(transactionId: string) {
  const session = await requireTraderSession();
  await expireStalePendingTransactions();

  const rejectionResult = await runBuyerDecision('reject', () => withTransactionRetry(() => db.transaction(async (tx) => {
    const [lockedTxn] = await tx
      .select()
      .from(transaction)
      .where(eq(transaction.id, transactionId))
      .for('update')
      .limit(1);

    if (!lockedTxn || lockedTxn.buyerId !== session.user.id || lockedTxn.status !== 'pending') {
      throw new Error('Transaction not found or already processed');
    }

    const reservationId = await releaseStockReservation(tx, lockedTxn, 'released', session.user.id, 'Buyer rejected the pending transaction');

    const [rejected] = await tx
      .update(transaction)
      .set({ status: 'rejected' })
      .where(and(eq(transaction.id, lockedTxn.id), eq(transaction.status, 'pending')))
      .returning({ id: transaction.id });
    if (!rejected) throw new Error('Transaction was already processed');

    await tx.insert(auditLog).values({
      userId: session.user.id,
      action: 'TRANSACTION_REJECTED',
      targetType: 'transaction',
      targetId: lockedTxn.id,
      beforeState: { status: 'pending' },
      afterState: { status: 'rejected' },
      metadata: JSON.stringify({ sellerId: lockedTxn.sellerId, reservationId, reservationReleased: Boolean(reservationId) }),
    });

    const [savedNotification] = await tx.insert(notification).values({
      userId: lockedTxn.sellerId, type: 'txn_rejected', title: 'Sale rejected',
      message: `${session.user.name} rejected your sale.`, link: '/dashboard/pending',
    }).returning();
    return { txn: lockedTxn, savedNotification };
  })));
  if (!rejectionResult.ok) return rejectionResult.result;
  const rejection = rejectionResult.value;
  const { txn } = rejection;

  try {
    emitToUser(txn.sellerId, 'txn:rejected', { transactionId: txn.id, buyerName: session.user.name });
    emitToUser(txn.sellerId, 'notification', {
      id: rejection.savedNotification.id, type: rejection.savedNotification.type,
      title: rejection.savedNotification.title, message: rejection.savedNotification.message,
      link: rejection.savedNotification.link,
    });
  } catch (error) {
    console.error('Transaction rejected, but realtime notification delivery failed', error);
  }

  return { success: true as const };
}

// ---------------------------------------------------------------------------
// Seller cancels a pending transaction
// ---------------------------------------------------------------------------

export async function cancelTransaction(transactionId: string) {
  const session = await requireTraderSession();
  await expireStalePendingTransactions();
  const cancellation = await withTransactionRetry(() => db.transaction(async (tx) => {
    const [lockedTxn] = await tx.select().from(transaction).where(eq(transaction.id, transactionId)).for('update').limit(1);
    if (!lockedTxn || lockedTxn.sellerId !== session.user.id || lockedTxn.status !== 'pending') {
      throw new Error('Pending sale not found or already processed.');
    }

    const reservationId = await releaseStockReservation(tx, lockedTxn, 'cancelled', session.user.id, 'Seller cancelled before buyer confirmation');
    const [cancelled] = await tx.update(transaction).set({ status: 'cancelled' })
      .where(and(eq(transaction.id, lockedTxn.id), eq(transaction.status, 'pending'))).returning({ id: transaction.id });
    if (!cancelled) throw new Error('Pending sale was already processed.');

    await tx.insert(auditLog).values({
      userId: session.user.id, action: 'TRANSACTION_CANCELLED', targetType: 'transaction', targetId: lockedTxn.id,
      beforeState: { status: 'pending' }, afterState: { status: 'cancelled' },
      metadata: JSON.stringify({ buyerId: lockedTxn.buyerId, reservationId, reservationReleased: Boolean(reservationId) }),
    });
    if (lockedTxn.buyerId) {
      const [savedNotification] = await tx.insert(notification).values({
        userId: lockedTxn.buyerId, type: 'txn_cancelled', title: 'Purchase request cancelled',
        message: `${session.user.name} cancelled the pending purchase request (${lockedTxn.id}).`,
        link: '/dashboard/pending',
      }).returning();
      return { txn: lockedTxn, savedNotification };
    }
    return { txn: lockedTxn, savedNotification: null };
  }));
  const { txn } = cancellation;

  if (txn.buyerId && cancellation.savedNotification) {
    try {
      emitToUser(txn.sellerId, 'txn:cancelled', { transactionId: txn.id, buyerId: txn.buyerId });
      emitToUser(txn.buyerId, 'txn:cancelled', { transactionId: txn.id, sellerName: session.user.name });
      emitToUser(txn.buyerId, 'notification', {
        id: cancellation.savedNotification.id, type: cancellation.savedNotification.type,
        title: cancellation.savedNotification.title, message: cancellation.savedNotification.message,
        link: cancellation.savedNotification.link,
      });
    } catch (error) {
      console.error('Transaction cancelled but realtime notification could not be sent', error);
    }
  }
  return { success: true };
}

// ---------------------------------------------------------------------------
// Create Retail Sale (Retailer → Final Consumer)
// ---------------------------------------------------------------------------

export async function createRetailSale(data: {
  productId: string;
  quantity: number;
  unitPrice: number;
  customerName?: string;
  customerId?: string;
}) {
  const { suspended, clearanceStatus, ...session } = await requireApprovedClearance();

  if (suspended) {
    throw new Error(`Your account is ${clearanceStatus}. Cannot create sales.`);
  }

  // Only retailers can sell to consumers
  await requireTraderSession(['retailer']);

  if (!Number.isFinite(data.quantity) || data.quantity <= 0 || !Number.isSafeInteger(data.unitPrice) || data.unitPrice <= 0) {
    throw new Error('Quantity must be positive and finite, and unit price must be a positive whole-RWF amount');
  }

  if (data.customerId !== undefined && !/^[0-9a-f-]{36}$/i.test(data.customerId)) {
    throw new Error('Choose a valid saved customer.');
  }
  if (!data.customerId && (typeof data.customerName !== 'string' || !data.customerName.trim())) {
    throw new Error('Customer name is required for retail sales');
  }
  if (data.customerName && data.customerName.trim().length > 160) {
    throw new Error('Customer name must be 160 characters or fewer.');
  }

  const config = await getSystemConfig();
  // Persist whole-RWF amounts consistently with the integer database columns.
  const totalAmount = Math.round(data.quantity * data.unitPrice);
  if (totalAmount <= 0) throw new Error("Sale total must be at least 1 RWF after rounding");
  const vatCalculation = calculateVat({
    amountRwf: totalAmount,
    rateBasisPoints: Math.round(config.vatRate * 10_000),
    pricingMode: 'exclusive',
  });
  const vatAmount = vatCalculation.vatAmountRwf;

  // AI Price Floor enforcement — blocks underreporting
  const priceCheck = await validatePriceFloor(data.productId, session.user.id, data.unitPrice);
  if (!priceCheck.valid) {
    throw new Error(priceCheck.error ?? 'Price is below the AI-computed minimum.');
  }

  // Log if price is above ceiling (flagged for RRA review)
  if (
    priceCheck.suggestion.status !== 'no_data' &&
    priceCheck.suggestion.ceiling > 0 &&
    data.unitPrice > priceCheck.suggestion.ceiling
  ) {
    await logAudit({
      userId: session.user.id,
      action: 'PRICE_ABOVE_CEILING',
      targetType: 'transaction',
      targetId: data.productId,
      metadata: {
        declaredPrice: data.unitPrice,
        ceiling: priceCheck.suggestion.ceiling,
        suggested: priceCheck.suggestion.suggested,
        district: priceCheck.suggestion.district,
      },
    });
  }

  // Atomic: deduct stock + create transaction + create VAT record
  const result = await db.transaction(async (tx) => {
    const selectedCustomer = data.customerId
      ? (await tx.select({ id: customer.id, name: customer.name }).from(customer)
        .where(and(
          eq(customer.id, data.customerId),
          eq(customer.businessId, session.user.id),
          eq(customer.isActive, true),
        )).for('share').limit(1))[0]
      : undefined;
    if (data.customerId && !selectedCustomer) {
      throw new Error('Saved customer is unavailable. Refresh the page or choose another customer.');
    }
    const buyerName = selectedCustomer?.name ?? data.customerName?.trim();
    if (!buyerName) throw new Error('Customer name is required for retail sales.');

    // Deduct stock immediately (no confirmation needed)
    const [retailerStock] = await tx
      .select()
      .from(stock)
      .where(and(eq(stock.businessId, session.user.id), eq(stock.productId, data.productId)))
      .for('update')
      .limit(1);

    if (!retailerStock || retailerStock.quantity < data.quantity) {
      throw new Error(`Insufficient stock. Available: ${retailerStock?.quantity ?? 0}`);
    }

    await tx
      .update(stock)
      .set({ quantity: retailerStock.quantity - data.quantity })
      .where(eq(stock.id, retailerStock.id));

    // Create completed transaction
    const [txn] = await tx
      .insert(transaction)
      .values({
        sellerId: session.user.id,
        buyerId: null,
        buyerName,
        customerId: selectedCustomer?.id ?? null,
        transactionType: 'RETAIL_SALE',
        buyerType: 'individual_consumer',
        productId: data.productId,
        quantity: data.quantity,
        unitPrice: data.unitPrice,
        totalAmount,
        vatAmount,
        vatRateBasisPoints: Math.round(config.vatRate * 10_000),
        pricingMode: 'exclusive',
        status: 'completed',
        confirmedAt: new Date(),
      })
      .returning();

    await tx.insert(stockMovement).values({
      businessId: session.user.id,
      productId: data.productId,
      quantityDelta: -data.quantity,
      quantityBefore: retailerStock.quantity,
      quantityAfter: retailerStock.quantity - data.quantity,
      movementType: 'retail_sale',
      sourceType: 'transaction',
      sourceId: txn.id,
      actorUserId: session.user.id,
    });

    // Create VAT output record (retailer only — no buyer VAT for consumers)
    await tx.insert(vatRecord).values({
      transactionId: txn.id,
      businessId: session.user.id,
      vatType: 'output',
      amount: vatAmount,
    });

    await tx.insert(auditLog).values({
      userId: session.user.id,
      action: 'RETAIL_SALE_COMPLETED',
      targetType: 'transaction',
      targetId: txn.id,
      beforeState: { stockQuantity: retailerStock.quantity },
      afterState: { stockQuantity: retailerStock.quantity - data.quantity },
      metadata: JSON.stringify({
        movementId: `${txn.id}:retail-sale`,
        movementType: 'sale',
        businessId: session.user.id,
        productId: data.productId,
        quantityDelta: -data.quantity,
        quantityBefore: retailerStock.quantity,
        quantityAfter: retailerStock.quantity - data.quantity,
        quantity: data.quantity,
        totalAmount,
        vatAmount,
          customerId: selectedCustomer?.id ?? null,
      }),
    });

    return txn;
  });

  // Compliance alert auto-detection for retailer
  await checkAndAlertCompliance(session.user.id);

  return result;
}

// ---------------------------------------------------------------------------
// Query transactions
// ---------------------------------------------------------------------------

/**
 * Get outgoing transactions (where current user is the seller).
 */
export async function getOutgoingTransactions() {
  const session = await requireTraderSession();

  // Expire any stale pending transactions before querying
  await expireStalePendingTransactions();
  const config = await getSystemConfig();
  const rows = await db
    .select({
      id: transaction.id,
      buyerName: sql<string>`COALESCE(${user.businessName}, ${transaction.buyerName})`,
      buyerTin: user.tinNumber,
      productName: product.name,
      quantity: transaction.quantity,
      totalAmount: transaction.totalAmount,
      vatAmount: transaction.vatAmount,
      status: transaction.status,
      transactionType: transaction.transactionType,
      paymentStatus: transaction.paymentStatus,
      createdAt: transaction.createdAt,
      confirmedAt: transaction.confirmedAt,
      expiresAt: stockReservation.expiresAt,
    })
    .from(transaction)
    .leftJoin(user, eq(transaction.buyerId, user.id))
    .innerJoin(product, eq(transaction.productId, product.id))
    .leftJoin(stockReservation, eq(stockReservation.transactionId, transaction.id))
    .where(eq(transaction.sellerId, session.user.id))
    .orderBy(desc(transaction.createdAt));
  return rows.map((row) => ({
    ...row,
    expiresAt: row.expiresAt ?? new Date(row.createdAt.getTime() + config.buyerConfirmationWindowHours * 60 * 60 * 1000),
  }));
}

/**
 * Get incoming transactions (where current user is the buyer).
 */
export async function getIncomingTransactions() {
  const session = await requireTraderSession();

  // Expire any stale pending transactions before querying
  await expireStalePendingTransactions();
  const config = await getSystemConfig();
  const rows = await db
    .select({
      id: transaction.id,
      sellerName: user.businessName,
      sellerTin: user.tinNumber,
      productName: product.name,
      quantity: transaction.quantity,
      totalAmount: transaction.totalAmount,
      vatAmount: transaction.vatAmount,
      status: transaction.status,
      transactionType: transaction.transactionType,
      paymentStatus: transaction.paymentStatus,
      createdAt: transaction.createdAt,
      expiresAt: stockReservation.expiresAt,
    })
    .from(transaction)
    .innerJoin(user, eq(transaction.sellerId, user.id))
    .innerJoin(product, eq(transaction.productId, product.id))
    .leftJoin(stockReservation, eq(stockReservation.transactionId, transaction.id))
    .where(eq(transaction.buyerId, session.user.id))
    .orderBy(desc(transaction.createdAt));
  return rows.map((row) => ({
    ...row,
    expiresAt: row.expiresAt ?? new Date(row.createdAt.getTime() + config.buyerConfirmationWindowHours * 60 * 60 * 1000),
  }));
}

/**
 * Get a single transaction by ID (only if the user is a party to it).
 */
export async function getTransaction(transactionId: string) {
  const session = await requireTraderSession();

  const [txn] = await db
    .select()
    .from(transaction)
    .where(
      and(
        eq(transaction.id, transactionId),
        or(eq(transaction.sellerId, session.user.id), eq(transaction.buyerId, session.user.id)),
      ),
    )
    .limit(1);

  if (!txn) {
    throw new Error('Transaction not found');
  }

  return txn;
}

/** Record payment progress reported by either party after delivery is confirmed. */
export async function updateTransactionPaymentStatus(
  transactionId: string,
  paymentStatus: 'unpaid' | 'partial' | 'paid',
) {
  const session = await requireTraderSession();
  if (!['unpaid', 'partial', 'paid'].includes(paymentStatus)) throw new Error('Invalid payment status.');

  await db.transaction(async (tx) => {
    const [txn] = await tx.select().from(transaction).where(eq(transaction.id, transactionId)).for('update').limit(1);
    if (!txn || (txn.sellerId !== session.user.id && txn.buyerId !== session.user.id)) {
      throw new Error('Transaction not found.');
    }
    if (!['confirmed', 'completed'].includes(txn.status)) {
      throw new Error('Payment can be updated after the buyer confirms receipt.');
    }

    await tx.update(transaction).set({ paymentStatus }).where(eq(transaction.id, transactionId));
    await tx.insert(auditLog).values({
      userId: session.user.id,
      action: 'TRANSACTION_PAYMENT_STATUS_UPDATED',
      targetType: 'transaction',
      targetId: transactionId,
      beforeState: { paymentStatus: txn.paymentStatus },
      afterState: { paymentStatus },
    });
  });

  return { success: true };
}

// ---------------------------------------------------------------------------
// Lookup buyer by TIN (for sell-to-buyer form)
// ---------------------------------------------------------------------------

export async function lookupBuyer(buyerTin: string) {
  try {
    const session = await requireTraderSession();
    const sellerRole = session.user.role as TraderRole;

    if (!buyerTin || buyerTin.trim().length < 3) {
      return { error: 'Enter a valid TIN number' };
    }

    const [buyer] = await db
      .select({
        id: user.id,
        name: user.name,
        businessName: user.businessName,
        tinNumber: user.tinNumber,
        role: user.role,
        businessType: user.businessType,
        clearanceStatus: user.clearanceStatus,
        isActive: user.isActive,
      })
      .from(user)
      .where(eq(user.tinNumber, buyerTin.trim()))
      .limit(1);

    if (!buyer) {
      return { error: 'No business found with that TIN' };
    }

    if (!buyer.role) {
      return { error: 'Buyer has no assigned role' };
    }

    if (buyer.id === session.user.id) {
      return { error: 'Cannot sell to yourself' };
    }

    // Check role compatibility
    let isEligible = buyer.isActive;
    let compatibilityError = '';
    if (!buyer.isActive) compatibilityError = 'Buyer account is inactive.';
    try {
      validateRoleCompatibility(sellerRole, buyer.role);
    } catch (err) {
      isEligible = false;
      compatibilityError = err instanceof Error ? err.message : 'Incompatible roles';
    }

    // Tax compliance check for buyer
    let buyerCompliancePct = 0;
    let buyerTaxReason = '';
    try {
      const compliance = await getBusinessComplianceStatus(buyer.id);
      buyerCompliancePct = compliance.compliancePct;
      if (!compliance.isCompliant) {
        isEligible = false;
        buyerTaxReason = `Tax compliance: ${compliance.compliancePct}% (need ${compliance.threshold}%). Outstanding: ${compliance.outstanding.toLocaleString()} RWF`;
      }
    } catch {
      // Fail closed: a buyer must not be marked eligible unless their tax
      // compliance has been successfully verified.
      isEligible = false;
      buyerTaxReason = 'Could not verify buyer tax compliance. Please try again.';
    }

    return {
      id: buyer.id,
      name: buyer.name,
      businessName: buyer.businessName,
      tinNumber: buyer.tinNumber,
      role: buyer.role,
      businessType: buyer.businessType,
      clearanceStatus: buyer.clearanceStatus,
      isActive: buyer.isActive,
      compliancePct: buyerCompliancePct,
      isEligible: isEligible && buyer.clearanceStatus === 'approved',
      reason:
        compatibilityError ||
        buyerTaxReason ||
        (buyer.clearanceStatus !== 'approved' ? `Buyer clearance: ${buyer.clearanceStatus}` : ''),
    };
  } catch (err) {
    // Handle auth errors and other unexpected errors
    return {
      error: err instanceof Error ? err.message : 'Failed to lookup buyer',
    };
  }
}
