"use server";

import { sql, eq, desc } from "drizzle-orm";
import db from "@/db/drizzle";
import {
    user,
    vatRecord,
    taxPayment,
    transaction,
    product,
    auditLog,
} from "@/db/schema";
import { requireRRASession } from "@/lib/auth-guard";

// ---------------------------------------------------------------------------
// National Tax Data — complete system overview
// ---------------------------------------------------------------------------

export async function getNationalTaxData() {
    await requireRRASession("super_admin");

    const [traders, vatData, payments, txns] = await Promise.all([
        db
            .select({
                id: user.id,
                name: user.name,
                businessName: user.businessName,
                tinNumber: user.tinNumber,
                role: user.role,
                clearanceStatus: user.clearanceStatus,
                phoneNumber: user.phoneNumber,
                createdAt: user.createdAt,
            })
            .from(user)
            .where(
                sql`${user.role} IN ('manufacturer', 'wholesaler', 'retailer')`,
            )
            .orderBy(user.businessName),

        db
            .select({
                businessId: vatRecord.businessId,
                vatType: vatRecord.vatType,
                total: sql<number>`COALESCE(SUM(${vatRecord.amount}), 0)`.as(
                    "total",
                ),
            })
            .from(vatRecord)
            .groupBy(vatRecord.businessId, vatRecord.vatType),

        db
            .select({
                businessId: taxPayment.businessId,
                totalPaid: sql<number>`COALESCE(SUM(${taxPayment.amount}), 0)`.as(
                    "total_paid",
                ),
                count: sql<number>`COUNT(*)`.as("count"),
            })
            .from(taxPayment)
            .where(eq(taxPayment.status, "confirmed"))
            .groupBy(taxPayment.businessId),

        db
            .select({
                sellerId: transaction.sellerId,
                count: sql<number>`COUNT(*)`.as("count"),
                totalValue: sql<number>`COALESCE(SUM(${transaction.totalAmount}), 0)`.as(
                    "total_value",
                ),
            })
            .from(transaction)
            .groupBy(transaction.sellerId),
    ]);

    // Build maps
    const vatMap = new Map<string, { output: number; input: number }>();
    for (const r of vatData) {
        const e = vatMap.get(r.businessId) || { output: 0, input: 0 };
        if (r.vatType === "output") e.output = r.total;
        if (r.vatType === "input") e.input = r.total;
        vatMap.set(r.businessId, e);
    }

    const payMap = new Map(payments.map((p) => [p.businessId, p]));
    const txnMap = new Map(txns.map((t) => [t.sellerId, t]));

    return traders.map((t) => {
        const vat = vatMap.get(t.id) || { output: 0, input: 0 };
        const pay = payMap.get(t.id);
        const txn = txnMap.get(t.id);
        const netDue = Math.max(0, vat.output - vat.input);
        const totalPaid = pay?.totalPaid ?? 0;

        return {
            tin: t.tinNumber ?? "",
            businessName: t.businessName ?? "",
            ownerName: t.name,
            role: t.role ?? "",
            phone: t.phoneNumber ?? "",
            status: t.clearanceStatus ?? "",
            registeredAt: t.createdAt
                ? new Date(t.createdAt).toISOString().split("T")[0]
                : "",
            vatOutput: vat.output,
            vatInput: vat.input,
            netVatDue: netDue,
            totalPaid,
            outstanding: Math.max(0, netDue - totalPaid),
            compliancePct:
                netDue === 0
                    ? 100
                    : Math.round((totalPaid / netDue) * 1000) / 10,
            totalTransactions: txn?.count ?? 0,
            transactionValue: txn?.totalValue ?? 0,
            paymentCount: pay?.count ?? 0,
        };
    });
}

// ---------------------------------------------------------------------------
// Compliance Dataset — for analysis
// ---------------------------------------------------------------------------

export async function getComplianceDataset() {
    await requireRRASession("super_admin");

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
