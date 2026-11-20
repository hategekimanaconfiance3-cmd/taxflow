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
  industrialAlert,
  industrialEquipment,
  industrialEvent,
  industrialGateway,
  productionBatch,
  productionLine,
  productionVerification,
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
  location: z.string().min(2).max(500),
  province: z.string().max(100).optional(),
  district: z.string().max(100).optional(),
  registrationNumber: z.string().max(100).optional(),
  notes: z.string().max(1000).optional(),
});

const RegisterProductionLineSchema = z.object({
  factoryId: z.string().min(1),
  name: z.string().min(2).max(200),
  lineCode: z.string().min(1).max(50).regex(/^[A-Z0-9_-]+$/, "Line code must be uppercase letters, digits, hyphens or underscores"),
  description: z.string().max(500).optional(),
  capacity: z.number().positive().optional(),
  capacityUnit: z.string().max(50).optional(),
});

const RegisterEquipmentSchema = z.object({
  productionLineId: z.string().min(1),
  name: z.string().min(2).max(200),
  equipmentCode: z.string().min(1).max(50),
  equipmentType: z.enum(["mixer", "filler", "labeler", "conveyor", "sensor", "scale", "other"]),
  serialNumber: z.string().max(100).optional(),
  manufacturer: z.string().max(200).optional(),
  model: z.string().max(200).optional(),
});

const RegisterGatewaySchema = z.object({
  factoryId: z.string().min(1),
  name: z.string().min(2).max(200),
  protocol: z.enum(["https", "mqtt", "opc_ua"]).default("https"),
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
      location: factory.location,
      province: factory.province,
      district: factory.district,
      registrationNumber: factory.registrationNumber,
      status: factory.status,
      approvedAt: factory.approvedAt,
      suspendedAt: factory.suspendedAt,
      suspensionReason: factory.suspensionReason,
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
    .set({ status: "approved", approvedByUserId: staff.userId, approvedAt: new Date() })
    .where(and(eq(factory.id, factoryId), eq(factory.status, "pending")))
    .returning({ id: factory.id, name: factory.name });
  if (!updated) return fail("Factory not found or not in pending status");
  await db.insert(auditLog).values({
    userId: staff.userId,
    action: "FACTORY_APPROVED",
    targetType: "factory",
    targetId: factoryId,
    afterState: { status: "approved" },
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
    .set({ status: "suspended", suspendedAt: new Date(), suspensionReason: parsed.data.reason })
    .where(eq(factory.id, parsed.data.factoryId))
    .returning({ id: factory.id });
  if (!updated) return fail("Factory not found");
  await db.insert(auditLog).values({
    userId: staff.userId,
    action: "FACTORY_SUSPENDED",
    targetType: "factory",
    targetId: parsed.data.factoryId,
    afterState: { status: "suspended", reason: parsed.data.reason },
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
      gatewayId: industrialGateway.gatewayId,
      protocol: industrialGateway.protocol,
      status: industrialGateway.status,
      lastSeenAt: industrialGateway.lastSeenAt,
      approvedAt: industrialGateway.approvedAt,
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
    .set({ status: "active", approvedByUserId: staff.userId, approvedAt: new Date() })
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
    .set({ status: "revoked", revokedAt: new Date(), revocationReason: parsed.data.reason })
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
      alertType: industrialAlert.alertType,
      severity: industrialAlert.severity,
      title: industrialAlert.title,
      description: industrialAlert.description,
      status: industrialAlert.status,
      relatedEntityType: industrialAlert.relatedEntityType,
      relatedEntityId: industrialAlert.relatedEntityId,
      acknowledgedAt: industrialAlert.acknowledgedAt,
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
  const { staff } = await requireRRAPermission("taxpayer.activity.read");
  const [updated] = await db
    .update(industrialAlert)
    .set({ status: "acknowledged", acknowledgedByUserId: staff.userId, acknowledgedAt: new Date() })
    .where(and(eq(industrialAlert.id, alertId), eq(industrialAlert.status, "open")))
    .returning({ id: industrialAlert.id });
  if (!updated) return fail("Alert not found or not open");
  revalidatePath("/admin/industrial-monitoring");
  return ok(updated);
}

export async function resolveIndustrialAlert(alertId: string, note: string) {
  const { staff } = await requireRRAPermission("taxpayer.account.manage");
  const [updated] = await db
    .update(industrialAlert)
    .set({ status: "resolved", resolvedByUserId: staff.userId, resolvedAt: new Date(), resolutionNote: note })
    .where(eq(industrialAlert.id, alertId))
    .returning({ id: industrialAlert.id });
  if (!updated) return fail("Alert not found");
  revalidatePath("/admin/industrial-monitoring");
  return ok(updated);
}

// ---------------------------------------------------------------------------
// ADMIN — Stats for monitoring dashboard
// ---------------------------------------------------------------------------

export async function getIndustrialMonitoringStats() {
  await requireRRAPermission("taxpayer.activity.read");

  const [factoryStats] = await db
    .select({
      total: sql<number>`count(*)::int`,
      pending: sql<number>`count(*) filter (where ${factory.status} = 'pending')::int`,
      approved: sql<number>`count(*) filter (where ${factory.status} = 'approved')::int`,
      suspended: sql<number>`count(*) filter (where ${factory.status} = 'suspended')::int`,
    })
    .from(factory);

  const [gatewayStats] = await db
    .select({
      total: sql<number>`count(*)::int`,
      active: sql<number>`count(*) filter (where ${industrialGateway.status} = 'active')::int`,
      pending: sql<number>`count(*) filter (where ${industrialGateway.status} = 'pending')::int`,
      offline: sql<number>`count(*) filter (where ${industrialGateway.status} = 'offline')::int`,
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

  const [row] = await db
    .insert(factory)
    .values({
      id: randomUUID(),
      manufacturerId: session.user.id,
      name: parsed.data.name,
      location: parsed.data.location,
      province: parsed.data.province ?? null,
      district: parsed.data.district ?? null,
      registrationNumber: parsed.data.registrationNumber ?? null,
      notes: parsed.data.notes ?? null,
      status: "pending",
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
    .select({ id: factory.id, status: factory.status })
    .from(factory)
    .where(and(eq(factory.id, parsed.data.factoryId), eq(factory.manufacturerId, session.user.id)))
    .limit(1);
  if (!ownedFactory) return fail("Factory not found or not owned by you");
  if (ownedFactory.status !== "approved") return fail("Factory must be approved before adding production lines");

  const [row] = await db
    .insert(productionLine)
    .values({
      id: randomUUID(),
      factoryId: parsed.data.factoryId,
      manufacturerId: session.user.id,
      name: parsed.data.name,
      lineCode: parsed.data.lineCode,
      description: parsed.data.description ?? null,
      capacity: parsed.data.capacity ?? null,
      capacityUnit: parsed.data.capacityUnit ?? null,
      status: "active",
    })
    .returning({ id: productionLine.id });

  revalidatePath("/dashboard/factories");
  return ok(row);
}

export async function listMyProductionLines(factoryId: string) {
  const session = await requireTraderSession(["manufacturer"]);
  const rows = await db
    .select()
    .from(productionLine)
    .where(and(eq(productionLine.factoryId, factoryId), eq(productionLine.manufacturerId, session.user.id)))
    .orderBy(desc(productionLine.createdAt));
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
    .select({ id: productionLine.id })
    .from(productionLine)
    .where(and(eq(productionLine.id, parsed.data.productionLineId), eq(productionLine.manufacturerId, session.user.id)))
    .limit(1);
  if (!ownedLine) return fail("Production line not found or not owned by you");

  const [row] = await db
    .insert(industrialEquipment)
    .values({
      id: randomUUID(),
      productionLineId: parsed.data.productionLineId,
      manufacturerId: session.user.id,
      name: parsed.data.name,
      equipmentCode: parsed.data.equipmentCode,
      equipmentType: parsed.data.equipmentType,
      serialNumber: parsed.data.serialNumber ?? null,
      manufacturer: parsed.data.manufacturer ?? null,
      model: parsed.data.model ?? null,
      status: "active",
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
    .select({ id: factory.id, status: factory.status })
    .from(factory)
    .where(and(eq(factory.id, parsed.data.factoryId), eq(factory.manufacturerId, session.user.id)))
    .limit(1);
  if (!ownedFactory) return fail("Factory not found or not owned by you");
  if (ownedFactory.status !== "approved") return fail("Factory must be approved before registering gateways");

  // Generate a one-time API key — only shown once, stored hashed
  const rawApiKey = `tfi_${randomBytes(32).toString("hex")}`;
  const apiKeyHash = createHash("sha256").update(rawApiKey).digest("hex");
  const gatewayHwId = `gw_${randomBytes(16).toString("hex")}`;

  const [row] = await db
    .insert(industrialGateway)
    .values({
      id: randomUUID(),
      manufacturerId: session.user.id,
      factoryId: parsed.data.factoryId,
      name: parsed.data.name,
      gatewayId: gatewayHwId,
      protocol: parsed.data.protocol,
      apiKeyHash,
      status: "pending",
    })
    .returning({ id: industrialGateway.id, gatewayId: industrialGateway.gatewayId });

  revalidatePath("/dashboard/factories");
  // rawApiKey is returned ONCE and never stored — user must save it
  return ok({ ...row, apiKey: rawApiKey });
}

export async function listMyGateways() {
  const session = await requireTraderSession(["manufacturer"]);
  const rows = await db
    .select({
      id: industrialGateway.id,
      factoryId: industrialGateway.factoryId,
      factoryName: factory.name,
      name: industrialGateway.name,
      gatewayId: industrialGateway.gatewayId,
      protocol: industrialGateway.protocol,
      status: industrialGateway.status,
      lastSeenAt: industrialGateway.lastSeenAt,
      approvedAt: industrialGateway.approvedAt,
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

export async function getEventsForBatch(productionBatchId: string) {
  const session = await requireTraderSession(["manufacturer"]);
  const rows = await db
    .select()
    .from(industrialEvent)
    .where(
      and(
        eq(industrialEvent.productionBatchId, productionBatchId),
        eq(industrialEvent.manufacturerId, session.user.id),
      ),
    )
    .orderBy(desc(industrialEvent.eventTimestamp))
    .limit(50);
  return ok(rows);
}
