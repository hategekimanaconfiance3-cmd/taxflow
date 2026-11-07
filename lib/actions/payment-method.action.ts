"use server";

import { and, eq, desc } from "drizzle-orm";
import { z } from "zod";
import db from "@/db/drizzle";
import { paymentMethod } from "@/db/schema";
import { requireTraderSession } from "@/lib/auth-guard";
import { logAudit } from "@/lib/audit";
import { maskIdentifier } from "@/lib/utils/payment-masking";
export { maskIdentifier } from "@/lib/utils/payment-masking";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PROVIDERS = ["mtn_mobile_money", "airtel_money", "bank_transfer"] as const;
export type PaymentMethodProvider = (typeof PROVIDERS)[number];

export const PROVIDER_LABELS: Record<PaymentMethodProvider, string> = {
  mtn_mobile_money: "MTN Mobile Money",
  airtel_money: "Airtel Money",
  bank_transfer: "Bank Transfer",
};


// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const savePaymentMethodSchema = z.object({
  provider: z.enum(PROVIDERS, { message: "Invalid payment provider" }),
  label: z.string().trim().max(50).optional(),
  identifier: z
    .string()
    .trim()
    .min(7, "Phone/account number is too short")
    .max(30, "Phone/account number is too long"),
  makeDefault: z.boolean().optional(),
});

const updatePaymentMethodSchema = z.object({
  id: z.string().trim().min(1),
  label: z.string().trim().max(50).optional(),
  makeDefault: z.boolean().optional(),
});

export type SavePaymentMethodInput = z.infer<typeof savePaymentMethodSchema>;

// ---------------------------------------------------------------------------
// Public safe type — NEVER includes fullIdentifier
// ---------------------------------------------------------------------------
export interface SavedPaymentMethod {
  id: string;
  provider: PaymentMethodProvider;
  providerLabel: string;
  label: string | null;
  maskedIdentifier: string;
  isDefault: boolean;
  createdAt: string;
}

function toPublic(row: typeof paymentMethod.$inferSelect): SavedPaymentMethod {
  return {
    id: row.id,
    provider: row.provider as PaymentMethodProvider,
    providerLabel: PROVIDER_LABELS[row.provider as PaymentMethodProvider] ?? row.provider,
    label: row.label,
    maskedIdentifier: row.maskedIdentifier,
    isDefault: row.isDefault,
    createdAt: row.createdAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// 1. List saved payment methods
// ---------------------------------------------------------------------------
export async function getSavedPaymentMethods(): Promise<SavedPaymentMethod[]> {
  const session = await requireTraderSession();
  const rows = await db
    .select()
    .from(paymentMethod)
    .where(
      and(
        eq(paymentMethod.businessId, session.user.id),
        eq(paymentMethod.isActive, true),
      ),
    )
    .orderBy(desc(paymentMethod.isDefault), desc(paymentMethod.createdAt));
  return rows.map(toPublic);
}

// ---------------------------------------------------------------------------
// 2. Save a new payment method
// ---------------------------------------------------------------------------
export type SavePaymentMethodResult =
  | { success: true; method: SavedPaymentMethod }
  | { success: false; error: string };

export async function savePaymentMethod(
  rawInput: unknown,
): Promise<SavePaymentMethodResult> {
  const session = await requireTraderSession();
  const parsed = savePaymentMethodSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const { provider, label, identifier, makeDefault } = parsed.data;

  // Limit to 10 saved methods per business
  const existingCount = await db
    .select({ id: paymentMethod.id })
    .from(paymentMethod)
    .where(
      and(
        eq(paymentMethod.businessId, session.user.id),
        eq(paymentMethod.isActive, true),
      ),
    );
  if (existingCount.length >= 10) {
    return { success: false, error: "You can save up to 10 payment methods. Remove one before adding another." };
  }

  const masked = maskIdentifier(identifier, provider);

  const [created] = await db.transaction(async (tx) => {
    // If making this default, unset all existing defaults
    if (makeDefault) {
      await tx
        .update(paymentMethod)
        .set({ isDefault: false })
        .where(
          and(
            eq(paymentMethod.businessId, session.user.id),
            eq(paymentMethod.isDefault, true),
          ),
        );
    }
    return tx
      .insert(paymentMethod)
      .values({
        businessId: session.user.id,
        provider,
        label: label?.trim() || null,
        maskedIdentifier: masked,
        fullIdentifier: identifier,
        isDefault: Boolean(makeDefault),
        isActive: true,
      })
      .returning();
  });

  await logAudit({
    userId: session.user.id,
    action: "PAYMENT_METHOD_SAVED",
    targetType: "payment_method",
    targetId: created.id,
    metadata: { provider, masked, makeDefault: Boolean(makeDefault) },
  });

  return { success: true, method: toPublic(created) };
}

// ---------------------------------------------------------------------------
// 3. Set default payment method
// ---------------------------------------------------------------------------
export type SetDefaultResult =
  | { success: true }
  | { success: false; error: string };

export async function setDefaultPaymentMethod(id: string): Promise<SetDefaultResult> {
  const session = await requireTraderSession();
  await db.transaction(async (tx) => {
    const [target] = await tx
      .select()
      .from(paymentMethod)
      .where(
        and(
          eq(paymentMethod.id, id),
          eq(paymentMethod.businessId, session.user.id),
          eq(paymentMethod.isActive, true),
        ),
      )
      .limit(1);
    if (!target) throw new Error("Payment method not found.");
    await tx
      .update(paymentMethod)
      .set({ isDefault: false })
      .where(
        and(
          eq(paymentMethod.businessId, session.user.id),
          eq(paymentMethod.isDefault, true),
        ),
      );
    await tx
      .update(paymentMethod)
      .set({ isDefault: true })
      .where(eq(paymentMethod.id, id));
  });
  return { success: true };
}

// ---------------------------------------------------------------------------
// 4. Update label
// ---------------------------------------------------------------------------
export async function updatePaymentMethodLabel(
  rawInput: unknown,
): Promise<SetDefaultResult> {
  const session = await requireTraderSession();
  const parsed = updatePaymentMethodSchema.safeParse(rawInput);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid." };
  const { id, label } = parsed.data;
  const [updated] = await db
    .update(paymentMethod)
    .set({ label: label?.trim() || null })
    .where(
      and(
        eq(paymentMethod.id, id),
        eq(paymentMethod.businessId, session.user.id),
        eq(paymentMethod.isActive, true),
      ),
    )
    .returning({ id: paymentMethod.id });
  if (!updated) return { success: false, error: "Payment method not found." };
  return { success: true };
}

// ---------------------------------------------------------------------------
// 5. Remove (soft-delete) a payment method
// ---------------------------------------------------------------------------
export async function removePaymentMethod(id: string): Promise<SetDefaultResult> {
  const session = await requireTraderSession();
  const [updated] = await db
    .update(paymentMethod)
    .set({ isActive: false, isDefault: false })
    .where(
      and(
        eq(paymentMethod.id, id),
        eq(paymentMethod.businessId, session.user.id),
      ),
    )
    .returning({ id: paymentMethod.id });
  if (!updated) return { success: false, error: "Payment method not found." };
  await logAudit({
    userId: session.user.id,
    action: "PAYMENT_METHOD_REMOVED",
    targetType: "payment_method",
    targetId: id,
    metadata: {},
  });
  return { success: true };
}

// ---------------------------------------------------------------------------
// 6. Get full identifier for a saved method (server-only — used in payment actions)
// ---------------------------------------------------------------------------
export async function getPaymentMethodFullIdentifier(
  id: string,
  businessId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ fullIdentifier: paymentMethod.fullIdentifier })
    .from(paymentMethod)
    .where(
      and(
        eq(paymentMethod.id, id),
        eq(paymentMethod.businessId, businessId),
        eq(paymentMethod.isActive, true),
      ),
    )
    .limit(1);
  return row?.fullIdentifier ?? null;
}
