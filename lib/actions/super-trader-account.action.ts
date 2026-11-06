'use server';

import { and, desc, eq, ilike, inArray, or } from 'drizzle-orm';
import { z } from 'zod';
import db from '@/db/drizzle';
import { auditLog, session, user } from '@/db/schema';
import { requireRRASession } from '@/lib/auth-guard';
import { logAudit } from '@/lib/audit';

const traderRoles = ['manufacturer', 'wholesaler', 'retailer'] as const;
const searchSchema = z.object({ search: z.string().trim().max(120).default(''), role: z.enum(traderRoles).or(z.literal('all')).default('all'), status: z.enum(['all', 'pending', 'approved', 'under_review', 'suspended', 'rejected']).default('all') });
const idSchema = z.object({ traderId: z.string().trim().min(1).max(128) });
const editSchema = z.object({
  traderId: z.string().trim().min(1).max(128),
  name: z.string().trim().min(1).max(120),
  businessName: z.string().trim().max(160),
  email: z.string().trim().email().max(320),
  phoneNumber: z.string().trim().max(40),
  businessType: z.string().trim().min(1).max(80),
  reason: z.string().trim().min(10).max(1000),
});
const stateSchema = z.object({
  traderId: z.string().trim().min(1).max(128),
  action: z.enum(['approve', 'reject', 'under_review', 'suspend', 'restore', 'activate', 'deactivate', 'delete']),
  reason: z.string().trim().min(10).max(1000),
});
export type TraderAccountRecord = {
  id: string; name: string; businessName: string | null; email: string; phoneNumber: string | null;
  businessType: string; tinNumber: string | null; role: typeof traderRoles[number]; clearanceStatus: string;
  isActive: boolean; createdAt: Date; updatedAt: Date;
};
export type TraderAccountResult<T> = { success: true; data: T } | { success: false; error: string };

function isTraderRole(role: string): role is typeof traderRoles[number] {
  return traderRoles.some((traderRole) => traderRole === role);
}

function safeError(operation: string, error: unknown): string {
  console.error('[super-trader-account] operation failed', { operation, errorName: error instanceof Error ? error.name : 'UnknownError' });
  return 'The account operation could not be completed. Please refresh and try again.';
}

/** Search and inspect only trader accounts. Every request is guarded server-side. */
export async function searchSuperTraderAccounts(rawInput: unknown): Promise<TraderAccountResult<TraderAccountRecord[]>> {
  await requireRRASession('super_admin');
  const parsed = searchSchema.safeParse(rawInput);
  if (!parsed.success) return { success: false, error: 'Enter valid account search filters.' };
  try {
    const { search, role, status } = parsed.data;
    const conditions = [inArray(user.role, [...traderRoles])];
    if (role !== 'all') conditions.push(eq(user.role, role));
    if (status !== 'all') conditions.push(eq(user.clearanceStatus, status));
    if (search) {
      const pattern = `%${search}%`;
      conditions.push(or(ilike(user.name, pattern), ilike(user.businessName, pattern), ilike(user.email, pattern), ilike(user.tinNumber, pattern))!);
    }
    const rows = await db.select({
      id: user.id, name: user.name, businessName: user.businessName, email: user.email, phoneNumber: user.phoneNumber,
      businessType: user.businessType, tinNumber: user.tinNumber, role: user.role, clearanceStatus: user.clearanceStatus,
      isActive: user.isActive, createdAt: user.createdAt, updatedAt: user.updatedAt,
    }).from(user).where(and(...conditions)).orderBy(desc(user.updatedAt)).limit(100);
    return { success: true, data: rows.filter((row): row is TraderAccountRecord => isTraderRole(row.role)) };
  } catch (error) {
    return { success: false, error: safeError('search', error) };
  }
}

export async function getSuperTraderAccountHistory(rawInput: unknown): Promise<TraderAccountResult<Array<{
  id: string; actorId: string; action: string; metadata: string | null; beforeState: Record<string, unknown> | null;
  afterState: Record<string, unknown> | null; createdAt: Date;
}>>> {
  await requireRRASession('super_admin');
  const parsed = idSchema.safeParse(rawInput);
  if (!parsed.success) return { success: false, error: 'Select a valid trader account.' };
  try {
    const [target] = await db.select({ id: user.id }).from(user).where(and(eq(user.id, parsed.data.traderId), inArray(user.role, [...traderRoles]))).limit(1);
    if (!target) return { success: false, error: 'Trader account was not found.' };
    const history = await db.select({
      id: auditLog.id, actorId: auditLog.userId, action: auditLog.action, metadata: auditLog.metadata,
      beforeState: auditLog.beforeState, afterState: auditLog.afterState, createdAt: auditLog.createdAt,
    }).from(auditLog).where(and(eq(auditLog.targetType, 'user'), eq(auditLog.targetId, target.id))).orderBy(desc(auditLog.createdAt));
    return { success: true, data: history };
  } catch (error) {
    return { success: false, error: safeError('history', error) };
  }
}

/** Edit trader contact/profile fields transactionally; identity identifiers remain immutable here. */
export async function editSuperTraderAccount(rawInput: unknown): Promise<TraderAccountResult<null>> {
  const actor = await requireRRASession('super_admin');
  const parsed = editSchema.safeParse(rawInput);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Enter valid account details.' };
  const input = parsed.data;
  try {
    await db.transaction(async (tx) => {
      const [current] = await tx.select().from(user).where(eq(user.id, input.traderId)).for('update').limit(1);
      if (!current || !isTraderRole(current.role)) throw new Error('TRADER_NOT_FOUND');
      const beforeState = { name: current.name, businessName: current.businessName, email: current.email, emailVerified: current.emailVerified, phoneNumber: current.phoneNumber, businessType: current.businessType };
      const afterState = { name: input.name, businessName: input.businessName || null, email: input.email, emailVerified: input.email === current.email ? current.emailVerified : false, phoneNumber: input.phoneNumber || null, businessType: input.businessType };
      await tx.update(user).set({ ...afterState }).where(eq(user.id, current.id));
      await logAudit({ userId: actor.user.id, action: 'TRADER_ACCOUNT_PROFILE_UPDATED', targetType: 'user', targetId: current.id, metadata: { reason: input.reason, role: current.role }, beforeState, afterState }, async (entry) => { await tx.insert(auditLog).values(entry); });
    });
    return { success: true, data: null };
  } catch (error) {
    if (error instanceof Error && error.message === 'TRADER_NOT_FOUND') return { success: false, error: 'Trader account was not found.' };
    if (error instanceof Error && /unique|duplicate/i.test(error.message)) return { success: false, error: 'That email address or phone number is already in use.' };
    return { success: false, error: safeError('edit', error) };
  }
}

/** Apply an explicit, reasoned administrative decision and audit it atomically. */
export async function manageSuperTraderAccount(rawInput: unknown): Promise<TraderAccountResult<null>> {
  const actor = await requireRRASession('super_admin');
  const parsed = stateSchema.safeParse(rawInput);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Enter a valid account action and reason.' };
  const { traderId, action, reason } = parsed.data;
  try {
    await db.transaction(async (tx) => {
      const [current] = await tx.select().from(user).where(eq(user.id, traderId)).for('update').limit(1);
      if (!current || !isTraderRole(current.role)) throw new Error('TRADER_NOT_FOUND');
      if (action === 'restore' && current.isActive) throw new Error('ACCOUNT_ALREADY_ACTIVE');
      if (action === 'activate' && current.isActive) throw new Error('ACCOUNT_ALREADY_ACTIVE');
      if (action === 'activate' && ['suspended', 'rejected'].includes(current.clearanceStatus)) throw new Error('RESTORE_OR_APPROVE_REQUIRED');
      if (action === 'deactivate' && !current.isActive) throw new Error('ACCOUNT_ALREADY_INACTIVE');
      if (action === 'suspend' && current.clearanceStatus === 'suspended' && !current.isActive) throw new Error('ACCOUNT_ALREADY_SUSPENDED');
      if (action === 'delete' && !current.isActive) throw new Error('ACCOUNT_ALREADY_INACTIVE');

      let nextStatus = current.clearanceStatus;
      let nextActive = current.isActive;
      let auditAction = '';
      if (action === 'approve') { nextStatus = 'approved'; nextActive = true; auditAction = 'TRADER_ACCOUNT_APPROVED'; }
      if (action === 'reject') { nextStatus = 'rejected'; nextActive = false; auditAction = 'TRADER_ACCOUNT_REJECTED'; }
      if (action === 'under_review') { nextStatus = 'under_review'; auditAction = 'TRADER_ACCOUNT_MARKED_UNDER_REVIEW'; }
      if (action === 'suspend') { nextStatus = 'suspended'; nextActive = false; auditAction = 'TRADER_ACCOUNT_SUSPENDED'; }
      if (action === 'activate') { nextActive = true; auditAction = 'TRADER_ACCOUNT_ACTIVATED'; }
      if (action === 'deactivate') { nextActive = false; auditAction = 'TRADER_ACCOUNT_DEACTIVATED'; }
      if (action === 'delete') { nextStatus = 'suspended'; nextActive = false; auditAction = 'TRADER_ACCOUNT_SOFT_DELETED'; }
      if (action === 'restore') {
        const [previousDecision] = await tx.select({ beforeState: auditLog.beforeState, metadata: auditLog.metadata }).from(auditLog)
          .where(and(eq(auditLog.targetType, 'user'), eq(auditLog.targetId, current.id), inArray(auditLog.action, ['TRADER_ACCOUNT_SUSPENDED', 'TRADER_ACCOUNT_SOFT_DELETED', 'TRADER_ACCOUNT_REJECTED', 'TRADER_ACCOUNT_DEACTIVATED', 'MANUFACTURER_ACCOUNT_SUSPENDED'])))
          .orderBy(desc(auditLog.createdAt)).limit(1);
        const previousState = previousDecision?.beforeState;
        let legacyMetadata: { previousStatus?: unknown } | null = null;
        try { legacyMetadata = previousDecision?.metadata ? JSON.parse(previousDecision.metadata) as { previousStatus?: unknown } : null; } catch { legacyMetadata = null; }
        const priorStatus = previousState?.clearanceStatus ?? legacyMetadata?.previousStatus;
        nextStatus = typeof priorStatus === 'string' && ['pending', 'approved', 'under_review', 'rejected'].includes(priorStatus) ? priorStatus : 'under_review';
        nextActive = true;
        auditAction = 'TRADER_ACCOUNT_RESTORED';
      }

      const beforeState = { role: current.role, clearanceStatus: current.clearanceStatus, isActive: current.isActive };
      const afterState = { role: current.role, clearanceStatus: nextStatus, isActive: nextActive };
      await tx.update(user).set({ clearanceStatus: nextStatus, isActive: nextActive }).where(eq(user.id, current.id));
      if (!nextActive) await tx.delete(session).where(eq(session.userId, current.id));
      await logAudit({ userId: actor.user.id, action: auditAction, targetType: 'user', targetId: current.id, metadata: { reason, role: current.role }, beforeState, afterState }, async (entry) => { await tx.insert(auditLog).values(entry); });
    });
    return { success: true, data: null };
  } catch (error) {
    if (error instanceof Error && error.message === 'TRADER_NOT_FOUND') return { success: false, error: 'Trader account was not found.' };
    if (error instanceof Error && error.message === 'ACCOUNT_ALREADY_ACTIVE') return { success: false, error: 'This account is already active.' };
    if (error instanceof Error && error.message === 'ACCOUNT_ALREADY_INACTIVE') return { success: false, error: 'This account is already inactive.' };
    if (error instanceof Error && error.message === 'ACCOUNT_ALREADY_SUSPENDED') return { success: false, error: 'This account is already suspended.' };
    if (error instanceof Error && error.message === 'RESTORE_OR_APPROVE_REQUIRED') return { success: false, error: 'Use Restore or Approve for suspended or rejected accounts.' };
    return { success: false, error: safeError('manage', error) };
  }
}
