"use server";

import { sql, eq } from "drizzle-orm";
import db from "@/db/drizzle";
import {
    user,
    vatRecord,
    taxPayment,
    transaction,
} from "@/db/schema";
import { requireRRAPermission } from "@/lib/auth-guard";
import { logAudit } from "@/lib/audit";

// ---------------------------------------------------------------------------
// National Tax Data — national aggregates only, with no taxpayer-level details
// ---------------------------------------------------------------------------

export async function getNationalTaxData() {
    const session = await requireRRAPermission("reports.aggregate.read");

    const [traders, vatData, payments, txns] = await Promise.all([
        db
            .select({
                count: sql<number>`COUNT(*)::int`.as("count"),
            })
            .from(user)
            .where(sql`${user.role} IN ('manufacturer', 'wholesaler', 'retailer')`),

        db
            .select({
                vatType: vatRecord.vatType,
                total: sql<number>`COALESCE(SUM(${vatRecord.amount}), 0)::float8`.as(
                    "total",
                ),
            })
            .from(vatRecord)
            .groupBy(vatRecord.vatType),

        db
            .select({
                totalPaid: sql<number>`COALESCE(SUM(${taxPayment.amount}), 0)::float8`.as(
                    "total_paid",
                ),
                count: sql<number>`COUNT(*)`.as("count"),
            })
            .from(taxPayment)
            .where(eq(taxPayment.status, "confirmed"))
            ,

        db
            .select({
                count: sql<number>`COUNT(*)`.as("count"),
                totalValue: sql<number>`COALESCE(SUM(${transaction.totalAmount}), 0)::float8`.as(
                    "total_value",
                ),
            })
            .from(transaction)
            ,
    ]);

    const output = Number(vatData.find((row) => row.vatType === "output")?.total ?? 0);
    const input = Number(vatData.find((row) => row.vatType === "input")?.total ?? 0);
    const netDue = Math.max(0, output - input);
    const totalPaid = Number(payments[0]?.totalPaid ?? 0);
    const compliancePct = netDue === 0 ? 100 : Math.round((totalPaid / netDue) * 1000) / 10;
    const nationalCount = Number(traders[0]?.count ?? 0);
    const transactionCount = Number(txns[0]?.count ?? 0);

    const aggregate = [{
        tin: "",
        businessName: "National aggregate",
        ownerName: "",
        role: "all_traders",
        phone: "",
        status: `${nationalCount} registered taxpayers`,
        registeredAt: "",
        vatOutput: Number(vatData.find((row) => row.vatType === "output")?.total ?? 0),
        vatInput: Number(vatData.find((row) => row.vatType === "input")?.total ?? 0),
        netVatDue: netDue,
        totalPaid,
        outstanding: Math.max(0, netDue - totalPaid),
        compliancePct,
        totalTransactions: transactionCount,
        transactionValue: Number(txns[0]?.totalValue ?? 0),
        paymentCount: Number(payments[0]?.count ?? 0),
    }];
    await logAudit({
        userId: session.user.id,
        action: "NATIONAL_AGGREGATE_EXPORTED",
        targetType: "report",
        targetId: "national_tax_data",
    });
    return aggregate;
}

// ---------------------------------------------------------------------------
// Compliance Dataset — for analysis
// ---------------------------------------------------------------------------

export async function getComplianceDataset() {
    await requireRRAPermission("reports.aggregate.read");

    const data = await getNationalTaxData();

    return data.map((t) => ({
        tin: t.tin,
        businessName: t.businessName,
        role: t.role,
        status: t.status,
        netVatDue: t.netVatDue,
        totalPaid: t.totalPaid,
        outstanding: t.outstanding,
        compliancePct: t.compliancePct,
        isCompliant: t.compliancePct >= 95,
        transactionCount: t.totalTransactions,
        transactionVolume: t.transactionValue,
        riskLevel:
            t.compliancePct >= 95
                ? "low"
                : t.compliancePct >= 70
                    ? "medium"
                    : t.compliancePct >= 40
                        ? "high"
                        : "critical",
    }));
}
