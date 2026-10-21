"use server";

import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import db from "@/db/drizzle";
import {
  dispute,
  importDeclaration,
  product,
  stock,
  stockMovement,
  supportTicket,
  taxPayment,
  transaction,
  user,
  vatRecord,
} from "@/db/schema";
import { requireRRASession, type RRARole } from "@/lib/auth-guard";
import { logAudit } from "@/lib/audit";

const traderRoles = ["manufacturer", "wholesaler", "retailer"] as const;
const tinSchema = z.string().trim().min(5).max(32).regex(/^[A-Za-z0-9-]+$/);

type LookupData = {
  profile: {
    id: string;
    name: string;
    businessName: string | null;
    tinNumber: string | null;
    role: string | null;
    clearanceStatus: string | null;
    registeredAt: Date;
    phoneNumber?: string | null;
    email?: string;
  };
  staffRoles: RRARole[];
  financial?: {
    vatOutput: number;
    vatInput: number;
    netVatDue: number;
    confirmedPayments: number;
    paymentCount: number;
    outstanding: number;
  };
  payments?: Array<{ amount: number; status: string; method: string; reference: string | null; createdAt: Date }>;
  supportRequests?: Array<{ subject: string; status: string; priority: string; createdAt: Date }>;
  transactions?: Array<{ productName: string; quantity: number; totalAmount: number; vatAmount: number; status: string; createdAt: Date }>;
  imports?: Array<{ declarationRef: string | null; productName: string; expectedQuantity: number; actualQuantity: number | null; status: string; customsRef: string | null; createdAt: Date }>;
  disputes?: Array<{ referenceNumber: string; status: string; reason: string; createdAt: Date }>;
  stock?: Array<{ productName: string; unit: string; quantity: number; price: number | null; source: string | null }>;
  corrections?: Array<{ productName: string; movementType: string; quantityDelta: number; reason: string | null; createdAt: Date }>;
};

function roleHasAccess(roles: RRARole[], permitted: RRARole[]) {
  return roles.some((role) => permitted.includes(role));
}

async function buildLookup(tin: string, staffRoles: RRARole[]): Promise<LookupData | null> {
  const [trader] = await db.select({
    id: user.id,
    name: user.name,
    businessName: user.businessName,
    tinNumber: user.tinNumber,
    role: user.role,
    clearanceStatus: user.clearanceStatus,
    registeredAt: user.createdAt,
    phoneNumber: user.phoneNumber,
    email: user.email,
  }).from(user).where(and(eq(user.tinNumber, tin), sql`${user.role} IN ('manufacturer', 'wholesaler', 'retailer')`)).limit(1);

  if (!trader) return null;

  const canSeeContact = roleHasAccess(staffRoles, ["super_admin", "compliance_officer"]);
  const profile: LookupData["profile"] = {
    id: trader.id,
    name: trader.name,
    businessName: trader.businessName,
    tinNumber: trader.tinNumber,
    role: trader.role,
    clearanceStatus: trader.clearanceStatus,
    registeredAt: trader.registeredAt,
    ...(canSeeContact ? { phoneNumber: trader.phoneNumber, email: trader.email } : {}),
  };

  const result: LookupData = { profile, staffRoles };
  const canSeeTax = roleHasAccess(staffRoles, ["super_admin", "compliance_officer", "reporting_officer"]);
  const canSeeTransactions = roleHasAccess(staffRoles, ["super_admin", "compliance_officer", "audit_officer"]);
  const canSeeImports = roleHasAccess(staffRoles, ["super_admin", "compliance_officer", "audit_officer", "stock_officer"]);
  const canSeeStock = roleHasAccess(staffRoles, ["super_admin", "stock_officer", "correction_officer", "audit_officer"]);

  if (canSeeTax) {
    const [vatRows, paymentSummary] = await Promise.all([
      db.select({ vatType: vatRecord.vatType, total: sql<number>`COALESCE(SUM(${vatRecord.amount}), 0)::float8`.as("total") })
        .from(vatRecord).where(and(eq(vatRecord.businessId, trader.id), eq(vatRecord.isFrozen, false))).groupBy(vatRecord.vatType),
      db.select({ total: sql<number>`COALESCE(SUM(${taxPayment.amount}), 0)::float8`.as("total"), count: sql<number>`COUNT(*)::int`.as("count") })
        .from(taxPayment).where(and(eq(taxPayment.businessId, trader.id), eq(taxPayment.status, "confirmed"))),
    ]);
    const vatOutput = Number(vatRows.find((row) => row.vatType === "output")?.total ?? 0);
    const vatInput = Number(vatRows.find((row) => row.vatType === "input")?.total ?? 0);
    const confirmedPayments = Number(paymentSummary[0]?.total ?? 0);
    const netVatDue = Math.max(0, vatOutput - vatInput);
    result.financial = {
      vatOutput,
      vatInput,
      netVatDue,
      confirmedPayments,
      paymentCount: Number(paymentSummary[0]?.count ?? 0),
      outstanding: Math.max(0, netVatDue - confirmedPayments),
    };
  }

  if (roleHasAccess(staffRoles, ["compliance_officer", "super_admin"])) {
    const [payments, tickets] = await Promise.all([
      db.select({ amount: taxPayment.amount, status: taxPayment.status, method: taxPayment.method, reference: taxPayment.reference, createdAt: taxPayment.createdAt })
        .from(taxPayment).where(eq(taxPayment.businessId, trader.id)).orderBy(desc(taxPayment.createdAt)).limit(10),
      db.select({ subject: supportTicket.subject, status: supportTicket.status, priority: supportTicket.priority, createdAt: supportTicket.createdAt })
        .from(supportTicket).where(eq(supportTicket.traderId, trader.id)).orderBy(desc(supportTicket.createdAt)).limit(10),
    ]);
    result.payments = payments;
    result.supportRequests = tickets;
  }

  if (canSeeTransactions) {
    result.transactions = await db.select({
      productName: product.name,
      quantity: transaction.quantity,
      totalAmount: transaction.totalAmount,
      vatAmount: transaction.vatAmount,
      status: transaction.status,
      createdAt: transaction.createdAt,
    }).from(transaction).innerJoin(product, eq(transaction.productId, product.id))
      .where(eq(transaction.sellerId, trader.id)).orderBy(desc(transaction.createdAt)).limit(20);
  }

  if (canSeeImports) {
    result.imports = await db.select({
      declarationRef: importDeclaration.declarationRef,
      productName: product.name,
      expectedQuantity: importDeclaration.expectedQuantity,
      actualQuantity: importDeclaration.actualQuantity,
      status: importDeclaration.status,
      customsRef: importDeclaration.customsRef,
      createdAt: importDeclaration.createdAt,
    }).from(importDeclaration).innerJoin(product, eq(importDeclaration.productId, product.id))
      .where(eq(importDeclaration.businessId, trader.id)).orderBy(desc(importDeclaration.createdAt)).limit(20);
  }

  if (canSeeStock) {
    result.stock = await db.select({ productName: product.name, unit: product.unit, quantity: stock.quantity, price: stock.price, source: stock.source })
      .from(stock).innerJoin(product, eq(stock.productId, product.id)).where(eq(stock.businessId, trader.id)).orderBy(product.name).limit(100);
  }

  if (roleHasAccess(staffRoles, ["audit_officer", "super_admin"])) {
    result.disputes = await db.select({ referenceNumber: dispute.referenceNumber, status: dispute.status, reason: dispute.reason, createdAt: dispute.createdAt })
      .from(dispute).where(eq(dispute.filedById, trader.id)).orderBy(desc(dispute.createdAt)).limit(20);
  }

  if (roleHasAccess(staffRoles, ["correction_officer", "super_admin"])) {
    result.corrections = await db.select({
      productName: product.name,
      movementType: stockMovement.movementType,
      quantityDelta: stockMovement.quantityDelta,
      reason: stockMovement.reason,
      createdAt: stockMovement.createdAt,
    }).from(stockMovement).innerJoin(product, eq(stockMovement.productId, product.id))
      .where(and(eq(stockMovement.businessId, trader.id), sql`${stockMovement.movementType} IN ('correction', 'correction_void')`))
      .orderBy(desc(stockMovement.createdAt)).limit(50);
  }

  return result;
}

/** Exact TIN lookup with data returned only for the authenticated RRA role's remit. */
export async function lookupTraderByTin(input: string) {
  const { staff } = await requireRRASession();
  const parsedTin = tinSchema.safeParse(input);
  if (!parsedTin.success) throw new Error("Enter a valid TIN using 5 to 32 letters, numbers, or hyphens.");

  const tin = parsedTin.data;
  const staffRoles = staff.clearanceRoles as RRARole[];
  const result = await buildLookup(tin, staffRoles);
  if (result) {
    await logAudit({
      userId: staff.userId,
      action: "TRADER_TIN_LOOKUP",
      targetType: "user",
      targetId: result.profile.id,
      metadata: { searchedTin: tin, staffRoles },
    });
  }
  return result;
}

/** ID-based rendering for links from the dashboard search, using the same role scope. */
export async function getTraderLookupById(traderId: string) {
  const { staff } = await requireRRASession();
  if (!z.string().uuid().safeParse(traderId).success) return null;
  const [match] = await db.select({ tinNumber: user.tinNumber }).from(user)
    .where(and(eq(user.id, traderId), sql`${user.role} IN ('manufacturer', 'wholesaler', 'retailer')`)).limit(1);
  if (!match?.tinNumber) return null;
  const staffRoles = staff.clearanceRoles as RRARole[];
  const result = await buildLookup(match.tinNumber, staffRoles);
  if (result) {
    await logAudit({ userId: staff.userId, action: "TRADER_TIN_LOOKUP", targetType: "user", targetId: result.profile.id,
      metadata: { searchedTin: match.tinNumber, staffRoles, source: "dashboard_search" } });
  }
  return result;
}
