"use server";

import { eq, sql, desc, asc } from "drizzle-orm";
import db from "@/db/drizzle";
import { user, vatRecord, taxPayment } from "@/db/schema";
import { requireRRASession } from "@/lib/auth-guard";
import { getSystemConfig } from "@/lib/actions/system-config.action";

// ---------------------------------------------------------------------------
// Taxpayer overview — per-trader compliance table (paginated)
// ---------------------------------------------------------------------------


const PAGE_SIZE = 10;

export type TaxpayerRow = {
    id: string;
    tinNumber: string | null;
    businessName: string | null;
    role: string | null;
    vatGenerated: number;
    vatPaid: number;
    netVatDue: number;
    totalPayments: number;
    outstanding: number;
    compliancePct: number;
    isCompliant: boolean;
};

export type TaxpayerSort = "name" | "vat_generated" | "compliance" | "outstanding";

export async function getTaxpayerOverview(
    page = 1,
    sortBy: TaxpayerSort = "name",
    sortDir: "asc" | "desc" = "asc",
) {
    await requireRRASession("super_admin", "compliance_officer", "reporting_officer", "tax_compliance_officer", "data_ai_analyst");

    // Get all traders with their VAT and payment aggregates in a single query
    const traders = await db
        .select({
            id: user.id,
            tinNumber: user.tinNumber,
            businessName: user.businessName,
            role: user.role,
            createdAt: user.createdAt,
        })
        .from(user)
        .where(
            sql`${user.role} IN ('manufacturer', 'wholesaler', 'retailer')`,
        )
        .orderBy(asc(user.businessName));

    // For each trader, compute VAT and payments in parallel batches
    // We do a single aggregated query for all traders' VAT
    const [vatAggregates, paymentAggregates] = await Promise.all([
        // VAT by trader and type
        db
            .select({
                businessId: vatRecord.businessId,
                vatType: vatRecord.vatType,
                total: sql<number>`COALESCE(SUM(${vatRecord.amount}), 0)::float8`.as("total"),
            })
            .from(vatRecord)
        .where(eq(vatRecord.isFrozen, false))
            .groupBy(vatRecord.businessId, vatRecord.vatType),

        // Confirmed payments by trader
        db
            .select({
                businessId: taxPayment.businessId,
                total: sql<number>`COALESCE(SUM(${taxPayment.amount}), 0)::float8`.as("total"),
            })
            .from(taxPayment)
            .where(eq(taxPayment.status, "confirmed"))
            .groupBy(taxPayment.businessId),
    ]);

    // Build lookup maps
    const vatMap = new Map<string, { output: number; input: number }>();
    for (const row of vatAggregates) {
        const existing = vatMap.get(row.businessId) || { output: 0, input: 0 };
        if (row.vatType === "output") existing.output = row.total;
        if (row.vatType === "input") existing.input = row.total;
        vatMap.set(row.businessId, existing);
    }

    const paymentMap = new Map<string, number>();
    for (const row of paymentAggregates) {
        paymentMap.set(row.businessId, row.total);
    }

    // Read dynamic threshold
    const config = await getSystemConfig();

    // Build rows with compliance calculations
    const rows: TaxpayerRow[] = traders.map((t) => {
        const vat = vatMap.get(t.id) || { output: 0, input: 0 };
        const netVatDue = Math.max(0, vat.output - vat.input);
        const totalPayments = paymentMap.get(t.id) || 0;
        const outstanding = Math.max(0, netVatDue - totalPayments);
        const compliancePct =
            netVatDue === 0
                ? 100
                : Math.min(100, Math.round((totalPayments / netVatDue) * 1000) / 10);

        return {
            id: t.id,
            tinNumber: t.tinNumber,
            businessName: t.businessName,
            role: t.role,
            vatGenerated: vat.output,
            vatPaid: vat.input,
            netVatDue,
            totalPayments,
            outstanding,
            compliancePct,
            isCompliant: compliancePct >= config.complianceThreshold * 100,
        };
    });

    // Sort
    rows.sort((a, b) => {
        let cmp = 0;
        switch (sortBy) {
            case "name":
                cmp = (a.businessName ?? "").localeCompare(b.businessName ?? "");
                break;
            case "vat_generated":
                cmp = a.vatGenerated - b.vatGenerated;
                break;
            case "compliance":
                cmp = a.compliancePct - b.compliancePct;
                break;
            case "outstanding":
                cmp = a.outstanding - b.outstanding;
                break;
        }
        return sortDir === "desc" ? -cmp : cmp;
    });

    // Paginate
    const totalRows = rows.length;
    const totalPages = Math.ceil(totalRows / PAGE_SIZE);
    const safeP = Math.max(1, Math.min(page, totalPages || 1));
    const paginated = rows.slice((safeP - 1) * PAGE_SIZE, safeP * PAGE_SIZE);

    // Summary stats
    const compliantCount = rows.filter((r) => r.isCompliant).length;
    const nonCompliantCount = rows.filter((r) => !r.isCompliant).length;
    const totalOutstanding = rows.reduce((sum, r) => sum + r.outstanding, 0);

    return {
        rows: paginated,
        pagination: {
            page: safeP,
            totalPages,
            totalRows,
            pageSize: PAGE_SIZE,
        },
        summary: {
            compliant: compliantCount,
            nonCompliant: nonCompliantCount,
            totalOutstanding,
        },
    };
}

// ---------------------------------------------------------------------------
// Compliance alerts for the dashboard
// ---------------------------------------------------------------------------

export async function getComplianceAlerts() {
    await requireRRASession("super_admin", "compliance_officer", "reporting_officer", "tax_compliance_officer", "data_ai_analyst");

    // Traders below compliance threshold
    // We'll re-use the taxpayer overview logic but just get non-compliant
    const fullData = await getTaxpayerOverview(1, "compliance", "asc");

    const nonCompliantTraders = fullData.rows
        .filter((r) => !r.isCompliant && r.netVatDue > 0)
        .slice(0, 5);

    // Recent tax payments (last 5)
    const recentPayments = await db
        .select({
            id: taxPayment.id,
            amount: taxPayment.amount,
            method: taxPayment.method,
            reference: taxPayment.reference,
            status: taxPayment.status,
            createdAt: taxPayment.createdAt,
            businessName: user.businessName,
        })
        .from(taxPayment)
        .innerJoin(user, eq(taxPayment.businessId, user.id))
        .orderBy(desc(taxPayment.createdAt))
        .limit(5);

    // Pending payments count + total
    const [pendingPayments] = await db
        .select({
            count: sql<number>`COUNT(*)`.as("count"),
            total: sql<number>`COALESCE(SUM(${taxPayment.amount}), 0)::float8`.as("total"),
        })
        .from(taxPayment)
        .where(eq(taxPayment.status, "pending"));

    return {
        nonCompliantTraders,
        recentPayments,
        pendingPayments: {
            count: pendingPayments?.count ?? 0,
            total: pendingPayments?.total ?? 0,
        },
    };
}
