import { NextResponse } from 'next/server';
import { requireRRASession } from '@/lib/auth-guard';
import db from '@/db/drizzle';
import { transaction, transactionItem, user, product } from '@/db/schema';
import { desc, eq, inArray, sql } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export type TickerItem = {
  productName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  vatAmount: number;
};

export type TickerRow = {
  id: string;
  totalAmount: number;
  vatAmount: number;
  status: string;
  createdAt: string;
  businessName: string | null;
  tinNumber: string | null;
  items: TickerItem[];
};

export async function GET(): Promise<NextResponse> {
  try {
    await requireRRASession();

    // Priority order: failed/rejected first, then high-value, then most recent.
    // Surfaces actionable transactions over routine ones.
    const rows = await db
      .select({
        id: transaction.id,
        totalAmount: transaction.totalAmount,
        vatAmount: transaction.vatAmount,
        status: transaction.status,
        createdAt: transaction.createdAt,
        businessName: user.businessName,
        tinNumber: user.tinNumber,
        // Legacy single-product fallback fields
        legacyProductName: product.name,
        legacyQuantity: transaction.quantity,
        legacyUnitPrice: transaction.unitPrice,
      })
      .from(transaction)
      .leftJoin(user, eq(transaction.sellerId, user.id))
      .leftJoin(product, eq(transaction.productId, product.id))
      .orderBy(
        sql`CASE WHEN ${transaction.status} IN ('rejected', 'failed', 'cancelled') THEN 0 ELSE 1 END ASC`,
        desc(transaction.totalAmount),
        desc(transaction.createdAt),
      )
      .limit(10);

    if (rows.length === 0) {
      return NextResponse.json([]);
    }

    // Fetch all transaction_items for matched transactions in one query
    const txnIds = rows.map((r) => r.id);
    const allItems = await db
      .select({
        transactionId: transactionItem.transactionId,
        productName: transactionItem.productName,
        quantity: transactionItem.quantity,
        unitPrice: transactionItem.unitPrice,
        totalPrice: transactionItem.totalPrice,
        vatAmount: transactionItem.vatAmount,
      })
      .from(transactionItem)
      .where(inArray(transactionItem.transactionId, txnIds));

    // Group items by transactionId
    const itemsByTxn = new Map<string, TickerItem[]>();
    for (const item of allItems) {
      const list = itemsByTxn.get(item.transactionId) ?? [];
      list.push({
        productName: item.productName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
        vatAmount: item.vatAmount,
      });
      itemsByTxn.set(item.transactionId, list);
    }

    const result: TickerRow[] = rows.map((r) => {
      // Use transactionItem entries if they exist; otherwise fall back to
      // the legacy single-product fields on the transaction itself.
      const items: TickerItem[] = itemsByTxn.get(r.id) ?? (
        r.legacyProductName
          ? [{
              productName: r.legacyProductName,
              quantity: r.legacyQuantity,
              unitPrice: r.legacyUnitPrice,
              totalPrice: r.totalAmount,
              vatAmount: r.vatAmount,
            }]
          : []
      );

      return {
        id: r.id,
        totalAmount: r.totalAmount,
        vatAmount: r.vatAmount,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
        businessName: r.businessName ?? null,
        tinNumber: r.tinNumber ?? null,
        items,
      };
    });

    return NextResponse.json(result);
  } catch {
    return new NextResponse('Unauthorized', { status: 401 });
  }
}
