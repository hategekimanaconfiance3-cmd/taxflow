"use server";

import { eq } from "drizzle-orm";
import db from "@/db/drizzle";
import { systemConfig, auditLog } from "@/db/schema";
import { requireRRASession } from "@/lib/auth-guard";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Default values — used as fallback when no DB row exists
// ---------------------------------------------------------------------------

const DEFAULTS: Record<string, string> = {
    compliance_threshold: "0.95",
    vat_rate: "0.18",
    dispute_window_hours: "72",
    buyer_confirmation_window_hours: "24",
    // Keep reading the old setting as a notification threshold only. It must
    // never trigger an automatic account restriction.
    auto_suspension_threshold: "0.50",
};

// ---------------------------------------------------------------------------
// Typed config object
// ---------------------------------------------------------------------------

export interface SystemConfigValues {
    complianceThreshold: number;      // e.g. 0.95
    vatRate: number;                  // e.g. 0.18
    disputeWindowHours: number;       // e.g. 72
    buyerConfirmationWindowHours: number; // e.g. 24
    reviewRecommendationThreshold: number; // Legacy threshold, used only to request human review
}

// ---------------------------------------------------------------------------
// Read config (no auth guard — consumed by transaction flows)
// ---------------------------------------------------------------------------

export async function getSystemConfig(): Promise<SystemConfigValues> {
    const rows = await db.select().from(systemConfig);
    const map = new Map(rows.map((r) => [r.key, r.value]));

    return {
        complianceThreshold: parseFloat(map.get("compliance_threshold") ?? DEFAULTS.compliance_threshold),
        vatRate: parseFloat(map.get("vat_rate") ?? DEFAULTS.vat_rate),
        disputeWindowHours: parseInt(map.get("dispute_window_hours") ?? DEFAULTS.dispute_window_hours, 10),
        buyerConfirmationWindowHours: parseInt(map.get("buyer_confirmation_window_hours") ?? DEFAULTS.buyer_confirmation_window_hours, 10),
        reviewRecommendationThreshold: parseFloat(map.get("auto_suspension_threshold") ?? DEFAULTS.auto_suspension_threshold),
    };
}

// ---------------------------------------------------------------------------
// Update config (super_admin only)
// ---------------------------------------------------------------------------

const updateSchema = z.object({
    key: z.enum(["compliance_threshold", "vat_rate", "dispute_window_hours", "buyer_confirmation_window_hours"]),
    value: z.string().min(1, "Value is required"),
});

const VALUE_VALIDATORS: Record<string, (v: string) => string | null> = {
    compliance_threshold: (v) => {
        const n = Number(v);
        if (isNaN(n) || n < 0.01 || n > 1) return "Must be between 0.01 and 1 (e.g. 0.95 for 95%)";
        return null;
    },
    vat_rate: (v) => {
        const n = Number(v);
        if (isNaN(n) || n < 0 || n > 1) return "Must be between 0 and 1 (e.g. 0.18 for 18%)";
        return null;
    },
    dispute_window_hours: (v) => {
        const n = Number(v);
        if (isNaN(n) || n < 1 || n > 720) return "Must be between 1 and 720 hours";
        return null;
    },
    buyer_confirmation_window_hours: (v) => {
        const n = Number(v);
        if (!Number.isInteger(n) || n < 1 || n > 720) return "Must be a whole number between 1 and 720 hours";
        return null;
    },
};

export async function updateSystemConfig(data: { key: string; value: string }): Promise<{ success: true }> {
    const session = await requireRRASession("super_admin");

    const parsed = updateSchema.safeParse(data);
    if (!parsed.success) {
        throw new Error("Invalid config key or value");
    }

    const { key, value } = parsed.data;

    // Validate the value for the specific key
    const validator = VALUE_VALIDATORS[key];
    if (validator) {
        const error = validator(value);
        if (error) {
            throw new Error(error);
        }
    }

    await db.transaction(async (tx) => {
        const [existing] = await tx.select().from(systemConfig)
            .where(eq(systemConfig.key, key)).for("update").limit(1);
        const oldValue = existing?.value ?? DEFAULTS[key] ?? "unknown";
        await tx.insert(systemConfig).values({ key, value, updatedBy: session.user.id })
            .onConflictDoUpdate({ target: systemConfig.key, set: { value, updatedBy: session.user.id, updatedAt: new Date() } });
        await logAudit({
            userId: session.user.id,
            action: "SYSTEM_CONFIG_UPDATED",
            targetType: "system_config",
            targetId: key,
            metadata: { key, oldValue, newValue: value },
        }, async (entry) => { await tx.insert(auditLog).values(entry); });
    });

    return { success: true };
}
