'use server';

import db from '@/db/drizzle';
import { auditLog } from '@/db/schema';

/**
 * Log an auditable event.
 * Called from server actions on every mutation (transactions, clearance changes, etc.)
 */
export async function logAudit(params: {
  userId: string;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  beforeState?: Record<string, unknown>;
  afterState?: Record<string, unknown>;
}): Promise<void> {
  await db.insert(auditLog).values({
    userId: params.userId,
    action: params.action,
    targetType: params.targetType ?? null,
    targetId: params.targetId ?? null,
    metadata: params.metadata ? JSON.stringify(params.metadata) : null,
    beforeState: params.beforeState,
    afterState: params.afterState,
  });
}
