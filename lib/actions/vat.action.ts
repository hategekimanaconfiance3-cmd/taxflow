"use server";

import { eq, sql } from "drizzle-orm";
import db from "@/db/drizzle";
import { vatRecord, user } from "@/db/schema";
import { requireTraderSession } from "@/lib/auth-guard";
import { requireRRASession, type RRARole } from "@/lib/auth-guard";

// ---------------------------------------------------------------------------
// Per-business VAT summary
// ---------------------------------------------------------------------------

export async function getBusinessVAT(businessId?: string) {
    const session = await requireTraderSession();
    const targetId = businessId ?? session.user.id;

    const result = await db
        .select({
            vatType: vatRecord.vatType,
            total: sql<number>`SUM(${vatRecord.amount})`.as("total"),
        })
        .from(vatRecord)
        .where(eq(vatRecord.businessId, targetId))
        .groupBy(vatRecord.vatType);

    const vatOutput = result.find((r) => r.vatType === "output")?.total ?? 0;
    const vatInput = result.find((r) => r.vatType === "input")?.total ?? 0;
    const netVatDue = vatOutput - vatInput;

    return {
        vatOutput,
        vatInput,
        netVatDue,
    };
}

// ---------------------------------------------------------------------------
// System-wide VAT (RRA only)
// ---------------------------------------------------------------------------

export async function getSystemVAT() {
    await requireRRASession("compliance_officer", "reporting_officer");

    const result = await db
        .select({
            vatType: vatRecord.vatType,
            total: sql<number>`SUM(${vatRecord.amount})`.as("total"),
        })
        .from(vatRecord)
        .groupBy(vatRecord.vatType);

    const totalOutput = result.find((r) => r.vatType === "output")?.total ?? 0;
    const totalInput = result.find((r) => r.vatType === "input")?.total ?? 0;

    // Count total businesses
    const [businessCount] = await db
        .select({ count: sql<number>`COUNT(*)`.as("count") })
        .from(user)
        .where(
            sql`${user.role} IN ('manufacturer', 'wholesaler', 'retailer')`,
        );

    return {
        totalVatGenerated: totalOutput,
        totalVatPaid: totalInput,
        netVatDue: totalOutput - totalInput,
        totalBusinesses: businessCount?.count ?? 0,
    };
}
