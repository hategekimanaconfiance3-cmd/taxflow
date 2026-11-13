'use server';

import { eq } from 'drizzle-orm';
import db from '@/db/drizzle';
import { user } from '@/db/schema';
import { requireRRASession } from '@/lib/auth-guard';
import { logAudit } from '@/lib/audit';
import { z } from 'zod';

const deleteTaxpayerSchema = z.object({
  tinNumber: z.string().regex(/^[0-9]{9}$/, 'TIN must be exactly 9 digits'),
  reason: z.string().min(10, 'Reason must be at least 10 characters').max(1000, 'Reason must not exceed 1000 characters'),
});

export type DeleteTaxpayerResult =
  | { success: true; tinNumber: string; businessName: string | null }
  | { success: false; error: string };

/**
 * Soft-delete a taxpayer by TIN number.
 * Sets isActive = false and clearanceStatus = 'suspended'.
 * Only the Super Admin can perform this action, and a reason is mandatory.
 * The operation is fully audit-logged with before/after state.
 */
export async function deleteTaxpayerByTin(
  rawInput: { tinNumber: string; reason: string },
): Promise<DeleteTaxpayerResult> {
  // 1. Require super_admin session
  const session = await requireRRASession('super_admin');

  // 2. Validate input
  const parsed = deleteTaxpayerSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }
  const { tinNumber, reason } = parsed.data;

  // 3. Find the taxpayer by TIN
  const [taxpayer] = await db
    .select()
    .from(user)
    .where(eq(user.tinNumber, tinNumber))
    .limit(1);

  if (!taxpayer) {
    return { success: false, error: `No taxpayer found with TIN ${tinNumber}` };
  }

  // 4. Prevent deleting TF staff accounts
  if (taxpayer.role === 'rra_staff') {
    return { success: false, error: 'Cannot delete an TF staff account. Use Admin Management instead.' };
  }

  // 5. Prevent deleting already-deactivated accounts
  if (taxpayer.isActive === false) {
    return { success: false, error: `Taxpayer ${tinNumber} is already deactivated` };
  }

  // 6. Capture before state
  const beforeState = {
    id: taxpayer.id,
    tinNumber: taxpayer.tinNumber,
    name: taxpayer.name,
    businessName: taxpayer.businessName,
    email: taxpayer.email,
    role: taxpayer.role,
    isActive: taxpayer.isActive,
    clearanceStatus: taxpayer.clearanceStatus,
  };

  // 7. Soft-delete: deactivate and suspend
  await db
    .update(user)
    .set({
      isActive: false,
      clearanceStatus: 'suspended',
    })
    .where(eq(user.id, taxpayer.id));

  const afterState = {
    ...beforeState,
    isActive: false,
    clearanceStatus: 'suspended',
  };

  // 8. Audit log with full context
  await logAudit({
    userId: session.user.id,
    action: 'TAXPAYER_DELETED',
    targetType: 'user',
    targetId: taxpayer.id,
    metadata: {
      tinNumber,
      reason,
      deletedBy: session.user.id,
      deletedByName: session.user.name,
      taxpayerName: taxpayer.name,
      businessName: taxpayer.businessName,
    },
    beforeState,
    afterState,
  });

  return {
    success: true,
    tinNumber,
    businessName: taxpayer.businessName,
  };
}
