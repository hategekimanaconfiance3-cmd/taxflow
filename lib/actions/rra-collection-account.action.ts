"use server";

import { and, asc, desc, eq, sql, inArray, or, ilike } from "drizzle-orm";
import { z } from "zod";
import db from "@/db/drizzle";
import { rraCollectionAccount, taxPayment, user, auditLog } from "@/db/schema";
import { requireRRAPermission } from "@/lib/auth-guard";
import { logAudit } from "@/lib/audit";
import { encryptPaymentData } from "@/lib/payment-data-encryption";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AccountType = "bank_account" | "mobile_money";
export type VerificationStatus = "pending" | "verified" | "rejected" | "reverification_required";

export interface CollectionAccount {
  id: string;
  accountType: AccountType;
  displayName: string;
  currency: string;
  description: string | null;
  providerName: string;
  providerIntegration: string | null;
  // Bank
  bankAccountHolder: string | null;
  maskedAccountNumber: string | null;
  bankBranch: string | null;
  // MoMo
  merchantCode: string | null;
  registeredName: string | null;
  // Status
  verificationStatus: VerificationStatus;
  isActive: boolean;
  submittedBy: string;
  submittedByName: string | null;
  reviewedBy: string | null;
  reviewedByName: string | null;
  reviewDate: string | null;
  rejectionReason: string | null;
  verifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
  // Stats
  totalPayments: number;
  totalCollectedRwf: number;
}

export type CollectionAccountResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string };

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const bankAccountSchema = z.object({
  accountType: z.literal("bank_account"),
  displayName: z.string().trim().min(2).max(120),
  currency: z.string().trim().min(2).max(10).default("RWF"),
  description: z.string().trim().max(500).optional(),
  providerName: z.string().trim().min(2).max(120),
  providerIntegration: z.string().trim().max(80).optional(),
  bankAccountHolder: z.string().trim().min(2).max(160),
  bankAccountNumber: z.string().trim().min(4).max(30),
  bankBranch: z.string().trim().max(120).optional(),
});

const mobileMoneySchema = z.object({
  accountType: z.literal("mobile_money"),
  displayName: z.string().trim().min(2).max(120),
  currency: z.string().trim().min(2).max(10).default("RWF"),
  description: z.string().trim().max(500).optional(),
  providerName: z.string().trim().min(2).max(120),
  providerIntegration: z.string().trim().max(80).optional(),
  merchantCode: z.string().trim().min(2).max(60),
  registeredName: z.string().trim().min(2).max(160),
});

const registerSchema = z.discriminatedUnion("accountType", [bankAccountSchema, mobileMoneySchema]);
export type RegisterCollectionAccountInput = z.infer<typeof registerSchema>;

const reviewSchema = z.object({
  accountId: z.string().trim().min(1),
  decision: z.enum(["verified", "rejected"]),
  rejectionReason: z.string().trim().max(500).optional(),
  reason: z.string().trim().min(10, "Provide at least 10 characters for the audit reason.").max(500),
});

const updateStatusSchema = z.object({
  accountId: z.string().trim().min(1),
  activate: z.boolean(),
  reason: z.string().trim().min(10, "Provide at least 10 characters for the audit reason.").max(500),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function maskAccountNumber(raw: string): string {
  const s = raw.trim().replace(/\s/g, "");
  if (s.length <= 4) return "****";
  return `${"*".repeat(Math.max(0, s.length - 4))}${s.slice(-4)}`;
}

function toPublic(
  row: typeof rraCollectionAccount.$inferSelect & {
    submittedByName: string | null;
    reviewedByName: string | null;
    totalPayments: number;
    totalCollectedRwf: number;
  }
): CollectionAccount {
  return {
    id: row.id,
    accountType: row.accountType as AccountType,
    displayName: row.displayName,
    currency: row.currency,
    description: row.description,
    providerName: row.providerName,
    providerIntegration: row.providerIntegration,
    bankAccountHolder: row.bankAccountHolder,
    maskedAccountNumber: row.maskedAccountNumber,
    bankBranch: row.bankBranch,
    merchantCode: row.merchantCode,
    registeredName: row.registeredName,
    verificationStatus: row.verificationStatus as VerificationStatus,
    isActive: row.isActive,
    submittedBy: row.submittedBy,
    submittedByName: row.submittedByName,
    reviewedBy: row.reviewedBy,
    reviewedByName: row.reviewedByName,
    reviewDate: row.reviewDate ? new Date(row.reviewDate).toISOString() : null,
    rejectionReason: row.rejectionReason,
    verifiedAt: row.verifiedAt ? new Date(row.verifiedAt).toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    totalPayments: row.totalPayments,
    totalCollectedRwf: row.totalCollectedRwf,
  };
}

// ---------------------------------------------------------------------------
// 1. List collection accounts (with stats)
// ---------------------------------------------------------------------------

export async function getCollectionAccounts(
  filter?: "all" | "pending" | "verified" | "active" | "inactive"
): Promise<CollectionAccountResult<CollectionAccount[]>> {
  try {
    await requireRRAPermission("payments.read");

    const conditions = [eq(rraCollectionAccount.isDeleted, false)];
    if (filter === "pending") conditions.push(eq(rraCollectionAccount.verificationStatus, "pending"));
    else if (filter === "verified") conditions.push(eq(rraCollectionAccount.verificationStatus, "verified"));
    else if (filter === "active") conditions.push(eq(rraCollectionAccount.isActive, true));
    else if (filter === "inactive") conditions.push(eq(rraCollectionAccount.isActive, false));

    const rows = await db
      .select({
        account: rraCollectionAccount,
        submittedByName: sql<string | null>`(SELECT name FROM "user" WHERE id = ${rraCollectionAccount.submittedBy})`,
        reviewedByName: sql<string | null>`(SELECT name FROM "user" WHERE id = ${rraCollectionAccount.reviewedBy})`,
        totalPayments: sql<number>`COALESCE((SELECT COUNT(*) FROM tax_payment WHERE rra_account_id = ${rraCollectionAccount.id} AND status = 'confirmed'), 0)::int`,
        totalCollectedRwf: sql<number>`COALESCE((SELECT SUM(amount) FROM tax_payment WHERE rra_account_id = ${rraCollectionAccount.id} AND status = 'confirmed'), 0)::float8`,
      })
      .from(rraCollectionAccount)
      .where(and(...conditions))
      .orderBy(desc(rraCollectionAccount.createdAt));

    return {
      success: true,
      data: rows.map((r) =>
        toPublic({ ...r.account, submittedByName: r.submittedByName, reviewedByName: r.reviewedByName, totalPayments: r.totalPayments, totalCollectedRwf: r.totalCollectedRwf })
      ),
    };
  } catch (err) {
    console.error("[rra-collection-account] getCollectionAccounts error", err);
    return { success: false, error: "Could not load collection accounts." };
  }
}

// ---------------------------------------------------------------------------
// 2. Get summary stats
// ---------------------------------------------------------------------------

export interface CollectionAccountSummary {
  total: number;
  verified: number;
  pending: number;
  active: number;
  inactive: number;
  totalCollectedRwf: number;
  byType: { bank_account: number; mobile_money: number };
}

export async function getCollectionAccountSummary(): Promise<CollectionAccountResult<CollectionAccountSummary>> {
  try {
    await requireRRAPermission("payments.read");

    const [counts] = await db
      .select({
        total: sql<number>`COUNT(*)::int`,
        verified: sql<number>`COUNT(*) FILTER (WHERE verification_status = 'verified')::int`,
        pending: sql<number>`COUNT(*) FILTER (WHERE verification_status = 'pending')::int`,
        active: sql<number>`COUNT(*) FILTER (WHERE is_active = TRUE)::int`,
        inactive: sql<number>`COUNT(*) FILTER (WHERE is_active = FALSE)::int`,
        bankCount: sql<number>`COUNT(*) FILTER (WHERE account_type = 'bank_account')::int`,
        momoCount: sql<number>`COUNT(*) FILTER (WHERE account_type = 'mobile_money')::int`,
      })
      .from(rraCollectionAccount)
      .where(eq(rraCollectionAccount.isDeleted, false));

    const [collected] = await db
      .select({
        total: sql<number>`COALESCE(SUM(amount), 0)::float8`,
      })
      .from(taxPayment)
      .where(and(eq(taxPayment.status, "confirmed"), sql`rra_account_id IS NOT NULL`));

    return {
      success: true,
      data: {
        total: counts?.total ?? 0,
        verified: counts?.verified ?? 0,
        pending: counts?.pending ?? 0,
        active: counts?.active ?? 0,
        inactive: counts?.inactive ?? 0,
        totalCollectedRwf: collected?.total ?? 0,
        byType: { bank_account: counts?.bankCount ?? 0, mobile_money: counts?.momoCount ?? 0 },
      },
    };
  } catch (err) {
    console.error("[rra-collection-account] getCollectionAccountSummary error", err);
    return { success: false, error: "Could not load account summary." };
  }
}

// ---------------------------------------------------------------------------
// 3. Get active verified accounts (for taxpayer payment flow)
// ---------------------------------------------------------------------------

export interface ActiveCollectionChannel {
  id: string;
  accountType: AccountType;
  displayName: string;
  providerName: string;
  currency: string;
  maskedAccountNumber: string | null;
  merchantCode: string | null;
}

export async function getActiveCollectionChannels(): Promise<ActiveCollectionChannel[]> {
  const rows = await db
    .select({
      id: rraCollectionAccount.id,
      accountType: rraCollectionAccount.accountType,
      displayName: rraCollectionAccount.displayName,
      providerName: rraCollectionAccount.providerName,
      currency: rraCollectionAccount.currency,
      maskedAccountNumber: rraCollectionAccount.maskedAccountNumber,
      merchantCode: rraCollectionAccount.merchantCode,
    })
    .from(rraCollectionAccount)
    .where(
      and(
        eq(rraCollectionAccount.isActive, true),
        eq(rraCollectionAccount.verificationStatus, "verified"),
        eq(rraCollectionAccount.isDeleted, false)
      )
    )
    .orderBy(asc(rraCollectionAccount.displayName));

  return rows.map((r) => ({ ...r, accountType: r.accountType as AccountType }));
}

// ---------------------------------------------------------------------------
// 4. Register a new collection account
// ---------------------------------------------------------------------------

export async function registerCollectionAccount(
  rawInput: unknown
): Promise<CollectionAccountResult<{ id: string }>> {
  try {
    const { staff } = await requireRRAPermission("payments.accounts.manage");
    const parsed = registerSchema.safeParse(rawInput);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
    }
    const data = parsed.data;

    const masked =
      data.accountType === "bank_account"
        ? maskAccountNumber(data.bankAccountNumber)
        : null;

    const [created] = await db
      .insert(rraCollectionAccount)
      .values({
        accountType: data.accountType,
        displayName: data.displayName,
        currency: data.currency,
        description: data.description ?? null,
        providerName: data.providerName,
        providerIntegration: data.providerIntegration ?? null,
        ...(data.accountType === "bank_account"
          ? {
              bankAccountHolder: data.bankAccountHolder,
              bankAccountNumber: encryptPaymentData(data.bankAccountNumber),
              maskedAccountNumber: masked,
              bankBranch: data.bankBranch ?? null,
            }
          : {
              merchantCode: data.merchantCode,
              registeredName: data.registeredName,
            }),
        verificationStatus: "pending",
        submittedBy: staff.userId,
        isActive: false,
        isDeleted: false,
      })
      .returning({ id: rraCollectionAccount.id });

    await logAudit({
      userId: staff.userId,
      action: "RRA_COLLECTION_ACCOUNT_REGISTERED",
      targetType: "rra_collection_account",
      targetId: created.id,
      metadata: {
        accountType: data.accountType,
        displayName: data.displayName,
        providerName: data.providerName,
        staffId: staff.staffId,
      },
    });

    return { success: true, data: { id: created.id } };
  } catch (err) {
    console.error("[rra-collection-account] registerCollectionAccount error", {
      errorName: err instanceof Error ? err.name : "UnknownError",
    });
    if (err instanceof Error && err.message.includes("PAYMENT_DATA_ENCRYPTION_KEY")) {
      return { success: false, error: "Bank account registration is unavailable until payment data encryption is configured." };
    }
    return { success: false, error: "Could not register collection account." };
  }
}

// ---------------------------------------------------------------------------
// 5. Review (approve / reject) an account
// ---------------------------------------------------------------------------

export async function reviewCollectionAccount(
  rawInput: unknown
): Promise<CollectionAccountResult<{ status: VerificationStatus }>> {
  try {
    const { staff } = await requireRRAPermission("payments.accounts.review");
    const parsed = reviewSchema.safeParse(rawInput);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
    }
    const { accountId, decision, rejectionReason, reason } = parsed.data;

    const [target] = await db
      .select()
      .from(rraCollectionAccount)
      .where(and(eq(rraCollectionAccount.id, accountId), eq(rraCollectionAccount.isDeleted, false)))
      .limit(1);

    if (!target) return { success: false, error: "Account not found." };
    if (!["pending", "reverification_required"].includes(target.verificationStatus)) {
      return { success: false, error: `Account is already ${target.verificationStatus}.` };
    }
    if (target.submittedBy === staff.userId) {
      return { success: false, error: "You cannot review an account you submitted." };
    }

    const nextStatus: VerificationStatus = decision;
    await db
      .update(rraCollectionAccount)
      .set({
        verificationStatus: nextStatus,
        reviewedBy: staff.userId,
        reviewDate: new Date(),
        rejectionReason: decision === "rejected" ? (rejectionReason ?? null) : null,
        verifiedAt: decision === "verified" ? new Date() : null,
        // Auto-activate on verification, but keep inactive if rejected
        isActive: decision === "verified" ? true : false,
      })
      .where(eq(rraCollectionAccount.id, accountId));

    await logAudit({
      userId: staff.userId,
      action: decision === "verified" ? "RRA_COLLECTION_ACCOUNT_VERIFIED" : "RRA_COLLECTION_ACCOUNT_REJECTED",
      targetType: "rra_collection_account",
      targetId: accountId,
      metadata: { reason, rejectionReason: rejectionReason ?? null, staffId: staff.staffId },
      beforeState: { verificationStatus: target.verificationStatus },
      afterState: { verificationStatus: nextStatus },
    });

    return { success: true, data: { status: nextStatus } };
  } catch (err) {
    console.error("[rra-collection-account] reviewCollectionAccount error", err);
    return { success: false, error: "Could not process review." };
  }
}

// ---------------------------------------------------------------------------
// 6. Activate / deactivate a verified account
// ---------------------------------------------------------------------------

export async function setCollectionAccountActive(
  rawInput: unknown
): Promise<CollectionAccountResult<{ isActive: boolean }>> {
  try {
    const { staff } = await requireRRAPermission("payments.accounts.manage");
    const parsed = updateStatusSchema.safeParse(rawInput);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
    }
    const { accountId, activate, reason } = parsed.data;

    const [target] = await db
      .select()
      .from(rraCollectionAccount)
      .where(and(eq(rraCollectionAccount.id, accountId), eq(rraCollectionAccount.isDeleted, false)))
      .limit(1);

    if (!target) return { success: false, error: "Account not found." };
    if (activate && target.verificationStatus !== "verified") {
      return { success: false, error: "Only verified accounts can be activated." };
    }
    if (target.isActive === activate) {
      return { success: false, error: `Account is already ${activate ? "active" : "inactive"}.` };
    }

    await db
      .update(rraCollectionAccount)
      .set({ isActive: activate })
      .where(eq(rraCollectionAccount.id, accountId));

    await logAudit({
      userId: staff.userId,
      action: activate ? "RRA_COLLECTION_ACCOUNT_ACTIVATED" : "RRA_COLLECTION_ACCOUNT_DEACTIVATED",
      targetType: "rra_collection_account",
      targetId: accountId,
      metadata: { reason, staffId: staff.staffId },
      beforeState: { isActive: target.isActive },
      afterState: { isActive: activate },
    });

    return { success: true, data: { isActive: activate } };
  } catch (err) {
    console.error("[rra-collection-account] setCollectionAccountActive error", err);
    return { success: false, error: "Could not update account status." };
  }
}

// ---------------------------------------------------------------------------
// 7. Soft-delete an account (super_admin or accounts.manage with no transactions)
// ---------------------------------------------------------------------------

export async function deleteCollectionAccount(
  accountId: string,
  reason: string
): Promise<CollectionAccountResult> {
  try {
    const { staff } = await requireRRAPermission("payments.accounts.manage");

    if (!reason || reason.trim().length < 10) {
      return { success: false, error: "Provide at least 10 characters for the deletion reason." };
    }

    const [target] = await db
      .select()
      .from(rraCollectionAccount)
      .where(and(eq(rraCollectionAccount.id, accountId), eq(rraCollectionAccount.isDeleted, false)))
      .limit(1);

    if (!target) return { success: false, error: "Account not found." };
    if (target.isActive) {
      return { success: false, error: "Deactivate the account before deleting it." };
    }

    // Check for existing payments linked to this account
    const [paymentCount] = await db
      .select({ n: sql<number>`COUNT(*)::int` })
      .from(taxPayment)
      .where(eq(taxPayment.rraAccountId, accountId));

    if ((paymentCount?.n ?? 0) > 0) {
      return {
        success: false,
        error: `Cannot delete — ${paymentCount.n} payment(s) reference this account. Deactivate it instead.`,
      };
    }

    await db
      .update(rraCollectionAccount)
      .set({ isDeleted: true, isActive: false })
      .where(eq(rraCollectionAccount.id, accountId));

    await logAudit({
      userId: staff.userId,
      action: "RRA_COLLECTION_ACCOUNT_DELETED",
      targetType: "rra_collection_account",
      targetId: accountId,
      metadata: { reason, staffId: staff.staffId, displayName: target.displayName },
    });

    return { success: true, data: undefined };
  } catch (err) {
    console.error("[rra-collection-account] deleteCollectionAccount error", err);
    return { success: false, error: "Could not delete account." };
  }
}

// ---------------------------------------------------------------------------
// 8. Get payment transactions for a collection account (reconciliation)
// ---------------------------------------------------------------------------

export async function getAccountPayments(
  accountId: string
): Promise<CollectionAccountResult<Array<{
  id: string;
  amount: number;
  status: string;
  workflowStatus: string;
  paymentReference: string;
  method: string;
  traderName: string | null;
  businessName: string | null;
  createdAt: string;
}>>> {
  try {
    await requireRRAPermission("payments.read");

    const rows = await db
      .select({
        id: taxPayment.id,
        amount: taxPayment.amount,
        status: taxPayment.status,
        workflowStatus: taxPayment.workflowStatus,
        paymentReference: taxPayment.paymentReference,
        method: taxPayment.method,
        traderName: user.name,
        businessName: user.businessName,
        createdAt: taxPayment.createdAt,
      })
      .from(taxPayment)
      .innerJoin(user, eq(taxPayment.businessId, user.id))
      .where(eq(taxPayment.rraAccountId, accountId))
      .orderBy(desc(taxPayment.createdAt))
      .limit(200);

    return {
      success: true,
      data: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
    };
  } catch (err) {
    console.error("[rra-collection-account] getAccountPayments error", err);
    return { success: false, error: "Could not load account payments." };
  }
}
