import { desc, eq, inArray } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import db from "@/db/drizzle";
import { auditLog, product, rraStaff, rraStaffRole, transaction, transactionItem, user } from "@/db/schema";
import { hasOperationalRRAPermission, isRRARole } from "@/lib/rra-rbac";
import type { TickerItem, TickerRow } from "@/lib/types/admin-ticker";

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return Response.json({ error: "Sign in to view this activity." }, { status: 401 });
  if (session.user.isActive === false) return Response.json({ error: "This account is inactive." }, { status: 403 });

  try {
    const [staff] = await db.select({ id: rraStaff.id, clearanceLevel: rraStaff.clearanceLevel, isActive: rraStaff.isActive })
      .from(rraStaff).where(eq(rraStaff.userId, session.user.id)).limit(1);
    if (!staff?.isActive) return Response.json({ error: "RRA staff access is required." }, { status: 403 });

    const assignedRoles = await db.select({ role: rraStaffRole.role })
      .from(rraStaffRole).where(eq(rraStaffRole.staffRecordId, staff.id));
    const roles = (assignedRoles.length ? assignedRoles.map((row) => row.role) : [staff.clearanceLevel]).filter(isRRARole);
    if (!hasOperationalRRAPermission(roles, "transaction.read")) {
      await db.insert(auditLog).values({
        userId: session.user.id,
        action: "ACCESS_DENIED_MISSING_OPERATIONAL_PERMISSION",
        targetType: "rra_permission",
        metadata: JSON.stringify({ userRoles: roles, requiredPermission: "transaction.read", resource: "admin_ticker" }),
      });
      return Response.json({ error: "You do not have permission to view transaction activity." }, { status: 403 });
    }

    const recentTransactions = await db.select({
      id: transaction.id,
      businessName: user.businessName,
      tinNumber: user.tinNumber,
      totalAmount: transaction.totalAmount,
      vatAmount: transaction.vatAmount,
      status: transaction.status,
      createdAt: transaction.createdAt,
      productName: product.name,
      quantity: transaction.quantity,
      unitPrice: transaction.unitPrice,
    })
      .from(transaction)
      .innerJoin(user, eq(transaction.sellerId, user.id))
      .innerJoin(product, eq(transaction.productId, product.id))
      .orderBy(desc(transaction.createdAt))
      .limit(10);

    const transactionIds = recentTransactions.map((item) => item.id);
    const lineItems = transactionIds.length
      ? await db.select({
        id: transactionItem.id,
        transactionId: transactionItem.transactionId,
        productName: transactionItem.productName,
        quantity: transactionItem.quantity,
        unitPrice: transactionItem.unitPrice,
        totalPrice: transactionItem.totalPrice,
        vatAmount: transactionItem.vatAmount,
      }).from(transactionItem).where(inArray(transactionItem.transactionId, transactionIds))
      : [];
    const itemsByTransaction = new Map<string, TickerItem[]>();
    for (const item of lineItems) {
      const entries = itemsByTransaction.get(item.transactionId) ?? [];
      entries.push({
        id: item.id,
        productName: item.productName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
        vatAmount: item.vatAmount,
      });
      itemsByTransaction.set(item.transactionId, entries);
    }

    const rows: TickerRow[] = recentTransactions.map((item) => ({
      id: item.id,
      businessName: item.businessName ?? "Unknown business",
      tinNumber: item.tinNumber,
      totalAmount: item.totalAmount,
      vatAmount: item.vatAmount,
      status: item.status,
      createdAt: item.createdAt.toISOString(),
      items: itemsByTransaction.get(item.id) ?? [{
        id: item.id,
        productName: item.productName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.totalAmount,
        vatAmount: item.vatAmount,
      }],
    }));

    return Response.json(rows);
  } catch (error) {
    console.error("Admin transaction activity feed failed", {
      userId: session.user.id,
      errorName: error instanceof Error ? error.name : typeof error,
    });
    return Response.json({ error: "Transaction activity is temporarily unavailable." }, { status: 500 });
  }
}
