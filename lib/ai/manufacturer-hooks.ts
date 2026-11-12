// Server-only — Manufacturer AI Event Hook
// Called from server actions after a manufacturer performs any action.
// MUST be called in a try/catch — errors here must never break the caller's action.

import { aiEventTrigger } from '@/db/schema';
import db from '@/db/drizzle';
import {
  checkImportVsStock,
  checkProductionEfficiency,
  checkRapidStockDepletion,
  checkRepeatedStockLoss,
  checkSalesWithoutProduction,
  saveAndRouteFinding,
  type SignalResult,
} from './manufacturer-signals';

export type ManufacturerEvent =
  | 'PRODUCTION_RECORDED'
  | 'SALE_CREATED'
  | 'PURCHASE_CONFIRMED'
  | 'PURCHASE_REJECTED'
  | 'IMPORT_SUBMITTED'
  | 'IMPORT_RECEIVED'
  | 'STOCK_ADJUSTED'
  | 'STOCK_LOSS_DECLARED'
  | 'TAX_PAYMENT_MADE'
  | 'DISPUTE_FILED';

export interface ManufacturerHookPayload {
  businessId: string;
  event: ManufacturerEvent;
  referenceId?: string;
  // Event-specific fields
  productId?: string;
  quantity?: number;
  declarationId?: string;
  lossQuantity?: number;
}

/**
 * Main event hook — call this after every manufacturer action.
 * Never throws. Errors are logged but do not break the caller.
 */
export async function triggerManufacturerAICheck(payload: ManufacturerHookPayload): Promise<void> {
  const signalsChecked: string[] = [];
  const findingsCreated: string[] = [];
  let highestSeverity: string = 'info';

  try {
    const signals: SignalResult[] = [];

    switch (payload.event) {
      case 'PRODUCTION_RECORDED': {
        signalsChecked.push('PRODUCTION_EFFICIENCY_ANOMALY', 'SALES_WITHOUT_PRODUCTION');
        if (payload.productId && payload.quantity != null) {
          const efficiencySignal = await checkProductionEfficiency(
            payload.businessId,
            payload.productId,
            payload.quantity,
          );
          if (efficiencySignal) signals.push(efficiencySignal);
        }
        // Also check if manufacturer had sales without production before this batch
        const swpSignals = await checkSalesWithoutProduction(payload.businessId);
        signals.push(...swpSignals);
        break;
      }

      case 'SALE_CREATED': {
        signalsChecked.push('RAPID_STOCK_DEPLETION');
        if (payload.productId && payload.quantity != null) {
          const depletionSignal = await checkRapidStockDepletion(
            payload.businessId,
            payload.productId,
            payload.quantity,
          );
          if (depletionSignal) signals.push(depletionSignal);
        }
        break;
      }

      case 'IMPORT_RECEIVED': {
        signalsChecked.push('IMPORT_VS_STOCK_MISMATCH');
        if (payload.declarationId) {
          const importSignal = await checkImportVsStock(payload.declarationId, payload.businessId);
          if (importSignal) signals.push(importSignal);
        }
        break;
      }

      case 'STOCK_LOSS_DECLARED': {
        signalsChecked.push('REPEATED_STOCK_LOSS_PATTERN');
        if (payload.productId && payload.lossQuantity != null) {
          const lossSignal = await checkRepeatedStockLoss(
            payload.businessId,
            payload.productId,
            payload.lossQuantity,
          );
          if (lossSignal) signals.push(lossSignal);
        }
        break;
      }

      default:
        // Other events recorded for audit but no signals checked currently
        signalsChecked.push('none');
        break;
    }

    // Save and route each signal result
    for (const signal of signals) {
      const findingId = await saveAndRouteFinding(signal, payload.businessId, payload.productId);
      if (findingId) findingsCreated.push(findingId);
      if (signal.severity === 'critical') highestSeverity = 'critical';
      else if (signal.severity === 'warning' && highestSeverity !== 'critical') highestSeverity = 'warning';
    }

    // Log the hook execution to ai_event_trigger
    await db.insert(aiEventTrigger).values({
      businessId: payload.businessId,
      event: payload.event,
      referenceId: payload.referenceId ?? null,
      signalsChecked: JSON.stringify(signalsChecked),
      findingsCreated: JSON.stringify(findingsCreated),
      staffNotified: JSON.stringify([]), // updated by routeFindingToRRAStaff
      severity: findingsCreated.length > 0 ? highestSeverity : null,
    });

  } catch (error) {
    console.error('[ManufacturerHook] Unexpected error in AI hook — action not affected:', error);
    // Never rethrow — the caller's action must succeed even if the AI hook fails
  }
}
