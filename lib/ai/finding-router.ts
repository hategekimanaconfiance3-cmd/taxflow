// Server-only — AI Finding Router
// Routes aiFinding records to the right RRA staff member based on rraStaff.clearanceLevel permissions.
// Also pushes real-time Socket.IO events to connected officers.

import { and, eq, inArray } from 'drizzle-orm';
import db from '@/db/drizzle';
import { rraStaff, rraStaffRole, notification, user } from '@/db/schema';
import { emitToUser } from '@/lib/realtime';
import { hasRRAPermission, isRRARole, type RRAPermission } from '@/lib/rra-rbac';
import { Resend } from 'resend';
import { render } from '@react-email/components';
import CriticalFindingAlert from '@/emails/critical-finding-alert';

// Lazy Resend client — instantiated only at call time, never at module load.
// This prevents build-time crashes when RESEND_API_KEY is not set.
let _resend: Resend | null = null;
function getResend(): Resend {
  const resendApiKey = process.env.RESEND_API_KEY?.trim();
  if (!resendApiKey) throw new Error('RESEND_API_KEY is not configured.');
  if (!_resend) _resend = new Resend(resendApiKey);
  return _resend;
}

// Maps finding type to the permission required to receive it.
// All values must be valid RRAPermission strings.
const FINDING_PERMISSION_MAP: Record<string, RRAPermission> = {
  inventory_discrepancy:         'stock.read',
  import_vs_stock_mismatch:      'imports.read',
  production_efficiency_anomaly: 'traceability.read',
  ghost_sale:                    'transaction.read',
  rapid_stock_depletion:         'stock.read',
  sales_without_production:      'traceability.read',
  repeated_stock_loss:           'stock.read',
  price_ceiling_breach:          'taxpayer.compliance.read',
  stock_discrepancy:             'stock.read',
  underreporting:                'transaction.read',
  price_anomaly:                 'transaction.read',
  tax_gap:                       'taxpayer.compliance.read',
  duplicate_transaction:         'audit.trail.read',
  supply_chain_gap:              'transaction.read',
  data_quality:                  'data_quality.read',
  risk_score:                    'ai.findings.read',
  production_discrepancy:        'traceability.read',
};

export interface FindingRouterPayload {
  findingId: string;
  findingType: string;
  severity: string;
  businessId: string;
  businessName?: string | null;
  productName?: string | null;
  observedValue?: number | null;
  expectedValue?: number | null;
  explanation?: string | null;
}

/**
 * Route a finding to all eligible RRA staff members.
 * Inserts a notification for each eligible officer and pushes a real-time event.
 * Critical findings also go to all super_admin staff.
 * Never throws — errors are logged but do not break the caller.
 */
export async function routeFindingToRRAStaff(payload: FindingRouterPayload): Promise<string[]> {
  try {
    const requiredPermission = FINDING_PERMISSION_MAP[payload.findingType] ?? 'ai.findings.read';

    // Read all active assigned roles; clearanceLevel is only the legacy primary role.
    const activeStaff = await db
      .select({
        userId: rraStaff.userId,
        role: rraStaffRole.role,
      })
      .from(rraStaffRole)
      .innerJoin(rraStaff, eq(rraStaffRole.staffRecordId, rraStaff.id))
      .innerJoin(user, eq(rraStaff.userId, user.id))
      .where(and(eq(rraStaff.isActive, true), eq(user.isActive, true)));

    // Filter to staff who have the required permission
    const eligibleUserIds = new Set<string>();
    for (const staff of activeStaff) {
      if (!isRRARole(staff.role)) continue;
      const hasPermission = hasRRAPermission(staff.role, requiredPermission);
      // Critical findings always go to super_admin too
      const isSuperAdmin = staff.role === 'super_admin';
      if (hasPermission || (payload.severity === 'critical' && isSuperAdmin)) {
        eligibleUserIds.add(staff.userId);
      }
    }

    if (eligibleUserIds.size === 0) return [];
    const recipientIds = [...eligibleUserIds];

    // Build notifications
    const businessLabel = payload.businessName ?? payload.businessId.slice(0, 8);
    const title = `AI Finding: ${payload.findingType.replace(/_/g, ' ')} [${payload.severity.toUpperCase()}]`;
    const message = payload.explanation
      ? payload.explanation.slice(0, 200)
      : `New ${payload.severity} finding detected for ${businessLabel}.`;
    const link = `/admin/intelligence/business/${payload.businessId}`;

    const notifs = recipientIds.map((userId) => ({
      userId,
      type: 'ai_finding',
      title,
      message,
      link,
      read: false,
    }));

    await db.insert(notification).values(notifs);

    // Push real-time event to each officer's browser
    for (const userId of recipientIds) {
      emitToUser(userId, 'new_ai_finding', {
        findingId: payload.findingId,
        findingType: payload.findingType,
        severity: payload.severity,
        businessName: businessLabel,
        productName: payload.productName ?? null,
        observedValue: payload.observedValue ?? null,
        expectedValue: payload.expectedValue ?? null,
        link,
      });
    }

    // Send email alerts for critical findings
    if (payload.severity === 'critical' && recipientIds.length > 0 && process.env.RESEND_API_KEY) {
      try {
        // Email every eligible officer, not only the first recipient.
        const staffUsers = await db
          .select({ id: user.id, email: user.email, name: user.name })
          .from(user)
          .where(inArray(user.id, recipientIds));

        // Email each eligible officer individually
        for (const officer of staffUsers) {
          const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://taxflow.rra.gov.rw';
          const dashboardUrl = `${appUrl}${link}`;

          const html = await render(
            CriticalFindingAlert({
              findingType: payload.findingType,
              severity: 'critical',
              businessName: businessLabel,
              businessId: payload.businessId,
              productName: payload.productName ?? null,
              observedValue: payload.observedValue ?? null,
              expectedValue: payload.expectedValue ?? null,
              explanation: payload.explanation ?? `Critical ${payload.findingType} finding detected for ${businessLabel}.`,
              dashboardUrl,
              officerName: officer.name ?? null,
            }),
          );

          await getResend().emails.send({
            from: 'TaxFlow AI Monitor <onboarding@resend.dev>',
            to: officer.email,
            subject: `[CRITICAL AI FINDING] ${payload.findingType.replace(/_/g, ' ').toUpperCase()} — ${businessLabel}`,
            html,
          });
        }
      } catch (emailError) {
        console.error('[FindingRouter] Email alert failed (non-fatal):', emailError);
      }
    }

    return recipientIds;
  } catch (error) {
    console.error('[FindingRouter] Failed to route finding to RRA staff:', error);
    return [];
  }
}
