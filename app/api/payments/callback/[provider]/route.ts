/**
 * Payment Provider Callback / Webhook Route
 *
 * This route receives asynchronous payment status updates from payment providers
 * (MTN Mobile Money, Airtel Money, Bank Gateway).
 *
 * CURRENT STATUS: Provider adapters are stubs — real API credentials are not yet
 * configured. This route is wired and ready. Once provider credentials are added
 * to environment variables, fill in the adapter implementation in
 * lib/payment-engine/domain.ts.
 *
 * Required environment variables (add to .env and Vercel):
 *   MTN_MOMO_BASE_URL=
 *   MTN_MOMO_API_KEY=
 *   MTN_MOMO_SUBSCRIPTION_KEY=
 *   MTN_MOMO_CALLBACK_SECRET=
 *   AIRTEL_MONEY_BASE_URL=
 *   AIRTEL_MONEY_CLIENT_ID=
 *   AIRTEL_MONEY_CLIENT_SECRET=
 *   AIRTEL_MONEY_CALLBACK_SECRET=
 *   BANK_GATEWAY_BASE_URL=
 *   BANK_GATEWAY_API_KEY=
 *   BANK_GATEWAY_WEBHOOK_SECRET=
 */

import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import db from '@/db/drizzle';
import { taxPayment, taxPaymentEvent, auditLog, notification } from '@/db/schema';
import { PAYMENT_PROVIDER_ADAPTERS, type PaymentProvider } from '@/lib/payment-engine/domain';

const VALID_PROVIDERS: PaymentProvider[] = ['mtn_mobile_money', 'airtel_money', 'bank_gateway'];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
): Promise<NextResponse> {
  const { provider } = await params;

  // Validate provider param
  if (!VALID_PROVIDERS.includes(provider as PaymentProvider)) {
    return NextResponse.json({ error: 'Unknown provider' }, { status: 404 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get('x-callback-signature') ?? null;

  // Get the adapter for this provider
  const adapter = PAYMENT_PROVIDER_ADAPTERS[provider as PaymentProvider];

  let callback: Awaited<ReturnType<typeof adapter.verifyCallback>>;
  try {
    callback = await adapter.verifyCallback(rawBody, signature);
  } catch (err) {
    console.error(`[webhook/${provider}] Callback verification failed`, {
      providerParam: provider,
      errorName: err instanceof Error ? err.name : typeof err,
      message: err instanceof Error ? err.message : String(err),
    });
    // Return 200 to prevent provider retry storm on configuration errors
    return NextResponse.json({ received: true, processed: false }, { status: 200 });
  }

  // Map provider outcome to payment FSM status
  const outcomeToStatus: Record<string, { status: string; workflowStatus: string; legacyStatus: string }> = {
    success: { status: 'confirmed', workflowStatus: 'PROVIDER_CONFIRMED', legacyStatus: 'confirmed' },
    failed: { status: 'rejected', workflowStatus: 'FAILED', legacyStatus: 'rejected' },
    pending: { status: 'pending', workflowStatus: 'AWAITING_CONFIRMATION', legacyStatus: 'pending' },
  };

  const mapped = outcomeToStatus[callback.outcome];
  if (!mapped) {
    console.warn(`[webhook/${provider}] Unrecognised outcome: ${callback.outcome}`);
    return NextResponse.json({ received: true, processed: false });
  }

  try {
    await db.transaction(async (tx) => {
      // Look up the payment by TaxFlow reference
      const [existing] = await tx
        .select()
        .from(taxPayment)
        .where(eq(taxPayment.paymentReference, callback.paymentReference))
        .for('update')
        .limit(1);

      if (!existing) {
        console.warn(`[webhook/${provider}] Payment reference not found: ${callback.paymentReference}`);
        return; // Not an error — may be a duplicate or stale callback
      }

      // Idempotency: skip if already in a terminal state
      if (['confirmed', 'rejected'].includes(existing.status)) {
        console.info(`[webhook/${provider}] Payment already in terminal state: ${existing.status}`);
        return;
      }

      // Validate amount matches (fraud prevention)
      if (callback.amount !== existing.amount) {
        console.error(`[webhook/${provider}] Amount mismatch — expected ${existing.amount}, got ${callback.amount}`);
        await tx.insert(taxPaymentEvent).values({
          paymentId: existing.id,
          eventKey: `${existing.id}:callback:amount_mismatch:${Date.now()}`,
          eventType: 'CALLBACK_AMOUNT_MISMATCH',
          fromStatus: existing.workflowStatus,
          toStatus: 'REVIEW_REQUIRED',
          details: {
            provider,
            expectedAmount: existing.amount,
            callbackAmount: callback.amount,
            providerReference: callback.providerReference,
          },
        });
        await tx
          .update(taxPayment)
          .set({ workflowStatus: 'REVIEW_REQUIRED', updatedAt: new Date() })
          .where(eq(taxPayment.id, existing.id));
        return;
      }

      // Apply the status transition
      await tx
        .update(taxPayment)
        .set({
          status: mapped.legacyStatus,
          workflowStatus: mapped.workflowStatus,
          reference: callback.providerReference ?? existing.reference,
          updatedAt: new Date(),
        })
        .where(and(eq(taxPayment.id, existing.id), eq(taxPayment.status, 'pending')));

      await tx.insert(taxPaymentEvent).values({
        paymentId: existing.id,
        eventKey: `${existing.id}:callback:${provider}:${callback.providerReference ?? Date.now()}`,
        eventType: `PROVIDER_CALLBACK_${callback.outcome.toUpperCase()}`,
        fromStatus: existing.workflowStatus,
        toStatus: mapped.workflowStatus,
        details: {
          provider,
          providerReference: callback.providerReference,
          amount: callback.amount,
          currency: callback.currency,
          outcome: callback.outcome,
        },
      });

      await tx.insert(auditLog).values({
        userId: existing.businessId,
        action: callback.outcome === 'success' ? 'TAX_PAYMENT_PROVIDER_CONFIRMED' : 'TAX_PAYMENT_PROVIDER_FAILED',
        targetType: 'tax_payment',
        targetId: existing.id,
        beforeState: { status: existing.status, workflowStatus: existing.workflowStatus },
        afterState: { status: mapped.legacyStatus, workflowStatus: mapped.workflowStatus },
        metadata: JSON.stringify({
          provider,
          providerReference: callback.providerReference,
          callbackOutcome: callback.outcome,
        }),
      });

      // Notify the trader
      if (callback.outcome === 'success') {
        await tx.insert(notification).values({
          userId: existing.businessId,
          type: 'system',
          title: 'Tax Payment Confirmed',
          message: `Your payment of ${existing.amount.toLocaleString()} RWF (ref: ${existing.paymentReference}) has been confirmed by ${provider.replace(/_/g, ' ')}.`,
          link: '/dashboard/payments',
        });
      } else if (callback.outcome === 'failed') {
        await tx.insert(notification).values({
          userId: existing.businessId,
          type: 'system',
          title: 'Tax Payment Failed',
          message: `Your payment of ${existing.amount.toLocaleString()} RWF (ref: ${existing.paymentReference}) could not be processed. Please try again.`,
          link: '/dashboard/payments',
        });
      }
    });
  } catch (err) {
    console.error(`[webhook/${provider}] Transaction failed`, {
      paymentReference: callback.paymentReference,
      errorName: err instanceof Error ? err.name : typeof err,
    });
    // Return 500 so the provider retries — the transaction was rolled back
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }

  return NextResponse.json({ received: true, processed: true });
}
