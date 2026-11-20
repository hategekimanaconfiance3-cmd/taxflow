"use server";

import { requireRRAPermission, requireRRASession } from "@/lib/auth-guard";
import db from "@/db/drizzle";
import { anomalyInvestigation, anomalyAuditLog } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { Anomaly } from "./admin-anomaly.action";

type InvestigationStatus =
  | "open"
  | "under_investigation"
  | "resolved"
  | "false_positive"
  | "escalated";

type InvestigationUpdates = Partial<{
  status: InvestigationStatus;
  assignedToUserId: string | null;
  assignedAt: Date | null;
  investigatedByUserId: string;
  investigationStartedAt: Date;
  resolvedByUserId: string;
  resolvedAt: Date;
  resolutionReason: string;
  isFalsePositive: boolean;
  notes: string;
  escalatedToUserId: string;
  escalatedAt: Date;
  reopenedAt: Date;
}>;

// ---------------------------------------------------------------------------
// Internal helper: upsert the investigation record and append an audit entry
// ---------------------------------------------------------------------------

async function upsertAndLog(
  anomalyKey: string,
  actorUserId: string,
  action: string,
  updates: InvestigationUpdates,
  anomalyData?: Partial<Anomaly>,
): Promise<void> {
  const existing = await db
    .select()
    .from(anomalyInvestigation)
    .where(eq(anomalyInvestigation.anomalyKey, anomalyKey))
    .limit(1);

  const previousStatus = existing[0]?.status ?? "open";

  if (existing.length === 0 && anomalyData) {
    await db.insert(anomalyInvestigation).values({
      id: crypto.randomUUID(),
      anomalyKey,
      anomalyType: anomalyData.type ?? "",
      severity: anomalyData.severity ?? "warning",
      sellerName: anomalyData.sellerName,
      productName: anomalyData.productName,
      description: anomalyData.description,
      ...updates,
      updatedAt: new Date(),
    });
  } else if (existing.length > 0) {
    await db
      .update(anomalyInvestigation)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(anomalyInvestigation.anomalyKey, anomalyKey));
  }

  const inv = await db
    .select({ id: anomalyInvestigation.id })
    .from(anomalyInvestigation)
    .where(eq(anomalyInvestigation.anomalyKey, anomalyKey))
    .limit(1);

  if (inv[0]) {
    await db.insert(anomalyAuditLog).values({
      id: crypto.randomUUID(),
      anomalyId: inv[0].id,
      actorUserId,
      action,
      previousStatus,
      newStatus: updates.status ?? previousStatus,
      createdAt: new Date(),
    });
  }
}

// ---------------------------------------------------------------------------
// Exported server actions
// ---------------------------------------------------------------------------

export async function claimAnomaly(
  anomalyKey: string,
  anomalyData: Partial<Anomaly>,
) {
  try {
    const session = await requireRRAPermission("anomaly.investigate");
    await upsertAndLog(
      anomalyKey,
      session.user.id,
      "claimed",
      {
        status: "under_investigation",
        investigatedByUserId: session.user.id,
        investigationStartedAt: new Date(),
      },
      anomalyData,
    );
    return { success: true };
  } catch {
    return { error: "Failed to claim anomaly" };
  }
}

export async function assignAnomaly(
  anomalyKey: string,
  targetUserId: string,
  anomalyData: Partial<Anomaly>,
) {
  try {
    const session = await requireRRAPermission("anomaly.assign");
    await upsertAndLog(
      anomalyKey,
      session.user.id,
      "assigned",
      { assignedToUserId: targetUserId, assignedAt: new Date() },
      anomalyData,
    );
    return { success: true };
  } catch {
    return { error: "Failed to assign anomaly" };
  }
}

export async function resolveAnomaly(
  anomalyKey: string,
  reason: string,
  isFalsePositive = false,
) {
  try {
    const session = await requireRRAPermission("anomaly.resolve");
    const status: InvestigationStatus = isFalsePositive
      ? "false_positive"
      : "resolved";
    await upsertAndLog(anomalyKey, session.user.id, isFalsePositive ? "marked_false_positive" : "resolved", {
      status,
      resolvedByUserId: session.user.id,
      resolvedAt: new Date(),
      resolutionReason: reason,
      isFalsePositive,
    });
    return { success: true };
  } catch {
    return { error: "Failed to resolve anomaly" };
  }
}

export async function escalateAnomaly(anomalyKey: string, note: string) {
  try {
    const session = await requireRRAPermission("anomaly.escalate");
    await upsertAndLog(anomalyKey, session.user.id, "escalated", {
      status: "escalated",
      escalatedAt: new Date(),
      notes: note,
    });
    return { success: true };
  } catch {
    return { error: "Failed to escalate anomaly" };
  }
}

export async function reopenAnomaly(anomalyKey: string, reason: string) {
  try {
    const session = await requireRRAPermission("anomaly.reopen");
    await upsertAndLog(anomalyKey, session.user.id, "reopened", {
      status: "open",
      reopenedAt: new Date(),
      notes: reason,
    });
    return { success: true };
  } catch {
    return { error: "Failed to reopen anomaly" };
  }
}

export async function addInvestigationNote(anomalyKey: string, note: string) {
  try {
    const session = await requireRRAPermission("anomaly.investigate");
    await upsertAndLog(anomalyKey, session.user.id, "note_added", {
      notes: note,
    });
    return { success: true };
  } catch {
    return { error: "Failed to add note" };
  }
}

export async function getAnomalyInvestigation(anomalyKey: string) {
  await requireRRASession();
  const result = await db
    .select()
    .from(anomalyInvestigation)
    .where(eq(anomalyInvestigation.anomalyKey, anomalyKey))
    .limit(1);
  return result[0] ?? null;
}
