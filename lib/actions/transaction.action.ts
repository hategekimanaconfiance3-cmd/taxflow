'use server';

import { eq, and, or, asc, desc, lt, sql } from 'drizzle-orm';
import db from '@/db/drizzle';
import { transaction, stock, vatRecord, product, user, auditLog } from '@/db/schema';
import {
  requireTraderSession,
  requireApprovedClearance,
  validateRoleCompatibility,
  type TraderRole,
} from '@/lib/auth-guard';
import { logAudit } from '@/lib/audit';
import { emitToUser } from '@/lib/realtime';
import { createNotification } from '@/lib/notifications';
import { checkAndAlertCompliance } from '@/lib/actions/compliance.action';
import { getBusinessComplianceStatus } from '@/lib/compliance-status';
import { getSystemConfig } from '@/lib/actions/system-config.action';
import { validatePriceFloor } from '@/lib/ai/price-suggestion';
import { calculateVat } from '@/lib/intelligence/tax-engine';

/** Pending transactions expire after 10 minutes (ms). */
const PENDING_EXPIRY_MS = 10 * 60 * 1000;

function isRetryableTransactionError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) return false;
  return error.code === '40P01' || error.code === '40001';
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

// ---------------------------------------------------------------------------
// Auto-expire stale pending transactions
// ---------------------------------------------------------------------------

/**
 * Marks any pending transactions older than PENDING_EXPIRY_MS as "expired".
 * Called lazily before queries so no background cron is needed.
 */
async function expireStalePendingTransactions(): Promise<void> {
  const cutoff = new Date(Date.now() - PENDING_EXPIRY_MS);

  try {
    const expired = await db
      .update(transaction)
      .set({ status: 'expired' })
      .where(and(eq(transaction.status, 'pending'), lt(transaction.createdAt, cutoff)))
      .returning({ id: transaction.id, sellerId: transaction.sellerId, buyerId: transaction.buyerId });

    if (expired.length > 0) {
      console.log(`[expiry] Expired ${expired.length} stale pending transaction(s)`);
    }
  } catch (error) {
    // Log but don't block the page from loading
    console.error('Failed to expire stale pending transactions', error);
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
}) {
  const { suspended, clearanceStatus, ...session } = await requireApprovedClearance();

  if (suspended) {
    throw new Error(`Your account is ${clearanceStatus}. Cannot create transactions.`);
  }

  const sellerRole = session.user.role as TraderRole;

  if (sellerRole === 'retailer') {
    throw new Error('Retailers must use createRetailSale() for consumer sales.');
  }

  if (!Number.isFinite(data.quantity) || data.quantity <= 0 || !Number.isSafeInteger(data.unitPrice) || data.unitPrice <= 0) {
    throw new Error('Quantity must be positive and finite, and unit price must be a positive whole-RWF amount');
  }

  // Look up the buyer by TIN
  const [buyer] = await db.select().from(user).where(eq(user.tinNumber, data.buyerTin)).limit(1);

  if (!buyer) {
    throw new Error('Buyer not found with that TIN');
  }

  if (!buyer.role) {
    throw new Error('Buyer has no assigned role');
  }

  // Validate seller → buyer role compatibility
  validateRoleCompatibility(sellerRole, buyer.role);

  // Check buyer's clearance
  if (buyer.clearanceStatus !== 'approved') {
    throw new Error("Buyer's account is not approved by RRA");
  }

  // Tax compliance gate — seller must have paid >= 95% of tax
  const sellerCompliance = await getBusinessComplianceStatus(session.user.id);
  if (!sellerCompliance.isCompliant) {
    throw new Error(
      `You must pay at least ${sellerCompliance.threshold}% of your tax to sell. ` +
        `Current: ${sellerCompliance.compliancePct}% (outstanding: ${sellerCompliance.outstanding.toLocaleString()} RWF)`,
    );
  }

  // Tax compliance gate — buyer must have paid >= 95% of tax to restock
  const buyerCompliance = await getBusinessComplianceStatus(buyer.id);
  if (!buyerCompliance.isCompliant) {
    throw new Error(
      `Buyer has not met tax compliance (${buyerCompliance.compliancePct}% paid). ` +
        `They must pay at least ${buyerCompliance.threshold}% to purchase.`,
    );
  }

  // Check seller has enough stock (we don't deduct yet — only on confirmation)
  const [sellerStock] = await db
    .select()
    .from(stock)
    .where(and(eq(stock.businessId, session.user.id), eq(stock.productId, data.productId)))
    .limit(1);

  if (!sellerStock || sellerStock.quantity < data.quantity) {
    throw new Error(`Insufficient stock. Available: ${sellerStock?.quantity ?? 0}`);
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

  const txn = await withTransactionRetry(() => db.transaction(async (tx) => {
    const [txn] = await tx
      .insert(transaction)
      .values({
        sellerId: session.user.id,
        buyerId: buyer.id,
        productId: data.productId,
        quantity: data.quantity,
        unitPrice: data.unitPrice,
        totalAmount,
        vatAmount,
        status: 'pending',
      })
      .returning();

    await tx.insert(auditLog).values({
      userId: session.user.id,
      action: 'TRANSACTION_CREATED',
      targetType: 'transaction',
      targetId: txn.id,
      metadata: JSON.stringify({
        buyerId: buyer.id,
        buyerTin: data.buyerTin,
        productId: data.productId,
        quantity: data.quantity,
        totalAmount,
        vatAmount,
      }),
    });

    return txn;
  }));

  // Real-time: notify buyer of incoming transaction
  emitToUser(buyer.id, 'txn:incoming', {
    transactionId: txn.id,
    sellerName: session.user.name,
    productId: data.productId,
    quantity: data.quantity,
    totalAmount,
  });

  // Persist notification
  await createNotification({
    userId: buyer.id,
    type: 'txn_incoming',
    title: 'New incoming purchase',
    message: `${session.user.name} sent you ${data.quantity} units (${totalAmount.toLocaleString()} RWF). Please confirm.`,
    link: '/dashboard/pending',
  });

  return txn;
}

// ---------------------------------------------------------------------------
// Confirm Transaction (Buyer confirms receipt)
// ---------------------------------------------------------------------------

export async function confirmTransaction(transactionId: string) {
  const { suspended, clearanceStatus, ...session } = await requireApprovedClearance();

  if (suspended) {
    throw new Error(`Your account is ${clearanceStatus}. Cannot confirm transactions.`);
  }

  const txn = await withTransactionRetry(() => db.transaction(async (tx) => {
    // Serialize concurrent confirmations by locking the transaction row first.
    const [lockedTxn] = await tx
      .select()
      .from(transaction)
      .where(eq(transaction.id, transactionId))
      .for('update')
      .limit(1);

    if (!lockedTxn || lockedTxn.buyerId !== session.user.id || lockedTxn.status !== 'pending') {
      throw new Error('Transaction not found or already processed');
    }

    // Lock both stock rows in business ID order so opposing transfers acquire
    // inventory locks consistently and reduce deadlock risk.
    const lockedStocks = await tx
      .select()
      .from(stock)
      .where(
        and(
          or(eq(stock.businessId, lockedTxn.sellerId), eq(stock.businessId, session.user.id)),
          eq(stock.productId, lockedTxn.productId),
        ),
      )
      .orderBy(asc(stock.businessId))
      .for('update');
    const sellerStock = lockedStocks.find((row) => row.businessId === lockedTxn.sellerId);
    const buyerStock = lockedStocks.find((row) => row.businessId === session.user.id);

    if (!sellerStock || sellerStock.quantity < lockedTxn.quantity) {
      throw new Error('Seller no longer has sufficient stock');
    }

    await tx
      .update(stock)
      .set({ quantity: sellerStock.quantity - lockedTxn.quantity })
      .where(eq(stock.id, sellerStock.id));

    // 2. Add/upsert buyer stock
    if (buyerStock) {
      await tx
        .update(stock)
        .set({ quantity: buyerStock.quantity + lockedTxn.quantity })
        .where(eq(stock.id, buyerStock.id));
    } else {
      await tx
        .insert(stock)
        .values({
          businessId: session.user.id,
          productId: lockedTxn.productId,
          quantity: lockedTxn.quantity,
        })
        .onConflictDoUpdate({
          target: [stock.businessId, stock.productId],
          set: { quantity: sql`${stock.quantity} + ${lockedTxn.quantity}` },
        });
    }

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
        buyerStockQuantity: buyerStock?.quantity ?? 0,
      },
      afterState: {
        status: 'confirmed',
        sellerStockQuantity: sellerStock.quantity - lockedTxn.quantity,
        buyerStockQuantity: (buyerStock?.quantity ?? 0) + lockedTxn.quantity,
        vatAmount: lockedTxn.vatAmount,
      },
      metadata: JSON.stringify({
        sellerId: lockedTxn.sellerId,
        quantity: lockedTxn.quantity,
        vatAmount: lockedTxn.vatAmount,
        stockMovements: [
          {
            movementId: `${lockedTxn.id}:seller`,
            movementType: 'sale',
            businessId: lockedTxn.sellerId,
            productId: lockedTxn.productId,
            quantityDelta: -lockedTxn.quantity,
            quantityBefore: sellerStock.quantity,
            quantityAfter: sellerStock.quantity - lockedTxn.quantity,
          },
          {
            movementId: `${lockedTxn.id}:buyer`,
            movementType: 'purchase',
            businessId: session.user.id,
            productId: lockedTxn.productId,
            quantityDelta: lockedTxn.quantity,
            quantityBefore: buyerStock?.quantity ?? 0,
            quantityAfter: (buyerStock?.quantity ?? 0) + lockedTxn.quantity,
          },
        ],
      }),
    });

    return lockedTxn;
  }));

  // Real-time: notify seller that their sale was confirmed
  emitToUser(txn.sellerId, 'txn:confirmed', {
    transactionId: txn.id,
    buyerName: session.user.name,
    quantity: txn.quantity,
    totalAmount: txn.totalAmount,
  });

  // Persist notification
  await createNotification({
    userId: txn.sellerId,
    type: 'txn_confirmed',
    title: 'Sale confirmed',
    message: `${session.user.name} confirmed your sale of ${txn.quantity} units.`,
    link: '/dashboard/pending',
  });

  // Compliance alert auto-detection — check both seller and buyer
  await checkAndAlertCompliance(session.user.id);

  return { success: true };
}

// ---------------------------------------------------------------------------
// Reject Transaction (Buyer rejects)
// ---------------------------------------------------------------------------

export async function rejectTransaction(transactionId: string) {
  const session = await requireTraderSession();

  const txn = await withTransactionRetry(() => db.transaction(async (tx) => {
    const [lockedTxn] = await tx
      .select()
      .from(transaction)
      .where(eq(transaction.id, transactionId))
      .for('update')
      .limit(1);

    if (!lockedTxn || lockedTxn.buyerId !== session.user.id || lockedTxn.status !== 'pending') {
      throw new Error('Transaction not found or already processed');
    }

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
      metadata: JSON.stringify({ sellerId: lockedTxn.sellerId }),
    });

    return lockedTxn;
  }));

  // Real-time: notify seller that their sale was rejected
  emitToUser(txn.sellerId, 'txn:rejected', {
    transactionId: txn.id,
    buyerName: session.user.name,
  });

  // Persist notification
  await createNotification({
    userId: txn.sellerId,
    type: 'txn_rejected',
    title: 'Sale rejected',
    message: `${session.user.name} rejected your sale.`,
    link: '/dashboard/pending',
  });

  return { success: true };
}

// ---------------------------------------------------------------------------
// Create Retail Sale (Retailer → Final Consumer)
// ---------------------------------------------------------------------------

export async function createRetailSale(data: {
  productId: string;
  quantity: number;
  unitPrice: number;
  customerName: string;
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

  if (!data.customerName.trim()) {
    throw new Error('Customer name is required for retail sales');
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
        buyerName: data.customerName.trim(),
        productId: data.productId,
        quantity: data.quantity,
        unitPrice: data.unitPrice,
        totalAmount,
        vatAmount,
        status: 'completed',
        confirmedAt: new Date(),
      })
      .returning();

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

  return db
    .select({
      id: transaction.id,
      buyerName: sql<string>`COALESCE(${user.businessName}, ${transaction.buyerName})`,
      buyerTin: user.tinNumber,
      productName: product.name,
      quantity: transaction.quantity,
      totalAmount: transaction.totalAmount,
      vatAmount: transaction.vatAmount,
      status: transaction.status,
      createdAt: transaction.createdAt,
      confirmedAt: transaction.confirmedAt,
    })
    .from(transaction)
    .leftJoin(user, eq(transaction.buyerId, user.id))
    .innerJoin(product, eq(transaction.productId, product.id))
    .where(eq(transaction.sellerId, session.user.id))
    .orderBy(desc(transaction.createdAt));
}

/**
 * Get incoming transactions (where current user is the buyer).
 */
export async function getIncomingTransactions() {
  const session = await requireTraderSession();

  // Expire any stale pending transactions before querying
  await expireStalePendingTransactions();

  return db
    .select({
      id: transaction.id,
      sellerName: user.businessName,
      sellerTin: user.tinNumber,
      productName: product.name,
      quantity: transaction.quantity,
      totalAmount: transaction.totalAmount,
      vatAmount: transaction.vatAmount,
      status: transaction.status,
      createdAt: transaction.createdAt,
    })
    .from(transaction)
    .innerJoin(user, eq(transaction.sellerId, user.id))
    .innerJoin(product, eq(transaction.productId, product.id))
    .where(eq(transaction.buyerId, session.user.id))
    .orderBy(desc(transaction.createdAt));
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
        clearanceStatus: user.clearanceStatus,
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
    let isEligible = true;
    let compatibilityError = '';
    try {
      validateRoleCompatibility(sellerRole, buyer.role);
    } catch (err) {
      isEligible = false;
      compatibilityError = err instanceof Error ? err.message : 'Incompatible roles';
    }

    // Tax compliance check for buyer
    let buyerCompliancePct = 100;
    let buyerTaxReason = '';
    try {
      const compliance = await getBusinessComplianceStatus(buyer.id);
      buyerCompliancePct = compliance.compliancePct;
      if (!compliance.isCompliant) {
        isEligible = false;
        buyerTaxReason = `Tax compliance: ${compliance.compliancePct}% (need ${compliance.threshold}%). Outstanding: ${compliance.outstanding.toLocaleString()} RWF`;
      }
    } catch {
      // If compliance check fails, don't block — just report clearance
    }

    return {
      id: buyer.id,
      name: buyer.name,
      businessName: buyer.businessName,
      tinNumber: buyer.tinNumber,
      role: buyer.role,
      clearanceStatus: buyer.clearanceStatus,
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
