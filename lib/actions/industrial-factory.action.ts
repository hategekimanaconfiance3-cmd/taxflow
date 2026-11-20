"use server";

import { randomUUID } from "node:crypto";
import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import db from "@/db/drizzle";
import {
  auditLog,
  factory,
  factoryProductionLine,
  industrialAlert,
  industrialBatchEvidence,
  industrialEquipment,
  industrialEvent,
  industrialGateway,
  industrialVerificationResult,
  productionBatch,
  user,
} from "@/db/schema";
import {
  requireRRAPermission,
  requireSession,
  requireTraderSession,
} from "@/lib/auth-guard";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ok<T>(data: T) {
  return { success: true as const, data };
}
function fail(error: string) {
  return { success: false as const, error };
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const RegisterFactorySchema = z.object({
  name: z.string().min(2).max(200),
  address: z.string().min(2).max(500),
  industryType: z.string().max(100).optional(),
  registrationReference: z.string().max(100).optional(),
});

const RegisterProductionLineSchema = z.object({
  factoryId: z.string().min(1),
  name: z.string().min(2).max(200),
  lineCode: z.string().min(1).max(50).regex(/^[A-Z0-9_-]+$/, "Line code must be uppercase letters, digits, hyphens or underscores"),
  productionCategory: z.string().max(100).optional(),
  productionCapacity: z.number().positive().optional(),
  productionCapacityUnit: z.string().max(50).optional(),
});

const RegisterEquipmentSchema = z.object({
  productionLineId: z.string().min(1),
  factoryId: z.string().min(1),
  name: z.string().min(2).max(200),
  equipmentCode: z.string().min(1).max(50),
  equipmentType: z.string().min(1).max(50),
  serialNumber: z.string().max(100).optional(),
  equipmentManufacturer: z.string().max(200).optional(),
  model: z.string().max(200).optional(),
});

const RegisterGatewaySchema = z.object({
  factoryId: z.string().min(1),
  name: z.string().min(2).max(200),
  gatewayCode: z.string().min(1).max(100),
});

const SuspendFactorySchema = z.object({
  factoryId: z.string().min(1),
  reason: z.string().min(5).max(500),
});

const RevokeGatewaySchema = z.object({
  gatewayId: z.string().min(1),
  reason: z.string().min(5).max(500),
});

// ---------------------------------------------------------------------------
// ADMIN — Factories
// ---------------------------------------------------------------------------

export async function listAllFactories() {
  await requireRRAPermission("taxpayer.activity.read");
  const rows = await db
    .select({
      id: factory.id,
      manufacturerId: factory.manufacturerId,
      manufacturerName: user.name,
      name: factory.name,
      address: factory.address,
      registrationReference: factory.registrationReference,
      onboardingStatus: factory.onboardingStatus,
      integrationStatus: factory.integrationStatus,
      connectivityStatus: factory.connectivityStatus,
      approvedAt: factory.approvedAt,
      createdAt: factory.createdAt,
    })
    .from(factory)
    .leftJoin(user, eq(factory.manufacturerId, user.id))
    .orderBy(desc(factory.createdAt));
  return ok(rows);
}

export async function approveFactory(factoryId: string) {
  const { staff } = await requireRRAPermission("taxpayer.account.manage");
  const [updated] = await db
    .update(factory)
    .set({ onboardingStatus: "approved", approvedAt: new Date() })
    .where(and(eq(factory.id, factoryId), eq(factory.onboardingStatus, "submitted")))
    .returning({ id: factory.id, name: factory.name });
  if (!updated) return fail("Factory not found or not in submitted status");
  await db.insert(auditLog).values({
    userId: staff.userId,
    action: "FACTORY_APPROVED",
    targetType: "factory",
    targetId: factoryId,
    afterState: { onboardingStatus: "approved" },
    metadata: JSON.stringify({ factoryId, name: updated.name }),
  });
  revalidatePath("/admin/factory-onboarding");
  return ok(updated);
}

export async function suspendFactory(input: z.infer<typeof SuspendFactorySchema>) {
  const { staff } = await requireRRAPermission("taxpayer.account.manage");
  const parsed = SuspendFactorySchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const [updated] = await db
    .update(factory)
    .set({ onboardingStatus: "suspended" })
    .where(eq(factory.id, parsed.data.factoryId))
    .returning({ id: factory.id });
  if (!updated) return fail("Factory not found");
  await db.insert(auditLog).values({
    userId: staff.userId,
    action: "FACTORY_SUSPENDED",
    targetType: "factory",
    targetId: parsed.data.factoryId,
    afterState: { onboardingStatus: "suspended", reason: parsed.data.reason },
    metadata: JSON.stringify({ reason: parsed.data.reason }),
  });
  revalidatePath("/admin/factory-onboarding");
  return ok({ id: updated.id });
}

// ---------------------------------------------------------------------------
// ADMIN — Gateways
// ---------------------------------------------------------------------------

export async function listAllGateways() {
  await requireRRAPermission("taxpayer.activity.read");
  const rows = await db
    .select({
      id: industrialGateway.id,
      manufacturerId: industrialGateway.manufacturerId,
      manufacturerName: user.name,
      factoryId: industrialGateway.factoryId,
      factoryName: factory.name,
      name: industrialGateway.name,
      gatewayCode: industrialGateway.gatewayCode,
      status: industrialGateway.status,
      lastHeartbeatAt: industrialGateway.lastHeartbeatAt,
      lastSyncAt: industrialGateway.lastSyncAt,
      createdAt: industrialGateway.createdAt,
    })
    .from(industrialGateway)
    .leftJoin(user, eq(industrialGateway.manufacturerId, user.id))
    .leftJoin(factory, eq(industrialGateway.factoryId, factory.id))
    .orderBy(desc(industrialGateway.createdAt));
  return ok(rows);
}

export async function approveGateway(gatewayId: string) {
  const { staff } = await requireRRAPermission("taxpayer.account.manage");
  const [updated] = await db
    .update(industrialGateway)
    .set({ status: "active" })
    .where(and(eq(industrialGateway.id, gatewayId), eq(industrialGateway.status, "pending")))
    .returning({ id: industrialGateway.id, name: industrialGateway.name });
  if (!updated) return fail("Gateway not found or not in pending status");
  await db.insert(auditLog).values({
    userId: staff.userId,
    action: "INDUSTRIAL_GATEWAY_APPROVED",
    targetType: "industrial_gateway",
    targetId: gatewayId,
    afterState: { status: "active" },
    metadata: JSON.stringify({ gatewayId, name: updated.name }),
  });
  revalidatePath("/admin/factory-onboarding");
  return ok(updated);
}

export async function revokeGateway(input: z.infer<typeof RevokeGatewaySchema>) {
  const { staff } = await requireRRAPermission("taxpayer.account.manage");
  const parsed = RevokeGatewaySchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const [updated] = await db
    .update(industrialGateway)
    .set({ status: "revoked", revokedAt: new Date() })
    .where(eq(industrialGateway.id, parsed.data.gatewayId))
    .returning({ id: industrialGateway.id });
  if (!updated) return fail("Gateway not found");
  await db.insert(auditLog).values({
    userId: staff.userId,
    action: "INDUSTRIAL_GATEWAY_REVOKED",
    targetType: "industrial_gateway",
    targetId: parsed.data.gatewayId,
    afterState: { status: "revoked", reason: parsed.data.reason },
    metadata: JSON.stringify({ reason: parsed.data.reason }),
  });
  revalidatePath("/admin/factory-onboarding");
  return ok({ id: updated.id });
}

// ---------------------------------------------------------------------------
// ADMIN — Alerts
// ---------------------------------------------------------------------------

export async function listIndustrialAlerts(opts?: { status?: string }) {
  await requireRRAPermission("taxpayer.activity.read");
  const rows = await db
    .select({
      id: industrialAlert.id,
      manufacturerId: industrialAlert.manufacturerId,
      manufacturerName: user.name,
      factoryId: industrialAlert.factoryId,
      alertType: industrialAlert.alertType,
      severity: industrialAlert.severity,
      summary: industrialAlert.summary,
      status: industrialAlert.status,
      dedupeKey: industrialAlert.dedupeKey,
      resolvedAt: industrialAlert.resolvedAt,
      createdAt: industrialAlert.createdAt,
    })
    .from(industrialAlert)
    .leftJoin(user, eq(industrialAlert.manufacturerId, user.id))
    .orderBy(desc(industrialAlert.createdAt))
    .limit(200);
  return ok(rows);
}

export async function acknowledgeIndustrialAlert(alertId: string) {
  const { staff } = await requireRRAPermission("industrial.integration.monitor");
  const result = await db.transaction(async (tx) => {
    const [current] = await tx.select({ status: industrialAlert.status })
      .from(industrialAlert)
      .where(eq(industrialAlert.id, alertId))
      .for("update");
    if (!current || current.status !== "open") return null;
    const [updated] = await tx
      .update(industrialAlert)
      .set({ status: "acknowledged" })
      .where(and(eq(industrialAlert.id, alertId), eq(industrialAlert.status, "open")))
      .returning({ id: industrialAlert.id, status: industrialAlert.status });
    if (!updated) return null;
    await tx.insert(auditLog).values({
      userId: staff.userId,
      action: "INDUSTRIAL_ALERT_ACKNOWLEDGED",
      targetType: "industrial_alert",
      targetId: updated.id,
      beforeState: { status: current.status },
      afterState: { status: updated.status },
    });
    return updated;
  });
  if (!result) return fail("Alert not found or not open");
  revalidatePath("/admin/industrial-monitoring");
  return ok(result);
}

export async function resolveIndustrialAlert(alertId: string, note: string) {
  const parsedNote = z.string().trim().min(5).max(2000).safeParse(note);
  if (!parsedNote.success) return fail("Resolution note must contain 5 to 2,000 characters");
  const { staff } = await requireRRAPermission("industrial.integration.review");
  const result = await db.transaction(async (tx) => {
    const [current] = await tx.select({ status: industrialAlert.status })
      .from(industrialAlert)
      .where(eq(industrialAlert.id, alertId))
      .for("update");
    if (!current || (current.status !== "open" && current.status !== "acknowledged")) return null;
    const [updated] = await tx
      .update(industrialAlert)
      .set({ status: "resolved", resolvedByUserId: staff.userId, resolvedAt: new Date() })
      .where(and(
        eq(industrialAlert.id, alertId),
        // A resolved alert cannot be resolved again, preserving the first decision.
        sql`${industrialAlert.status} IN ('open', 'acknowledged')`,
      ))
      .returning({ id: industrialAlert.id, status: industrialAlert.status });
    if (!updated) return null;
    await tx.insert(auditLog).values({
      userId: staff.userId,
      action: "INDUSTRIAL_ALERT_RESOLVED",
      targetType: "industrial_alert",
      targetId: updated.id,
      beforeState: { status: current.status },
      afterState: { status: updated.status, resolutionNote: parsedNote.data },
      metadata: JSON.stringify({ resolutionNote: parsedNote.data }),
    });
    return updated;
  });
  if (!result) return fail("Alert not found or already resolved");
  revalidatePath("/admin/industrial-monitoring");
  return ok(result);
}

// ---------------------------------------------------------------------------
// ADMIN — Stats for monitoring dashboard
// ---------------------------------------------------------------------------

export async function getIndustrialMonitoringStats() {
  await requireRRAPermission("taxpayer.activity.read");

  const [factoryStats] = await db
    .select({
      total: sql<number>`count(*)::int`,
      submitted: sql<number>`count(*) filter (where ${factory.onboardingStatus} = 'submitted')::int`,
      approved: sql<number>`count(*) filter (where ${factory.onboardingStatus} = 'approved')::int`,
      suspended: sql<number>`count(*) filter (where ${factory.onboardingStatus} = 'suspended')::int`,
    })
    .from(factory);

  const [gatewayStats] = await db
    .select({
      total: sql<number>`count(*)::int`,
      active: sql<number>`count(*) filter (where ${industrialGateway.status} = 'active')::int`,
      pending: sql<number>`count(*) filter (where ${industrialGateway.status} = 'pending')::int`,
      suspended: sql<number>`count(*) filter (where ${industrialGateway.status} = 'suspended')::int`,
    })
    .from(industrialGateway);

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const [eventStats] = await db
    .select({ today: sql<number>`count(*)::int` })
    .from(industrialEvent)
    .where(gte(industrialEvent.createdAt, todayStart));

  const [alertStats] = await db
    .select({
      open: sql<number>`count(*) filter (where ${industrialAlert.status} = 'open')::int`,
      acknowledged: sql<number>`count(*) filter (where ${industrialAlert.status} = 'acknowledged')::int`,
    })
    .from(industrialAlert);

  return ok({ factories: factoryStats, gateways: gatewayStats, events: eventStats, alerts: alertStats });
}

// ---------------------------------------------------------------------------
// MANUFACTURER — Register factory
// ---------------------------------------------------------------------------

export async function registerFactory(input: z.infer<typeof RegisterFactorySchema>) {
  const session = await requireTraderSession(["manufacturer"]);
  const parsed = RegisterFactorySchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  const factoryCode = `FC-${Date.now().toString(36).toUpperCase()}`;

  const [row] = await db
    .insert(factory)
    .values({
      manufacturerId: session.user.id,
      factoryCode,
      name: parsed.data.name,
      address: parsed.data.address,
      industryType: parsed.data.industryType ?? "general",
      registrationReference: parsed.data.registrationReference ?? null,
      onboardingStatus: "draft",
    })
    .returning({ id: factory.id });

  revalidatePath("/dashboard/factories");
  return ok(row);
}

export async function listMyFactories() {
  const session = await requireTraderSession(["manufacturer"]);
  const rows = await db
    .select()
    .from(factory)
    .where(eq(factory.manufacturerId, session.user.id))
    .orderBy(desc(factory.createdAt));
  return ok(rows);
}

// ---------------------------------------------------------------------------
// MANUFACTURER — Production lines
// ---------------------------------------------------------------------------

export async function registerProductionLine(input: z.infer<typeof RegisterProductionLineSchema>) {
  const session = await requireTraderSession(["manufacturer"]);
  const parsed = RegisterProductionLineSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  // Verify factory ownership
  const [ownedFactory] = await db
    .select({ id: factory.id, onboardingStatus: factory.onboardingStatus })
    .from(factory)
    .where(and(eq(factory.id, parsed.data.factoryId), eq(factory.manufacturerId, session.user.id)))
    .limit(1);
  if (!ownedFactory) return fail("Factory not found or not owned by you");
  if (ownedFactory.onboardingStatus !== "approved") return fail("Factory must be approved before adding production lines");

  const [row] = await db
    .insert(factoryProductionLine)
    .values({
      factoryId: parsed.data.factoryId,
      manufacturerId: session.user.id,
      name: parsed.data.name,
      lineCode: parsed.data.lineCode,
      productionCategory: parsed.data.productionCategory ?? "general",
      productionCapacity: parsed.data.productionCapacity ? String(parsed.data.productionCapacity) : null,
      productionCapacityUnit: parsed.data.productionCapacityUnit ?? null,
      operationalStatus: "active",
    })
    .returning({ id: factoryProductionLine.id });

  revalidatePath("/dashboard/factories");
  return ok(row);
}

export async function listMyProductionLines(factoryId: string) {
  const session = await requireTraderSession(["manufacturer"]);
  const rows = await db
    .select()
    .from(factoryProductionLine)
    .where(and(eq(factoryProductionLine.factoryId, factoryId), eq(factoryProductionLine.manufacturerId, session.user.id)))
    .orderBy(desc(factoryProductionLine.createdAt));
  return ok(rows);
}

// ---------------------------------------------------------------------------
// MANUFACTURER — Equipment
// ---------------------------------------------------------------------------

export async function registerEquipment(input: z.infer<typeof RegisterEquipmentSchema>) {
  const session = await requireTraderSession(["manufacturer"]);
  const parsed = RegisterEquipmentSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  // Verify line ownership
  const [ownedLine] = await db
    .select({ id: factoryProductionLine.id })
    .from(factoryProductionLine)
    .where(and(eq(factoryProductionLine.id, parsed.data.productionLineId), eq(factoryProductionLine.manufacturerId, session.user.id)))
    .limit(1);
  if (!ownedLine) return fail("Production line not found or not owned by you");

  const [row] = await db
    .insert(industrialEquipment)
    .values({
      productionLineId: parsed.data.productionLineId,
      factoryId: parsed.data.factoryId,
      manufacturerId: session.user.id,
      name: parsed.data.name,
      equipmentCode: parsed.data.equipmentCode,
      equipmentType: parsed.data.equipmentType,
      serialNumber: parsed.data.serialNumber ?? null,
      equipmentManufacturer: parsed.data.equipmentManufacturer ?? null,
      model: parsed.data.model ?? null,
      operationalStatus: "active",
    })
    .returning({ id: industrialEquipment.id });

  return ok(row);
}

// ---------------------------------------------------------------------------
// MANUFACTURER — Gateways
// ---------------------------------------------------------------------------

export async function registerGateway(input: z.infer<typeof RegisterGatewaySchema>) {
  const session = await requireTraderSession(["manufacturer"]);
  const parsed = RegisterGatewaySchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  // Verify factory ownership + approval
  const [ownedFactory] = await db
    .select({ id: factory.id, onboardingStatus: factory.onboardingStatus })
    .from(factory)
    .where(and(eq(factory.id, parsed.data.factoryId), eq(factory.manufacturerId, session.user.id)))
    .limit(1);
  if (!ownedFactory) return fail("Factory not found or not owned by you");
  if (ownedFactory.onboardingStatus !== "approved") return fail("Factory must be approved before registering gateways");

  const [row] = await db
    .insert(industrialGateway)
    .values({
      manufacturerId: session.user.id,
      factoryId: parsed.data.factoryId,
      name: parsed.data.name,
      gatewayCode: parsed.data.gatewayCode,
      status: "pending",
    })
    .returning({ id: industrialGateway.id, gatewayCode: industrialGateway.gatewayCode });

  revalidatePath("/dashboard/factories");
  return ok(row);
}

export async function listMyGateways() {
  const session = await requireTraderSession(["manufacturer"]);
  const rows = await db
    .select({
      id: industrialGateway.id,
      factoryId: industrialGateway.factoryId,
      factoryName: factory.name,
      name: industrialGateway.name,
      gatewayCode: industrialGateway.gatewayCode,
      status: industrialGateway.status,
      lastHeartbeatAt: industrialGateway.lastHeartbeatAt,
      lastSyncAt: industrialGateway.lastSyncAt,
      createdAt: industrialGateway.createdAt,
    })
    .from(industrialGateway)
    .leftJoin(factory, eq(industrialGateway.factoryId, factory.id))
    .where(eq(industrialGateway.manufacturerId, session.user.id))
    .orderBy(desc(industrialGateway.createdAt));
  return ok(rows);
}

// ---------------------------------------------------------------------------
// MANUFACTURER — View own industrial events (last 50 per batch)
// ---------------------------------------------------------------------------

export async function getEventsForBatch(batchId: string) {
  const session = await requireTraderSession(["manufacturer"]);
  const rows = await db
    .select()
    .from(industrialEvent)
    .where(
      and(
        eq(industrialEvent.batchId, batchId),
        eq(industrialEvent.manufacturerId, session.user.id),
      ),
    )
    .orderBy(desc(industrialEvent.eventTimestamp))
    .limit(50);
  return ok(rows);
}

// ---------------------------------------------------------------------------
// Phase 4 — Batch reconciliation summary for the monitoring dashboard
// ---------------------------------------------------------------------------

export async function getReconciliationDashboardSummary() {
  await requireRRAPermission('taxpayer.activity.read');

  // Evidence status breakdown
  const [evidenceStats] = await db
    .select({
      pending:              sql<number>`count(*) filter (where ${industrialBatchEvidence.verificationStatus} = 'pending')::int`,
      supported:            sql<number>`count(*) filter (where ${industrialBatchEvidence.verificationStatus} = 'supported')::int`,
      discrepant:           sql<number>`count(*) filter (where ${industrialBatchEvidence.verificationStatus} = 'discrepant')::int`,
      insufficient:         sql<number>`count(*) filter (where ${industrialBatchEvidence.verificationStatus} = 'insufficient_evidence')::int`,
      totalMachineQty:      sql<string>`coalesce(sum(${industrialBatchEvidence.machineReportedQuantity}), 0)::text`,
      totalMachineRejected: sql<string>`coalesce(sum(${industrialBatchEvidence.machineRejectedQuantity}), 0)::text`,
    })
    .from(industrialBatchEvidence);

  // Declared vs reported from batches that have evidence
  const [batchQuantityTotals] = await db
    .select({
      totalDeclared:         sql<string>`coalesce(sum(${productionBatch.declaredQuantity}), 0)::text`,
      totalReportedGood:     sql<string>`coalesce(sum(${productionBatch.reportedGoodOutputQuantity}), 0)::text`,
      totalReportedRejected: sql<string>`coalesce(sum(${productionBatch.reportedRejectedOutputQuantity}), 0)::text`,
    })
    .from(productionBatch)
    .innerJoin(industrialBatchEvidence, eq(industrialBatchEvidence.batchId, productionBatch.id));

  // Recent verification results
  const recentVerifications = await db
    .select({
      id:              industrialVerificationResult.id,
      batchId:         industrialVerificationResult.batchId,
      batchReference:  productionBatch.batchReference,
      machineQuantity: industrialVerificationResult.machineQuantity,
      declaredQty:     industrialVerificationResult.declaredQuantity,
      varianceQty:     industrialVerificationResult.varianceQuantity,
      outcome:         industrialVerificationResult.outcome,
      reasonCodes:     industrialVerificationResult.reasonCodes,
      tolerancePct:    industrialVerificationResult.tolerancePercent,
      checkedAt:       industrialVerificationResult.checkedAt,
    })
    .from(industrialVerificationResult)
    .leftJoin(productionBatch, eq(productionBatch.id, industrialVerificationResult.batchId))
    .orderBy(desc(industrialVerificationResult.checkedAt))
    .limit(50);

  // Factories with connectivity problems
  const offlineFactories = await db
    .select({ id: factory.id, name: factory.name, connectivityStatus: factory.connectivityStatus })
    .from(factory)
    .where(eq(factory.connectivityStatus, 'offline'))
    .limit(20);

  return ok({
    evidenceStats,
    batchQuantityTotals,
    recentVerifications,
    offlineFactories,
  });
}
