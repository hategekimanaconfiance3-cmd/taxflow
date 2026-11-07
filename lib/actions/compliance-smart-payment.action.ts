"use server";

import { and, eq, desc, sql } from "drizzle-orm";
import db from "@/db/drizzle";
import {
  auditLog,
  vatRecord,
  taxPayment,
  taxPaymentEvent,
  user,
  paymentMethod,
} from "@/db/schema";
import { requireTraderSession } from "@/lib/auth-guard";
import { smartTaxPaymentSchema } from "@/lib/validation/tax-payment.schema";
import { canInitiateTaxPayment } from "@/lib/payment-engine/domain";
import { maskIdentifier } from "@/lib/actions/payment-method.action";

// ---------------------------------------------------------------------------
// Smart Tax Payment — 95–100% partial payment + saved methods
// ---------------------------------------------------------------------------

export type SmartTaxPaymentResult =
  | { success: true; payment: typeof taxPayment.$inferSelect; remainingBalance: number }
  | { success: false; error: string; reference?: string };

/**
 * Submit a smart tax payment with:
 *  - Server-enforced 95%–100% partial payment range
 *  - Optional saved payment method linkage
 *  - Idempotency protection
 *  - Full audit trail and FSM event
 */
export async function submitSmartTaxPayment(
  rawData: unknown,
  idempotencyKey: unknown,
): Promise<SmartTaxPaymentResult> {
  const session = await requireTraderSession();

  const parsed = smartTaxPaymentSchema.safeParse({
    ...(typeof rawData === "object" && rawData !== null && !Array.isArray(rawData) ? rawData : {}),
    idempotencyKey,
  });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Payment details are invalid.",
    };
  }
  const paymentInput = parsed.data;
  const correlationId = crypto.randomUUID();
  let payment: typeof taxPayment.$inferSelect;
  let outstanding = 0;

  try {
    payment = await db.transaction(async (tx) => {
      // Lock the taxpayer row to prevent race conditions
      const [lockedBusiness] = await tx
        .select({ id: user.id })
        .from(user)
        .where(eq(user.id, session.user.id))
        .for("update")
        .limit(1);
      if (!lockedBusiness) throw new Error("Taxpayer account was not found.");

      // Idempotency — return existing if key already used
      const [existingPayment] = await tx
        .select()
        .from(taxPayment)
        .where(
          and(
            eq(taxPayment.businessId, session.user.id),
            eq(taxPayment.idempotencyKey, paymentInput.idempotencyKey),
          ),
        )
        .limit(1);
      if (existingPayment) {
        outstanding = existingPayment.outstandingAtSubmission ?? existingPayment.amount;
        return existingPayment;
      }

      // Server-derive the outstanding balance
      const vatResult = await tx
        .select({
          vatType: vatRecord.vatType,
          total: sql<number>`COALESCE(SUM(${vatRecord.amount}), 0)::float8`.as("total"),
        })
        .from(vatRecord)
        .where(and(eq(vatRecord.businessId, session.user.id), eq(vatRecord.isFrozen, false)))
        .groupBy(vatRecord.vatType);

      const vatOutput = Number(vatResult.find((r) => r.vatType === "output")?.total) || 0;
      const vatInput = Number(vatResult.find((r) => r.vatType === "input")?.total) || 0;

      const [paymentResult] = await tx
        .select({
          totalPaid: sql<number>`COALESCE(SUM(${taxPayment.amount}), 0)::float8`.as("total_paid"),
        })
        .from(taxPayment)
        .where(
          and(eq(taxPayment.businessId, session.user.id), eq(taxPayment.status, "confirmed")),
        );

      outstanding = Math.max(
        0,
        vatOutput - vatInput - (Number(paymentResult?.totalPaid) || 0),
      );

      if (!canInitiateTaxPayment(outstanding)) {
        throw new Error(
          "No recorded VAT balance is currently outstanding. Payment request was not created.",
        );
      }

      // Block if another payment is already pending
      const [otherPending] = await tx
        .select({ id: taxPayment.id })
        .from(taxPayment)
        .where(
          and(
            eq(taxPayment.businessId, session.user.id),
            eq(taxPayment.status, "pending"),
          ),
        )
        .limit(1);
      if (otherPending) {
        throw new Error(
          "A payment is already awaiting settlement review. Wait for its result before submitting another request.",
        );
      }

      // Server-enforce 95%–100% range
      const pct = paymentInput.paymentPercentage ?? 100;
      if (pct < 95 || pct > 100) {
        throw new Error(
          "Payment amount must be between 95% and 100% of your outstanding balance.",
        );
      }
      const requestedAmount = Math.round((pct / 100) * outstanding);
      const minAllowed = Math.round(0.95 * outstanding);
      if (requestedAmount < minAllowed) {
        throw new Error(
          `Minimum payment is 95% of the outstanding balance (${minAllowed.toLocaleString()} RWF).`,
        );
      }
      if (requestedAmount > outstanding) {
        throw new Error(
          `Payment cannot exceed the outstanding balance of ${outstanding.toLocaleString()} RWF.`,
        );
      }

      // Resolve saved method display info (never expose fullIdentifier)
      let savedMethodId: string | null = null;
      let payerDisplay: string | null = null;
      let resolvedMethod = paymentInput.method;

      if (paymentInput.savedMethodId) {
        const [savedMethod] = await tx
          .select({
            id: paymentMethod.id,
            provider: paymentMethod.provider,
            maskedIdentifier: paymentMethod.maskedIdentifier,
          })
          .from(paymentMethod)
          .where(
            and(
              eq(paymentMethod.id, paymentInput.savedMethodId),
              eq(paymentMethod.businessId, session.user.id),
              eq(paymentMethod.isActive, true),
            ),
          )
          .limit(1);
        if (savedMethod) {
          savedMethodId = savedMethod.id;
          payerDisplay = savedMethod.maskedIdentifier;
          if (
            savedMethod.provider === "mtn_mobile_money" ||
            savedMethod.provider === "airtel_money"
          ) {
            resolvedMethod = "mobile_money";
          } else if (savedMethod.provider === "bank_transfer") {
            resolvedMethod = "bank_transfer";
          }
        }
      } else if (
        paymentInput.oneOffIdentifier &&
        resolvedMethod !== "cash"
      ) {
        payerDisplay = maskIdentifier(paymentInput.oneOffIdentifier, resolvedMethod);
      }

      const [createdPayment] = await tx
        .insert(taxPayment)
        .values({
          businessId: session.user.id,
          amount: requestedAmount,
          method: resolvedMethod,
          paymentReference: `TF-${crypto.randomUUID()}`,
          reference: paymentInput.reference || null,
          idempotencyKey: paymentInput.idempotencyKey,
          status: "pending",
          workflowStatus: "AWAITING_CONFIRMATION",
          paymentPercentage: pct.toFixed(2),
          outstandingAtSubmission: outstanding,
          paymentMethodId: savedMethodId,
          payerDisplay,
        })
        .onConflictDoNothing({
          target: [taxPayment.businessId, taxPayment.idempotencyKey],
        })
        .returning();

      if (!createdPayment) {
        const [retryPayment] = await tx
          .select()
          .from(taxPayment)
          .where(
            and(
              eq(taxPayment.businessId, session.user.id),
              eq(taxPayment.idempotencyKey, paymentInput.idempotencyKey),
            ),
          )
          .limit(1);
        if (!retryPayment)
          throw new Error(
            "Payment retry could not be reconciled. Please contact support.",
          );
        outstanding = retryPayment.outstandingAtSubmission ?? retryPayment.amount;
        return retryPayment;
      }

      await tx.insert(auditLog).values({
        userId: session.user.id,
        action: "TAX_PAYMENT_SUBMITTED",
        targetType: "tax_payment",
        targetId: createdPayment.id,
        beforeState: { status: null },
        afterState: {
          status: createdPayment.status,
          amount: createdPayment.amount,
          paymentReference: createdPayment.paymentReference,
          method: createdPayment.method,
          paymentPercentage: pct,
          outstandingAtSubmission: outstanding,
        },
        metadata: JSON.stringify({
          amount: requestedAmount,
          outstandingAtSubmission: outstanding,
          paymentPercentage: pct,
          method: resolvedMethod,
          hasSavedMethod: Boolean(savedMethodId),
          amountSource: "server_derived_vat_balance_partial",
        }),
      });

      await tx.insert(taxPaymentEvent).values({
        paymentId: createdPayment.id,
        eventKey: `${createdPayment.id}:submitted`,
        eventType: "PAYMENT_SUBMITTED_FOR_REVIEW",
        fromStatus: null,
        toStatus: "AWAITING_CONFIRMATION",
        actorUserId: session.user.id,
        details: {
          amount: requestedAmount,
          outstanding,
          pct,
          currency: "RWF",
          paymentReference: createdPayment.paymentReference,
        },
      });

      return createdPayment;
    });
  } catch (error) {
    const knownPrefixes = [
      "Taxpayer account was not found.",
      "No recorded VAT balance is currently outstanding.",
      "A payment is already awaiting settlement review.",
      "Payment retry could not be reconciled.",
      "Payment amount must be between",
      "Minimum payment is 95%",
      "Payment cannot exceed",
    ];
    if (
      error instanceof Error &&
      knownPrefixes.some((p) => error.message.startsWith(p))
    ) {
      return { success: false, error: error.message };
    }
    console.error("Smart tax payment submission failed", {
      userId: session.user.id,
      correlationId,
      errorName: error instanceof Error ? error.name : typeof error,
    });
    return {
      success: false,
      error:
        "The payment request could not be recorded. No payment was confirmed. Contact support with the reference below.",
      reference: correlationId,
    };
  }

  const remaining = Math.max(0, outstanding - payment.amount);
  return { success: true, payment, remainingBalance: remaining };
}

// ---------------------------------------------------------------------------
// Payment History — trader's own records (last 50)
// ---------------------------------------------------------------------------

export interface PaymentHistoryItem {
  id: string;
  paymentReference: string;
  amount: number;
  outstandingAtSubmission: number | null;
  paymentPercentage: string | null;
  method: string;
  status: string;
  workflowStatus: string;
  payerDisplay: string | null;
  reference: string | null;
  createdAt: string;
}

export async function getPaymentHistory(): Promise<PaymentHistoryItem[]> {
  const session = await requireTraderSession();
  const rows = await db
    .select({
      id: taxPayment.id,
      paymentReference: taxPayment.paymentReference,
      amount: taxPayment.amount,
      outstandingAtSubmission: taxPayment.outstandingAtSubmission,
      paymentPercentage: taxPayment.paymentPercentage,
      method: taxPayment.method,
      status: taxPayment.status,
      workflowStatus: taxPayment.workflowStatus,
      payerDisplay: taxPayment.payerDisplay,
      reference: taxPayment.reference,
      createdAt: taxPayment.createdAt,
    })
    .from(taxPayment)
    .where(eq(taxPayment.businessId, session.user.id))
    .orderBy(desc(taxPayment.createdAt))
    .limit(50);

  return rows.map((r) => ({
    ...r,
    createdAt: r.createdAt.toISOString(),
    paymentPercentage: r.paymentPercentage ? String(r.paymentPercentage) : null,
  }));
}
