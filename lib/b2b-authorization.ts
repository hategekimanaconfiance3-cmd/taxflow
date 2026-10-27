import 'server-only';

import { and, eq } from 'drizzle-orm';
import db from '@/db/drizzle';
import { businessRepresentative, user } from '@/db/schema';

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function assertVerifiedBusinessOwner(tx: DbTransaction, businessId: string): Promise<void> {
  const [business] = await tx.select({
    id: user.id,
    emailVerified: user.emailVerified,
    tinNumber: user.tinNumber,
    businessName: user.businessName,
    clearanceStatus: user.clearanceStatus,
    isActive: user.isActive,
  }).from(user).where(eq(user.id, businessId)).for('update').limit(1);

  if (!business || !business.isActive || business.clearanceStatus !== 'approved' || !business.emailVerified || !business.tinNumber || !business.businessName?.trim()) {
    throw new Error('The registered business owner must have a verified email, Taxpayer Identification Number, approved clearance, and active account.');
  }
}

export async function assertBusinessActor(
  tx: DbTransaction,
  businessId: string,
  actorUserId: string,
): Promise<'owner' | 'representative'> {
  await assertVerifiedBusinessOwner(tx, businessId);
  if (businessId === actorUserId) return 'owner';

  const [actor] = await tx.select({
    id: user.id,
    emailVerified: user.emailVerified,
    clearanceStatus: user.clearanceStatus,
    isActive: user.isActive,
  }).from(user).where(eq(user.id, actorUserId)).limit(1);
  if (!actor || !actor.isActive || actor.clearanceStatus !== 'approved' || !actor.emailVerified) {
    throw new Error('The acting account must be active, approved, and email-verified.');
  }

  const [membership] = await tx.select({ id: businessRepresentative.id })
    .from(businessRepresentative)
    .where(and(
      eq(businessRepresentative.businessId, businessId),
      eq(businessRepresentative.representativeUserId, actorUserId),
      eq(businessRepresentative.status, 'active'),
    ))
    .for('update')
    .limit(1);
  if (!membership) throw new Error('This account is not an active representative for the receiving business.');
  return 'representative';
}
