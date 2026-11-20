import { and, desc, eq, gte, ilike, lte, or, sql } from 'drizzle-orm';
import db from '@/db/drizzle';
import { tinDb } from '@/db/tin-drizzle';
import { tinRecord } from '@/db/tin-schema';
import {
  auditLog,
  merchantPriceHistory,
  notification,
  priceChangeAlert,
  priceChangeAlertRecipient,
  priceChangeAlertExplanation,
  priceMonitoringPolicy,
  product,
  rraStaff,
  rraStaffJurisdiction,
  rraStaffRole,
  stock,
  user,
} from '@/db/schema';
import { emitToUser } from '@/lib/realtime';
import { hasRRAPermission, isRRARole, type RRARole } from '@/lib/rra-rbac';
import type { z } from 'zod';
import { priceAlertExplanationSchema, priceMonitoringPolicySchema, type priceAlertQuerySchema } from '@/lib/validation/price-monitoring.schema';
import { calculatePercentageChange, priceDirection } from '@/lib/price-monitoring-domain';

type TaxflowTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type StaffScope = {
  id: string;
  clearanceLevel: string;
  clearanceRoles?: RRARole[];
};
type PriceAlertFilters = z.infer<typeof priceAlertQuerySchema>;

type PricePolicy = {
  increaseThresholdPercent: number;
  decreaseThresholdPercent: number;
  absoluteDifferenceRwf: number;
  mediumThresholdPercent: number;
  highThresholdPercent: number;
  criticalThresholdPercent: number;
};

const DEFAULT_PRICE_POLICY: PricePolicy = {
  increaseThresholdPercent: 5,
  decreaseThresholdPercent: 5,
  absoluteDifferenceRwf: 0,
  mediumThresholdPercent: 10,
  highThresholdPercent: 20,
  criticalThresholdPercent: 50,
};

export type MerchantLocation = { province: string | null; district: string | null };

export type PriceChangeResult =
  | { kind: 'initial'; historyId: string; price: number }
  | { kind: 'unchanged'; historyId: null; price: number }
  | { kind: 'changed'; historyId: string; alertId: string | null; recipients: number; assigned: boolean; significant: boolean; severity: string | null; price: number; previousPrice: number; percentageChange: number }
  | { kind: 'duplicate'; historyId: string; alertId: string | null; price: number };

/** TIN location is read-only government registry data. A missing/unavailable lookup leaves the alert unassigned. */
export async function lookupMerchantLocation(tinNumber: string | null): Promise<MerchantLocation> {
  if (!tinNumber) return { province: null, district: null };
  try {
    const [record] = await tinDb
      .select({ province: tinRecord.province, district: tinRecord.district })
      .from(tinRecord)
      .where(eq(tinRecord.tinNumber, tinNumber))
      .limit(1);
    return { province: record?.province ?? null, district: record?.district ?? null };
  } catch (error) {
    console.error('[price-monitoring:location-lookup]', { errorName: error instanceof Error ? error.name : 'UnknownError' });
    return { province: null, district: null };
  }
}

function rolesForStaff(staff: StaffScope): RRARole[] {
  const roles = staff.clearanceRoles?.length ? staff.clearanceRoles : [staff.clearanceLevel];
  return roles.filter(isRRARole);
}

function isSuperAdmin(staff: StaffScope): boolean {
  return rolesForStaff(staff).includes('super_admin');
}

async function getStaffJurisdictions(staffRecordId: string, executor: typeof db | TaxflowTransaction = db) {
  return executor.select({
    scopeType: rraStaffJurisdiction.scopeType,
    province: rraStaffJurisdiction.province,
    district: rraStaffJurisdiction.district,
  }).from(rraStaffJurisdiction).where(eq(rraStaffJurisdiction.staffRecordId, staffRecordId));
}

function scopeMatches(scope: { scopeType: string; province: string | null; district: string | null }, location: MerchantLocation): boolean {
  if (scope.scopeType === 'national') return true;
  if (!location.province) return false;
  if (scope.scopeType === 'province') return scope.province === location.province;
  return scope.province === location.province && scope.district === location.district;
}

async function staffCanAccessLocation(staff: StaffScope, location: MerchantLocation): Promise<boolean> {
  if (isSuperAdmin(staff)) return true;
  const scopes = await getStaffJurisdictions(staff.id);
  return scopes.some((scope) => scopeMatches(scope, location));
}

async function resolveRecipients(tx: TaxflowTransaction, location: MerchantLocation) {
  const rows = await tx.select({
    staffRecordId: rraStaff.id,
    userId: rraStaff.userId,
    clearanceLevel: rraStaff.clearanceLevel,
    role: rraStaffRole.role,
    scopeType: rraStaffJurisdiction.scopeType,
    province: rraStaffJurisdiction.province,
    district: rraStaffJurisdiction.district,
  })
    .from(rraStaff)
    .innerJoin(user, eq(user.id, rraStaff.userId))
    .leftJoin(rraStaffRole, eq(rraStaffRole.staffRecordId, rraStaff.id))
    .leftJoin(rraStaffJurisdiction, eq(rraStaffJurisdiction.staffRecordId, rraStaff.id))
    .where(and(eq(rraStaff.isActive, true), eq(user.isActive, true)));

  const grouped = new Map<string, {
    userId: string;
    roles: string[];
    scopes: { scopeType: string; province: string | null; district: string | null }[];
  }>();
  for (const row of rows) {
    const entry = grouped.get(row.staffRecordId) ?? { userId: row.userId, roles: [], scopes: [] };
    if (row.role) entry.roles.push(row.role);
    if (row.clearanceLevel) entry.roles.push(row.clearanceLevel);
    if (row.scopeType) entry.scopes.push({ scopeType: row.scopeType, province: row.province, district: row.district });
    grouped.set(row.staffRecordId, entry);
  }

  const recipients: { userId: string; scopeType: string }[] = [];
  let assignedStaffId: string | null = null;
  let bestScopeRank = -1;
  for (const [staffRecordId, entry] of grouped) {
    const roles = [...new Set(entry.roles)].filter(isRRARole);
    if (!roles.some((role) => hasRRAPermission(role, 'price.alert.read'))) continue;
    const superAdmin = roles.includes('super_admin');
    const matchingScope = superAdmin
      ? { scopeType: 'national' }
      : entry.scopes.find((scope) => scopeMatches(scope, location));
    if (!matchingScope) continue;
    recipients.push({ userId: entry.userId, scopeType: matchingScope.scopeType });
    if (!superAdmin) {
      const rank = matchingScope.scopeType === 'district' ? 2 : matchingScope.scopeType === 'province' ? 1 : 0;
      if (rank > bestScopeRank) {
        bestScopeRank = rank;
        assignedStaffId = staffRecordId;
      }
    }
  }
  // A user may have more than one staff record or matching scope. Keep one
  // notification per user and retain the most specific matching scope.
  const deduplicated = new Map<string, { userId: string; scopeType: string; rank: number }>();
  for (const recipient of recipients) {
    const rank = recipient.scopeType === 'district' ? 2 : recipient.scopeType === 'province' ? 1 : 0;
    const existing = deduplicated.get(recipient.userId);
    if (!existing || rank > existing.rank) deduplicated.set(recipient.userId, { ...recipient, rank });
  }
  return {
    recipients: [...deduplicated.values()].map(({ userId, scopeType }) => ({ userId, scopeType })),
    assignedStaffId,
  };
}

async function resolvePricePolicy(tx: TaxflowTransaction, productId: string, categoryCode: string | null): Promise<PricePolicy> {
  const rows = await tx.select().from(priceMonitoringPolicy).where(and(
    eq(priceMonitoringPolicy.isActive, true),
    or(
      and(eq(priceMonitoringPolicy.scopeType, 'product'), eq(priceMonitoringPolicy.scopeKey, productId)),
      ...(categoryCode ? [and(eq(priceMonitoringPolicy.scopeType, 'category'), eq(priceMonitoringPolicy.scopeKey, categoryCode))] : []),
      and(eq(priceMonitoringPolicy.scopeType, 'default'), eq(priceMonitoringPolicy.scopeKey, '*')),
    ),
  ));
  const selected = rows.find((row) => row.scopeType === 'product')
    ?? rows.find((row) => row.scopeType === 'category')
    ?? rows.find((row) => row.scopeType === 'default');
  return selected ? {
    increaseThresholdPercent: selected.increaseThresholdPercent,
    decreaseThresholdPercent: selected.decreaseThresholdPercent,
    absoluteDifferenceRwf: selected.absoluteDifferenceRwf,
    mediumThresholdPercent: selected.mediumThresholdPercent,
    highThresholdPercent: selected.highThresholdPercent,
    criticalThresholdPercent: selected.criticalThresholdPercent,
  } : DEFAULT_PRICE_POLICY;
}

function severityForChange(percentageChange: number, policy: PricePolicy): 'low' | 'medium' | 'high' | 'critical' {
  const magnitude = Math.abs(percentageChange);
  if (magnitude >= policy.criticalThresholdPercent) return 'critical';
  if (magnitude >= policy.highThresholdPercent) return 'high';
  if (magnitude >= policy.mediumThresholdPercent) return 'medium';
  return 'low';
}

function notificationMessage(input: {
  merchantName: string | null;
  tinNumber: string | null;
  productName: string;
  productId: string;
  previousPrice: number;
  newPrice: number;
  difference: number;
  percentage: number;
  actorName: string;
  location: MerchantLocation;
  reason?: string;
}) {
  const sign = input.difference > 0 ? '+' : '';
  return [
    `Merchant: ${input.merchantName ?? 'Unknown business'} (${input.tinNumber ?? 'TIN unavailable'})`,
    `Product: ${input.productName} [${input.productId}]`,
    `Previous price: ${input.previousPrice.toLocaleString()} RWF`,
    `New price: ${input.newPrice.toLocaleString()} RWF`,
    `Change: ${sign}${input.difference.toLocaleString()} RWF (${sign}${input.percentage.toFixed(2)}%)`,
    `Changed by: ${input.actorName}`,
    `Location: ${input.location.district ?? 'District unavailable'}, ${input.location.province ?? 'Province unavailable'}`,
    `Reason: ${input.reason?.trim() || 'Not provided'}`,
    'Status: Pending review.',
  ].join('\n').slice(0, 2_000);
}

/**
 * The only normal merchant catalog-price mutation path. Stock, immutable history,
 * alert, recipient notifications, and audit evidence commit in one transaction.
 */
export async function updateMerchantSellingPrice(input: {
  businessId: string;
  productId: string;
  newPrice: number;
  actorUserId?: string;
  actorName: string;
  reason?: string;
  idempotencyKey: string;
}): Promise<PriceChangeResult> {
  const location = await lookupMerchantLocation((await db.select({ tin: user.tinNumber }).from(user).where(eq(user.id, input.businessId)).limit(1))[0]?.tin ?? null);
  const persisted = await db.transaction(async (tx) => {
    const [current] = await tx.select({
      id: stock.id,
      productId: stock.productId,
      businessId: stock.businessId,
      currentPrice: stock.price,
      unit: product.unit,
      productName: product.name,
      categoryCode: product.categoryCode,
      merchantName: user.businessName,
      tinNumber: user.tinNumber,
    })
      .from(stock)
      .innerJoin(product, eq(product.id, stock.productId))
      .innerJoin(user, eq(user.id, stock.businessId))
      .where(and(eq(stock.businessId, input.businessId), eq(stock.productId, input.productId)))
      .for('update')
      .limit(1);
    if (!current) throw new Error('Create the product stock record before changing its selling price.');

    const [existing] = await tx.select({ id: merchantPriceHistory.id, businessId: merchantPriceHistory.businessId, productId: merchantPriceHistory.productId, newPrice: merchantPriceHistory.newPrice })
      .from(merchantPriceHistory)
      .where(and(eq(merchantPriceHistory.sourceType, 'merchant_price_update'), eq(merchantPriceHistory.sourceId, input.idempotencyKey)))
      .limit(1);
    if (existing) {
      if (existing.businessId !== input.businessId || existing.productId !== input.productId || existing.newPrice !== input.newPrice) {
        throw new Error('This idempotency key was already used for a different price update.');
      }
      const [existingAlert] = await tx.select({ id: priceChangeAlert.id }).from(priceChangeAlert).where(eq(priceChangeAlert.priceHistoryId, existing.id)).limit(1);
      return { kind: 'duplicate' as const, historyId: existing.id, alertId: existingAlert?.id ?? null, price: existing.newPrice };
    }

    if (current.currentPrice === input.newPrice) {
      return { kind: 'unchanged' as const, historyId: null, price: input.newPrice };
    }

    if (current.currentPrice === null) {
      await tx.update(stock).set({ price: input.newPrice, updatedAt: new Date() }).where(eq(stock.id, current.id));
      const [history] = await tx.insert(merchantPriceHistory).values({
        businessId: input.businessId, productId: input.productId, previousPrice: null, newPrice: input.newPrice,
        differenceRwf: 0, percentageChange: 0, unit: current.unit, changeKind: 'initial',
        sourceType: 'merchant_price_update', sourceId: input.idempotencyKey, actorUserId: input.actorUserId ?? input.businessId,
        reason: input.reason?.trim() || null,
      }).returning({ id: merchantPriceHistory.id });
      if (!history) throw new Error('Price history could not be created.');
      await tx.insert(auditLog).values({ userId: input.businessId, action: 'MERCHANT_PRICE_INITIALIZED', targetType: 'merchant_price_history', targetId: history.id,
        metadata: JSON.stringify({ productId: input.productId, newPrice: input.newPrice, reason: input.reason?.trim() || null }) });
      return { kind: 'initial' as const, historyId: history.id, price: input.newPrice };
    }

    const direction = priceDirection(current.currentPrice, input.newPrice);
    if (direction === 'unchanged') return { kind: 'unchanged' as const, historyId: null, price: input.newPrice };
    const difference = input.newPrice - current.currentPrice;
    const percentage = calculatePercentageChange(current.currentPrice, input.newPrice);
    await tx.update(stock).set({ price: input.newPrice, updatedAt: new Date() }).where(eq(stock.id, current.id));
    const [history] = await tx.insert(merchantPriceHistory).values({
      businessId: input.businessId, productId: input.productId, previousPrice: current.currentPrice, newPrice: input.newPrice,
      differenceRwf: difference, percentageChange: percentage, unit: current.unit, changeKind: 'merchant_update',
      sourceType: 'merchant_price_update', sourceId: input.idempotencyKey, actorUserId: input.actorUserId ?? input.businessId,
      reason: input.reason?.trim() || null,
    }).returning({ id: merchantPriceHistory.id });
    if (!history) throw new Error('Price history could not be created.');

    const policy = await resolvePricePolicy(tx, input.productId, current.categoryCode);
    const absoluteDifference = Math.abs(difference);
    const directionThreshold = direction === 'increase' ? policy.increaseThresholdPercent : policy.decreaseThresholdPercent;
    const significant = Math.abs(percentage) >= directionThreshold || (policy.absoluteDifferenceRwf > 0 && absoluteDifference >= policy.absoluteDifferenceRwf);
    if (!significant) {
      await tx.insert(auditLog).values({ userId: input.actorUserId ?? input.businessId, action: 'MERCHANT_PRICE_CHANGED_BELOW_ALERT_THRESHOLD', targetType: 'merchant_price_history', targetId: history.id,
        metadata: JSON.stringify({ productId: input.productId, previousPrice: current.currentPrice, newPrice: input.newPrice, percentageChange: percentage, policy }) });
      return { kind: 'changed' as const, historyId: history.id, alertId: null, recipients: 0, assigned: false, significant: false, severity: null, price: input.newPrice, previousPrice: current.currentPrice, percentageChange: percentage, realtime: [] };
    }
    const severity = severityForChange(percentage, policy);
    const alertReason = `${direction} of ${Math.abs(percentage).toFixed(2)}% exceeded the ${directionThreshold}% policy threshold${policy.absoluteDifferenceRwf > 0 ? ` or RWF ${policy.absoluteDifferenceRwf.toLocaleString()} absolute threshold` : ''}.`;

    const resolved = await resolveRecipients(tx, location);
    const [alert] = await tx.insert(priceChangeAlert).values({
      priceHistoryId: history.id, businessId: input.businessId, productId: input.productId,
      merchantProvince: location.province, merchantDistrict: location.district, direction,
      previousPrice: current.currentPrice, newPrice: input.newPrice, differenceRwf: difference,
      percentageChange: percentage, severity, alertReason, assignmentStatus: resolved.assignedStaffId ? 'assigned' : 'unassigned',
      assignedStaffId: resolved.assignedStaffId,
    }).returning({ id: priceChangeAlert.id });
    if (!alert) throw new Error('Price alert could not be created.');

    const message = notificationMessage({ merchantName: current.merchantName, tinNumber: current.tinNumber,
      productName: current.productName, productId: input.productId, previousPrice: current.currentPrice,
      newPrice: input.newPrice, difference, percentage, actorName: input.actorName, location, reason: input.reason });
    const createdNotifications = resolved.recipients.length ? await tx.insert(notification).values(resolved.recipients.map((recipient) => ({
      userId: recipient.userId, type: 'price_change_detected', title: `Price change detected: ${current.productName}`,
      message, link: `/admin/price-alerts/${alert.id}`,
    }))).returning({ id: notification.id, userId: notification.userId, type: notification.type, title: notification.title, message: notification.message, link: notification.link }) : [];
    if (createdNotifications.length) {
      await tx.insert(priceChangeAlertRecipient).values(createdNotifications.map((created, index) => ({
        alertId: alert.id, recipientUserId: created.userId, scopeType: resolved.recipients[index]?.scopeType ?? 'national', notificationId: created.id,
      })));
    }
    await tx.insert(auditLog).values({ userId: input.actorUserId ?? input.businessId, action: 'MERCHANT_PRICE_CHANGED', targetType: 'price_change_alert', targetId: alert.id,
      metadata: JSON.stringify({ productId: input.productId, historyId: history.id, direction, previousPrice: current.currentPrice, newPrice: input.newPrice,
        differenceRwf: difference, percentageChange: percentage, location, recipients: resolved.recipients.length, reason: input.reason?.trim() || null }) });
    return { kind: 'changed' as const, historyId: history.id, alertId: alert.id, recipients: createdNotifications.length,
      assigned: Boolean(resolved.assignedStaffId), significant: true, severity, price: input.newPrice, previousPrice: current.currentPrice, percentageChange: percentage,
      realtime: createdNotifications };
  });

  if (persisted.kind === 'changed') {
    const { realtime, ...result } = persisted;
    for (const created of realtime) {
      try { emitToUser(created.userId, 'notification', created); } catch (error) {
        console.error('[price-monitoring:realtime]', { errorName: error instanceof Error ? error.name : 'UnknownError' });
      }
    }
    return result;
  }
  return persisted;
}

export async function listPriceAlerts(staff: StaffScope, filters: PriceAlertFilters) {
  const conditions = [];
  if (!isSuperAdmin(staff)) {
    const scopes = await getStaffJurisdictions(staff.id);
    const scopeConditions = scopes.map((scope) => {
      if (scope.scopeType === 'national') return sql`TRUE`;
      if (!scope.province) return eq(priceChangeAlert.id, '__no_scope__');
      if (scope.scopeType === 'province') return eq(priceChangeAlert.merchantProvince, scope.province);
      if (!scope.district) return eq(priceChangeAlert.id, '__no_scope__');
      return and(eq(priceChangeAlert.merchantProvince, scope.province), eq(priceChangeAlert.merchantDistrict, scope.district));
    });
    conditions.push(scopeConditions.length ? or(...scopeConditions) : eq(priceChangeAlert.id, '__no_scope__'));
  }
  if (filters.direction) conditions.push(eq(priceChangeAlert.direction, filters.direction));
  if (filters.status) conditions.push(eq(priceChangeAlert.status, filters.status));
  if (filters.severity) conditions.push(eq(priceChangeAlert.severity, filters.severity));
  if (filters.district) conditions.push(eq(priceChangeAlert.merchantDistrict, filters.district));
  if (filters.tin) conditions.push(eq(user.tinNumber, filters.tin));
  if (filters.product) conditions.push(ilike(product.name, `%${filters.product}%`));
  if (filters.category) conditions.push(eq(product.categoryCode, filters.category));
  if (filters.productId) conditions.push(eq(priceChangeAlert.productId, filters.productId));
  if (filters.businessId) conditions.push(eq(priceChangeAlert.businessId, filters.businessId));
  if (filters.minPercentage !== undefined) conditions.push(gte(priceChangeAlert.percentageChange, filters.minPercentage));
  if (filters.maxPercentage !== undefined) conditions.push(lte(priceChangeAlert.percentageChange, filters.maxPercentage));
  if (filters.from) conditions.push(gte(priceChangeAlert.createdAt, filters.from));
  if (filters.to) conditions.push(lte(priceChangeAlert.createdAt, filters.to));
  const rows = await db.select({
    id: priceChangeAlert.id, businessId: priceChangeAlert.businessId, merchantName: user.businessName, tinNumber: user.tinNumber,
    productId: priceChangeAlert.productId, productName: product.name, merchantProvince: priceChangeAlert.merchantProvince,
    merchantDistrict: priceChangeAlert.merchantDistrict, direction: priceChangeAlert.direction, previousPrice: priceChangeAlert.previousPrice,
    newPrice: priceChangeAlert.newPrice, differenceRwf: priceChangeAlert.differenceRwf, percentageChange: priceChangeAlert.percentageChange, severity: priceChangeAlert.severity,
    status: priceChangeAlert.status, assignmentStatus: priceChangeAlert.assignmentStatus, createdAt: priceChangeAlert.createdAt,
  }).from(priceChangeAlert)
    .innerJoin(user, eq(user.id, priceChangeAlert.businessId))
    .innerJoin(product, eq(product.id, priceChangeAlert.productId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(priceChangeAlert.createdAt)).limit(250);
  return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
}

export async function listPriceMonitoringPolicies() {
  return db.select().from(priceMonitoringPolicy).orderBy(priceMonitoringPolicy.scopeType, priceMonitoringPolicy.scopeKey);
}

export async function upsertPriceMonitoringPolicy(actorUserId: string, rawInput: unknown) {
  const parsed = priceMonitoringPolicySchema.safeParse(rawInput);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Invalid price-monitoring policy.');
  const input = parsed.data;
  return db.transaction(async (tx) => {
    const [existing] = await tx.select({ id: priceMonitoringPolicy.id }).from(priceMonitoringPolicy).where(and(eq(priceMonitoringPolicy.scopeType, input.scopeType), eq(priceMonitoringPolicy.scopeKey, input.scopeKey))).for('update').limit(1);
    const values = { scopeType: input.scopeType, scopeKey: input.scopeKey, increaseThresholdPercent: input.increaseThresholdPercent, decreaseThresholdPercent: input.decreaseThresholdPercent, absoluteDifferenceRwf: input.absoluteDifferenceRwf, mediumThresholdPercent: input.mediumThresholdPercent, highThresholdPercent: input.highThresholdPercent, criticalThresholdPercent: input.criticalThresholdPercent, isActive: true, updatedByUserId: actorUserId };
    const [policy] = existing
      ? await tx.update(priceMonitoringPolicy).set(values).where(eq(priceMonitoringPolicy.id, existing.id)).returning()
      : await tx.insert(priceMonitoringPolicy).values({ ...values, createdByUserId: actorUserId }).returning();
    if (!policy) throw new Error('Price-monitoring policy could not be saved.');
    await tx.insert(auditLog).values({ userId: actorUserId, action: 'PRICE_MONITORING_POLICY_UPDATED', targetType: 'price_monitoring_policy', targetId: policy.id, afterState: { ...values, reason: input.reason }, metadata: JSON.stringify({ reason: input.reason }) });
    return policy;
  });
}

export async function getPriceAlertDetail(staff: StaffScope, alertId: string) {
  const [row] = await db.select({
    id: priceChangeAlert.id, businessId: priceChangeAlert.businessId, merchantName: user.businessName, tinNumber: user.tinNumber,
    productId: priceChangeAlert.productId, productName: product.name, merchantProvince: priceChangeAlert.merchantProvince,
    merchantDistrict: priceChangeAlert.merchantDistrict, direction: priceChangeAlert.direction, previousPrice: priceChangeAlert.previousPrice,
    newPrice: priceChangeAlert.newPrice, differenceRwf: priceChangeAlert.differenceRwf, percentageChange: priceChangeAlert.percentageChange, severity: priceChangeAlert.severity, alertReason: priceChangeAlert.alertReason,
    status: priceChangeAlert.status, assignmentStatus: priceChangeAlert.assignmentStatus, reviewNote: priceChangeAlert.reviewNote,
    createdAt: priceChangeAlert.createdAt,
  }).from(priceChangeAlert).innerJoin(user, eq(user.id, priceChangeAlert.businessId)).innerJoin(product, eq(product.id, priceChangeAlert.productId))
    .where(eq(priceChangeAlert.id, alertId)).limit(1);
  if (!row) return null;
  if (!(await staffCanAccessLocation(staff, { province: row.merchantProvince, district: row.merchantDistrict }))) return null;
  const history = await db.select({ id: merchantPriceHistory.id, previousPrice: merchantPriceHistory.previousPrice, newPrice: merchantPriceHistory.newPrice,
    percentageChange: merchantPriceHistory.percentageChange, reason: merchantPriceHistory.reason, changeKind: merchantPriceHistory.changeKind,
    changedAt: merchantPriceHistory.changedAt, actorUserId: merchantPriceHistory.actorUserId })
    .from(merchantPriceHistory).where(eq(merchantPriceHistory.id, (await db.select({ id: priceChangeAlert.priceHistoryId }).from(priceChangeAlert).where(eq(priceChangeAlert.id, alertId)).limit(1))[0]?.id ?? '__missing__')).limit(1);
  const merchantHistory = await listMerchantPriceHistory(staff, row.businessId);
  const explanations = await db.select({ id: priceChangeAlertExplanation.id, explanation: priceChangeAlertExplanation.explanation, supportingDocumentUrl: priceChangeAlertExplanation.supportingDocumentUrl, submittedByUserId: priceChangeAlertExplanation.submittedByUserId, createdAt: priceChangeAlertExplanation.createdAt }).from(priceChangeAlertExplanation).where(eq(priceChangeAlertExplanation.alertId, alertId)).orderBy(desc(priceChangeAlertExplanation.createdAt));
  return { ...row, createdAt: row.createdAt.toISOString(), history: history[0] ? { ...history[0], changedAt: history[0].changedAt.toISOString() } : null, recentHistory: merchantHistory, explanations: explanations.map((item) => ({ ...item, createdAt: item.createdAt.toISOString() })) };
}

export async function submitPriceAlertExplanation(businessId: string, alertId: string, rawInput: unknown) {
  const parsed = priceAlertExplanationSchema.safeParse(rawInput);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Enter a valid explanation.');
  const [alert] = await db.select({ id: priceChangeAlert.id, businessId: priceChangeAlert.businessId }).from(priceChangeAlert).where(and(eq(priceChangeAlert.id, alertId), eq(priceChangeAlert.businessId, businessId))).limit(1);
  if (!alert) throw new Error('Price alert not found.');
  const [created] = await db.insert(priceChangeAlertExplanation).values({ alertId, businessId, submittedByUserId: businessId, explanation: parsed.data.explanation, supportingDocumentUrl: parsed.data.supportingDocumentUrl ?? null }).returning();
  if (!created) throw new Error('Explanation could not be saved.');
  await db.insert(auditLog).values({ userId: businessId, action: 'PRICE_ALERT_EXPLANATION_SUBMITTED', targetType: 'price_change_alert', targetId: alertId, metadata: JSON.stringify({ explanationId: created.id, hasSupportingDocument: Boolean(parsed.data.supportingDocumentUrl) }) });
  return { id: created.id, createdAt: created.createdAt.toISOString() };
}

export async function reviewPriceAlert(staff: StaffScope, alertId: string, action: 'review' | 'escalate' | 'mark_suspicious' | 'resolve', reason: string, actorUserId: string) {
  const detail = await getPriceAlertDetail(staff, alertId);
  if (!detail) throw new Error('Price alert not found or outside your jurisdiction.');
  const now = new Date();
  await db.transaction(async (tx) => {
    const [locked] = await tx.select({ id: priceChangeAlert.id, status: priceChangeAlert.status }).from(priceChangeAlert).where(eq(priceChangeAlert.id, alertId)).for('update').limit(1);
    if (!locked) throw new Error('Price alert not found.');
    const nextStatus = action === 'review' ? 'reviewed' : action === 'escalate' ? 'escalated' : action === 'mark_suspicious' ? 'suspicious' : 'resolved';
    await tx.update(priceChangeAlert).set(action === 'review'
      ? { status: nextStatus, reviewNote: reason.trim(), reviewedByUserId: actorUserId, reviewedAt: now, updatedAt: now }
      : { status: nextStatus, reviewNote: reason.trim(), ...(action === 'escalate' ? { escalatedAt: now } : {}), updatedAt: now }).where(eq(priceChangeAlert.id, alertId));
    await tx.insert(auditLog).values({ userId: actorUserId, action: `PRICE_ALERT_${action === 'mark_suspicious' ? 'MARKED_SUSPICIOUS' : action === 'resolve' ? 'RESOLVED' : action === 'review' ? 'REVIEWED' : 'ESCALATED'}`, targetType: 'price_change_alert', targetId: alertId,
      beforeState: { status: locked.status }, afterState: { status: nextStatus, reason: reason.trim() }, metadata: JSON.stringify({ reason: reason.trim() }) });
  });
  return { success: true as const };
}

export async function listMerchantPriceHistory(staff: StaffScope, businessId: string) {
  const [merchant] = await db.select({ tinNumber: user.tinNumber }).from(user).where(eq(user.id, businessId)).limit(1);
  const location = await lookupMerchantLocation(merchant?.tinNumber ?? null);
  if (!(await staffCanAccessLocation(staff, location))) return [];
  const rows = await db.select({ id: merchantPriceHistory.id, productId: merchantPriceHistory.productId, productName: product.name,
    previousPrice: merchantPriceHistory.previousPrice, newPrice: merchantPriceHistory.newPrice, differenceRwf: merchantPriceHistory.differenceRwf,
    percentageChange: merchantPriceHistory.percentageChange, unit: merchantPriceHistory.unit, changeKind: merchantPriceHistory.changeKind,
    reason: merchantPriceHistory.reason, changedAt: merchantPriceHistory.changedAt })
    .from(merchantPriceHistory).innerJoin(product, eq(product.id, merchantPriceHistory.productId))
    .where(eq(merchantPriceHistory.businessId, businessId)).orderBy(desc(merchantPriceHistory.changedAt)).limit(200);
  return rows.map((row) => ({ ...row, changedAt: row.changedAt.toISOString() }));
}

