"use server";

import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import db from "@/db/drizzle";
import {
  auditLog,
  dispute,
  importDeclaration,
  product,
  productionBatch,
  rraCase,
  stock,
  stockMovement,
  supportTicket,
  taxPayment,
  transaction,
  user,
  vatRecord,
} from "@/db/schema";
import { requireRRAPermission } from "@/lib/auth-guard";
import { logAudit } from "@/lib/audit";
import { hasRRAPermission, type RRARole } from "@/lib/rra-rbac";
import { randomUUID } from "node:crypto";

// ---------------------------------------------------------------------------
// Permission helpers
// ---------------------------------------------------------------------------

function roleHasPermission(
  roles: RRARole[],
  permission: Parameters<typeof hasRRAPermission>[1],
): boolean {
  return roles.some(
    (role) => role !== "super_admin" && hasRRAPermission(role, permission),
  );
}

// ---------------------------------------------------------------------------
// Permission map returned to the client
// ---------------------------------------------------------------------------

export interface MerchantPermissions {
  canViewProfile: boolean;
  canEditProfile: boolean;
  canViewTax: boolean;
  canViewTransactions: boolean;
  canViewPayments: boolean;
  canReconcilePayments: boolean;
  canViewStock: boolean;
  canCorrectStock: boolean;
  canViewImports: boolean;
  canReviewImports: boolean;
  canManageDisputes: boolean;
  canManageCases: boolean;
  canViewAuditTrail: boolean;
  canManageSupport: boolean;
}

// ---------------------------------------------------------------------------
// Data shape
// ---------------------------------------------------------------------------

export type MerchantProfile = {
  id: string;
  name: string;
  businessName: string | null;
  tinNumber: string | null;
  role: string | null;
  clearanceStatus: string | null;
  phoneNumber?: string | null;
  email?: string | null;
  registeredAt: string;
  updatedAt: string;
};

export type MerchantFinancial = {
  vatOutput: number;
  vatInput: number;
  netVatDue: number;
  confirmedPayments: number;
  paymentCount: number;
  outstanding: number;
};

export type MerchantTransaction = {
  id: string;
  productName: string;
  quantity: number;
  totalAmount: number;
  vatAmount: number;
  status: string;
  createdAt: string;
};

export type MerchantPayment = {
  id: string;
  amount: number;
  status: string;
  method: string;
  reference: string | null;
  createdAt: string;
};

export type MerchantVatRecord = {
  id: string;
  vatType: string;
  amount: number;
  period: string | null;
  createdAt: string;
};

export type MerchantStockItem = {
  id: string;
  productName: string;
  unit: string;
  quantity: number;
  price: number | null;
  source: string | null;
};

export type MerchantStockMovement = {
  id: string;
  productName: string;
  movementType: string;
  quantityDelta: number;
  quantityBefore: number;
  quantityAfter: number;
  sourceType: string | null;
  reason: string | null;
  createdAt: string;
};

export type MerchantProductionBatch = {
  id: string;
  batchReference: string;
  productName: string;
  quantity: number;
  status: string | null;
  validationStatus: string;
  periodStart: string;
  periodEnd: string;
  createdAt: string;
};

export type MerchantImport = {
  id: string;
  declarationRef: string | null;
  productName: string;
  expectedQuantity: number;
  actualQuantity: number | null;
  status: string;
  customsRef: string | null;
  createdAt: string;
};

export type MerchantDispute = {
  id: string;
  referenceNumber: string;
  status: string;
  reason: string;
  createdAt: string;
};

export type MerchantCase = {
  id: string;
  title: string;
  status: string;
  priority: string;
  createdAt: string;
  updatedAt: string;
};

export type MerchantSupportTicket = {
  id: string;
  subject: string;
  status: string;
  priority: string;
  createdAt: string;
};

export type MerchantAuditEntry = {
  id: string;
  action: string;
  targetType: string | null;
  createdAt: string;
};

export interface MerchantProfileData {
  profile: MerchantProfile;
  permissions: MerchantPermissions;
  staffRoles: RRARole[];
  financial?: MerchantFinancial;
  vatRecords?: MerchantVatRecord[];
  transactions?: MerchantTransaction[];
  payments?: MerchantPayment[];
  stock?: MerchantStockItem[];
  stockMovements?: MerchantStockMovement[];
  production?: MerchantProductionBatch[];
  imports?: MerchantImport[];
  disputes?: MerchantDispute[];
  cases?: MerchantCase[];
  supportTickets?: MerchantSupportTicket[];
  auditHistory?: MerchantAuditEntry[];
}

// ---------------------------------------------------------------------------
// Main loader
// ---------------------------------------------------------------------------

export async function getMerchantProfileById(
  traderId: string,
): Promise<MerchantProfileData | null> {
  // Auth — any RRA staff with taxpayer.intelligence.search can open the profile.
  // Module-level data is then scoped by role.
  let actor: Awaited<ReturnType<typeof requireRRAPermission>>["user"];
  let staff: Awaited<ReturnType<typeof requireRRAPermission>>["staff"];
  try {
    const session = await requireRRAPermission("taxpayer.intelligence.search");
    actor = session.user;
    staff = session.staff;
  } catch (authErr) {
    if (authErr instanceof Error) throw authErr;
    throw new Error("You are not authorised to access merchant profiles.");
  }

  if (!z.string().uuid().safeParse(traderId).success) return null;

  // Load trader row
  const [trader] = await db
    .select({
      id: user.id,
      name: user.name,
      businessName: user.businessName,
      tinNumber: user.tinNumber,
      role: user.role,
      clearanceStatus: user.clearanceStatus,
      phoneNumber: user.phoneNumber,
      email: user.email,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    })
    .from(user)
    .where(
      and(
        eq(user.id, traderId),
        sql`${user.role} IN ('manufacturer', 'wholesaler', 'retailer')`,
      ),
    )
    .limit(1);

  if (!trader) return null;

  const staffRoles = staff.clearanceRoles as RRARole[];

  // Build permission map — super_admin is NOT a data-access bypass here.
  const perm: MerchantPermissions = {
    canViewProfile: true, // already enforced: any staff with search perm
    canEditProfile:
      roleHasPermission(staffRoles, "taxpayer.compliance.read") ||
      staffRoles.includes("compliance_officer" as RRARole) ||
      staffRoles.includes("tax_compliance_officer" as RRARole),
    canViewTax:
      roleHasPermission(staffRoles, "tax.records.read") ||
      roleHasPermission(staffRoles, "taxpayer.compliance.read") ||
      roleHasPermission(staffRoles, "payments.read"),
    canViewTransactions: roleHasPermission(staffRoles, "transaction.read"),
    canViewPayments:
      roleHasPermission(staffRoles, "payments.read") ||
      roleHasPermission(staffRoles, "payments.reconcile"),
    canReconcilePayments: roleHasPermission(staffRoles, "payments.reconcile"),
    canViewStock:
      roleHasPermission(staffRoles, "stock.read") ||
      roleHasPermission(staffRoles, "traceability.read"),
    canCorrectStock: roleHasPermission(staffRoles, "stock.correction.review"),
    canViewImports:
      roleHasPermission(staffRoles, "imports.read") ||
      roleHasPermission(staffRoles, "imports.review"),
    canReviewImports: roleHasPermission(staffRoles, "imports.review"),
    canManageDisputes: roleHasPermission(
      staffRoles,
      "compliance.followup.manage",
    ),
    canManageCases: roleHasPermission(staffRoles, "investigation.case.manage"),
    canViewAuditTrail: roleHasPermission(staffRoles, "audit.trail.read"),
    canManageSupport: roleHasPermission(staffRoles, "support.manage"),
  };

  const canSeeContact =
    roleHasPermission(staffRoles, "taxpayer.compliance.read") ||
    perm.canEditProfile;

  const profile: MerchantProfile = {
    id: trader.id,
    name: trader.name,
    businessName: trader.businessName,
    tinNumber: trader.tinNumber,
    role: trader.role,
    clearanceStatus: trader.clearanceStatus,
    registeredAt: trader.createdAt.toISOString(),
    updatedAt: trader.updatedAt.toISOString(),
    ...(canSeeContact
      ? { phoneNumber: trader.phoneNumber, email: trader.email }
      : {}),
  };

  const result: MerchantProfileData = { profile, permissions: perm, staffRoles };

  // ── Tax & VAT ──
  if (perm.canViewTax) {
    const [vatRows, paymentSummary, vatRecordRows] = await Promise.all([
      db
        .select({
          vatType: vatRecord.vatType,
          total:
            sql<number>`COALESCE(SUM(${vatRecord.amount}), 0)::float8`.as(
              "total",
            ),
        })
        .from(vatRecord)
        .where(
          and(
            eq(vatRecord.businessId, trader.id),
            eq(vatRecord.isFrozen, false),
          ),
        )
        .groupBy(vatRecord.vatType),
      db
        .select({
          total:
            sql<number>`COALESCE(SUM(${taxPayment.amount}), 0)::float8`.as(
              "total",
            ),
          count: sql<number>`COUNT(*)::int`.as("count"),
        })
        .from(taxPayment)
        .where(
          and(
            eq(taxPayment.businessId, trader.id),
            eq(taxPayment.status, "confirmed"),
          ),
        ),
      db
        .select({
          id: vatRecord.id,
          vatType: vatRecord.vatType,
          amount: vatRecord.amount,
          period: vatRecord.period,
          createdAt: vatRecord.createdAt,
        })
        .from(vatRecord)
        .where(eq(vatRecord.businessId, trader.id))
        .orderBy(desc(vatRecord.createdAt))
        .limit(50),
    ]);

    const vatOutput = Number(
      vatRows.find((r) => r.vatType === "output")?.total ?? 0,
    );
    const vatInput = Number(
      vatRows.find((r) => r.vatType === "input")?.total ?? 0,
    );
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

    result.vatRecords = vatRecordRows.map((r) => ({
      id: r.id,
      vatType: r.vatType,
      amount: Number(r.amount),
      period: r.period ?? null,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  // ── Transactions ──
  if (perm.canViewTransactions) {
    const rows = await db
      .select({
        id: transaction.id,
        productName: product.name,
        quantity: transaction.quantity,
        totalAmount: transaction.totalAmount,
        vatAmount: transaction.vatAmount,
        status: transaction.status,
        createdAt: transaction.createdAt,
      })
      .from(transaction)
      .innerJoin(product, eq(transaction.productId, product.id))
      .where(eq(transaction.sellerId, trader.id))
      .orderBy(desc(transaction.createdAt))
      .limit(50);

    result.transactions = rows.map((r) => ({
      id: r.id,
      productName: r.productName,
      quantity: r.quantity,
      totalAmount: Number(r.totalAmount),
      vatAmount: Number(r.vatAmount),
      status: r.status,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  // ── Payments ──
  if (perm.canViewPayments) {
    const rows = await db
      .select({
        id: taxPayment.id,
        amount: taxPayment.amount,
        status: taxPayment.status,
        method: taxPayment.method,
        reference: taxPayment.reference,
        createdAt: taxPayment.createdAt,
      })
      .from(taxPayment)
      .where(eq(taxPayment.businessId, trader.id))
      .orderBy(desc(taxPayment.createdAt))
      .limit(50);

    result.payments = rows.map((r) => ({
      id: r.id,
      amount: Number(r.amount),
      status: r.status,
      method: r.method,
      reference: r.reference,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  // ── Stock & Inventory ──
  if (perm.canViewStock) {
    const [stockRows, movementRows, productionRows] = await Promise.all([
      db
        .select({
          id: stock.id,
          productName: product.name,
          unit: product.unit,
          quantity: stock.quantity,
          price: stock.price,
          source: stock.source,
        })
        .from(stock)
        .innerJoin(product, eq(stock.productId, product.id))
        .where(eq(stock.businessId, trader.id))
        .orderBy(product.name)
        .limit(100),
      db
        .select({
          id: stockMovement.id,
          productName: product.name,
          movementType: stockMovement.movementType,
          quantityDelta: stockMovement.quantityDelta,
          quantityBefore: stockMovement.quantityBefore,
          quantityAfter: stockMovement.quantityAfter,
          sourceType: stockMovement.sourceType,
          reason: stockMovement.reason,
          createdAt: stockMovement.createdAt,
        })
        .from(stockMovement)
        .innerJoin(product, eq(stockMovement.productId, product.id))
        .where(eq(stockMovement.businessId, trader.id))
        .orderBy(desc(stockMovement.createdAt))
        .limit(100),
      db
        .select({
          id: productionBatch.id,
          batchReference: productionBatch.batchReference,
          productName: product.name,
          quantity: productionBatch.declaredQuantity,
          status: productionBatch.status,
          productionValidationStatus:
            productionBatch.productionValidationStatus,
          periodStart: productionBatch.periodStart,
          periodEnd: productionBatch.periodEnd,
          createdAt: productionBatch.createdAt,
        })
        .from(productionBatch)
        .innerJoin(product, eq(productionBatch.productId, product.id))
        .where(eq(productionBatch.manufacturerId, trader.id))
        .orderBy(desc(productionBatch.createdAt))
        .limit(50),
    ]);

    result.stock = stockRows.map((r) => ({
      id: r.id,
      productName: r.productName,
      unit: r.unit,
      quantity: r.quantity,
      price: r.price ? Number(r.price) : null,
      source: r.source,
    }));

    result.stockMovements = movementRows.map((r) => ({
      id: r.id,
      productName: r.productName,
      movementType: r.movementType,
      quantityDelta: r.quantityDelta,
      quantityBefore: r.quantityBefore,
      quantityAfter: r.quantityAfter,
      sourceType: r.sourceType,
      reason: r.reason,
      createdAt: r.createdAt.toISOString(),
    }));

    result.production = productionRows.map((r) => ({
      id: r.id,
      batchReference: r.batchReference,
      productName: r.productName,
      quantity: r.quantity,
      status: r.status,
      validationStatus: r.productionValidationStatus,
      periodStart: r.periodStart.toISOString(),
      periodEnd: r.periodEnd.toISOString(),
      createdAt: r.createdAt.toISOString(),
    }));
  }

  // ── Imports ──
  if (perm.canViewImports) {
    const rows = await db
      .select({
        id: importDeclaration.id,
        declarationRef: importDeclaration.declarationRef,
        productName: product.name,
        expectedQuantity: importDeclaration.expectedQuantity,
        actualQuantity: importDeclaration.actualQuantity,
        status: importDeclaration.status,
        customsRef: importDeclaration.customsRef,
        createdAt: importDeclaration.createdAt,
      })
      .from(importDeclaration)
      .innerJoin(product, eq(importDeclaration.productId, product.id))
      .where(eq(importDeclaration.businessId, trader.id))
      .orderBy(desc(importDeclaration.createdAt))
      .limit(50);

    result.imports = rows.map((r) => ({
      id: r.id,
      declarationRef: r.declarationRef,
      productName: r.productName,
      expectedQuantity: r.expectedQuantity,
      actualQuantity: r.actualQuantity,
      status: r.status,
      customsRef: r.customsRef,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  // ── Disputes ──
  if (perm.canManageDisputes || perm.canManageCases) {
    const rows = await db
      .select({
        id: dispute.id,
        referenceNumber: dispute.referenceNumber,
        status: dispute.status,
        reason: dispute.reason,
        createdAt: dispute.createdAt,
      })
      .from(dispute)
      .where(eq(dispute.filedById, trader.id))
      .orderBy(desc(dispute.createdAt))
      .limit(30);

    result.disputes = rows.map((r) => ({
      id: r.id,
      referenceNumber: r.referenceNumber,
      status: r.status,
      reason: r.reason,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  // ── Cases ──
  if (perm.canManageCases) {
    const rows = await db
      .select({
        id: rraCase.id,
        title: rraCase.title,
        status: rraCase.status,
        priority: rraCase.priority,
        createdAt: rraCase.createdAt,
        updatedAt: rraCase.updatedAt,
      })
      .from(rraCase)
      .where(eq(rraCase.traderId, trader.id))
      .orderBy(desc(rraCase.createdAt))
      .limit(20);

    result.cases = rows.map((r) => ({
      id: r.id,
      title: r.title,
      status: r.status,
      priority: r.priority,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
  }

  // ── Support tickets ──
  if (perm.canManageSupport) {
    const rows = await db
      .select({
        id: supportTicket.id,
        subject: supportTicket.subject,
        status: supportTicket.status,
        priority: supportTicket.priority,
        createdAt: supportTicket.createdAt,
      })
      .from(supportTicket)
      .where(eq(supportTicket.traderId, trader.id))
      .orderBy(desc(supportTicket.createdAt))
      .limit(20);

    result.supportTickets = rows.map((r) => ({
      id: r.id,
      subject: r.subject,
      status: r.status,
      priority: r.priority,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  // ── Audit trail ──
  if (perm.canViewAuditTrail) {
    const rows = await db
      .select({
        id: auditLog.id,
        action: auditLog.action,
        targetType: auditLog.targetType,
        createdAt: auditLog.createdAt,
      })
      .from(auditLog)
      .where(eq(auditLog.targetId, trader.id))
      .orderBy(desc(auditLog.createdAt))
      .limit(100);

    result.auditHistory = rows.map((r) => ({
      id: r.id,
      action: r.action,
      targetType: r.targetType,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  // ── Audit: record profile access ──
  try {
    await logAudit({
      userId: actor.id,
      action: "MERCHANT_PROFILE_VIEWED",
      targetType: "user",
      targetId: trader.id,
      metadata: {
        traderId: trader.id,
        tin: trader.tinNumber,
        staffRoles,
        modulesLoaded: Object.entries(perm)
          .filter(([, v]) => v)
          .map(([k]) => k),
        correlationId: randomUUID(),
      },
    });
  } catch {
    // Audit failure must not block profile rendering.
  }

  return result;
}

// ---------------------------------------------------------------------------
// Edit merchant profile — requires a reason, full audit trail
// ---------------------------------------------------------------------------

export interface EditMerchantResult {
  success: boolean;
  error?: string;
}

export async function editMerchantProfile(
  traderId: string,
  data: {
    name?: string;
    businessName?: string;
    phoneNumber?: string;
    email?: string;
  },
  reason: string,
): Promise<EditMerchantResult> {
  let actor: Awaited<ReturnType<typeof requireRRAPermission>>["user"];
  let staff: Awaited<ReturnType<typeof requireRRAPermission>>["staff"];
  try {
    const session = await requireRRAPermission("taxpayer.intelligence.search");
    actor = session.user;
    staff = session.staff;
  } catch (authErr) {
    if (authErr instanceof Error) throw authErr;
    throw new Error("You are not authorised to edit merchant profiles.");
  }

  const staffRoles = staff.clearanceRoles as RRARole[];
  const canEdit =
    roleHasPermission(staffRoles, "taxpayer.compliance.read") ||
    staffRoles.includes("compliance_officer" as RRARole) ||
    staffRoles.includes("tax_compliance_officer" as RRARole);

  if (!canEdit) {
    return {
      success: false,
      error: "Your role does not permit editing merchant profile information.",
    };
  }

  if (!reason || reason.trim().length < 10) {
    return {
      success: false,
      error: "A reason of at least 10 characters is required.",
    };
  }

  if (!z.string().uuid().safeParse(traderId).success) {
    return { success: false, error: "Invalid merchant ID." };
  }

  const [current] = await db
    .select({
      name: user.name,
      businessName: user.businessName,
      phoneNumber: user.phoneNumber,
      email: user.email,
      role: user.role,
    })
    .from(user)
    .where(eq(user.id, traderId))
    .limit(1);

  if (!current) return { success: false, error: "Merchant not found." };
  if (
    !current.role ||
    !["manufacturer", "wholesaler", "retailer"].includes(current.role)
  ) {
    return { success: false, error: "Target is not a registered merchant." };
  }

  const updates: Record<string, string | null> = {};
  if (data.name?.trim()) updates.name = data.name.trim();
  if (data.businessName !== undefined)
    updates.businessName = data.businessName.trim() || null;
  if (data.phoneNumber !== undefined)
    updates.phoneNumber = data.phoneNumber.trim() || null;
  if (data.email?.trim()) updates.email = data.email.trim();

  if (Object.keys(updates).length === 0) {
    return { success: false, error: "No changes provided." };
  }

  // Email uniqueness
  if (updates.email && updates.email !== current.email) {
    const [existing] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, updates.email))
      .limit(1);
    if (existing) return { success: false, error: "Email is already in use." };
  }

  // Phone uniqueness
  if (updates.phoneNumber && updates.phoneNumber !== current.phoneNumber) {
    const [existing] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.phoneNumber, updates.phoneNumber))
      .limit(1);
    if (existing)
      return { success: false, error: "Phone number is already in use." };
  }

  await db.update(user).set(updates).where(eq(user.id, traderId));

  try {
    await logAudit({
      userId: actor.id,
      action: "MERCHANT_PROFILE_EDITED",
      targetType: "user",
      targetId: traderId,
      metadata: {
        changes: updates,
        previous: {
          name: current.name,
          businessName: current.businessName,
          phoneNumber: current.phoneNumber,
          email: current.email,
        },
        reason: reason.trim(),
        editedByStaff: staff.id,
        staffRoles,
      },
    });
  } catch {
    // Audit failure does not roll back the edit, but is logged.
    console.error("[merchant-profile] audit write failed after profile edit");
  }

  return { success: true };
}
