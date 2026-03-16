"use server";

import { eq, desc, sql } from "drizzle-orm";
import db from "@/db/drizzle";
import { vatRecord, taxPayment, transaction, product, user } from "@/db/schema";
import { requireTraderSession } from "@/lib/auth-guard";

// ---------------------------------------------------------------------------
// Generate Tax Report PDF
// ---------------------------------------------------------------------------

/**
 * Generates a branded PDF tax report for the current trader.
 * Includes: VAT summary, compliance status, recent transactions, payment history.
 * Returns base64-encoded PDF content for client-side download.
 */
export async function generateTaxReportPDF(): Promise<{
    base64: string;
    filename: string;
}> {
    const session = await requireTraderSession();
    const userId = session.user.id;

    // Dynamically import jspdf (avoids server-side issues)
    const { jsPDF } = await import("jspdf");
    const autoTableModule = await import("jspdf-autotable");
    const autoTable = autoTableModule.default;

    // ── Gather Data ──────────────────────────────────────────

    // 1. User profile
    const [profile] = await db
        .select({
            name: user.name,
            businessName: user.businessName,
            tinNumber: user.tinNumber,
            role: user.role,
        })
        .from(user)
        .where(eq(user.id, userId))
        .limit(1);

    // 2. VAT summary
    const vatResult = await db
        .select({
            vatType: vatRecord.vatType,
            total: sql<number>`COALESCE(SUM(${vatRecord.amount}), 0)`.as("total"),
        })
        .from(vatRecord)
        .where(eq(vatRecord.businessId, userId))
        .groupBy(vatRecord.vatType);

    const vatOutput = Number(vatResult.find((r) => r.vatType === "output")?.total) || 0;
    const vatInput = Number(vatResult.find((r) => r.vatType === "input")?.total) || 0;
    const netVatDue = vatOutput - vatInput;

    // 3. Payment history
    const [paymentSummary] = await db
        .select({
            totalPaid: sql<number>`COALESCE(SUM(${taxPayment.amount}), 0)`.as("total_paid"),
            paymentCount: sql<number>`COUNT(*)`.as("count"),
        })
        .from(taxPayment)
        .where(
            sql`${taxPayment.businessId} = ${userId} AND ${taxPayment.status} = 'confirmed'`,
        );

    const totalPaid = Number(paymentSummary?.totalPaid) || 0;
    const outstanding = Math.max(0, netVatDue - totalPaid);
    const compliancePct = netVatDue === 0 ? 100 : Math.min(100, (totalPaid / netVatDue) * 100);

    // 4. Recent transactions (last 20)
    const recentTxns = await db
        .select({
            productName: product.name,
            quantity: transaction.quantity,
            totalAmount: transaction.totalAmount,
            vatAmount: transaction.vatAmount,
            status: transaction.status,
            createdAt: transaction.createdAt,
        })
        .from(transaction)
        .innerJoin(product, eq(transaction.productId, product.id))
        .where(eq(transaction.sellerId, userId))
        .orderBy(desc(transaction.createdAt))
        .limit(20);

    // 5. Recent payments (last 10)
    const recentPayments = await db
        .select()
        .from(taxPayment)
        .where(eq(taxPayment.businessId, userId))
        .orderBy(desc(taxPayment.createdAt))
        .limit(10);

    // ── Build PDF ────────────────────────────────────────────

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const now = new Date();

    // Header
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("TaxFlow — Tax Report", 14, 22);

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100);
    doc.text(`Generated: ${now.toLocaleDateString()} at ${now.toLocaleTimeString()}`, 14, 29);
    doc.text(`Rwanda Revenue Authority (RRA) Compliance Report`, pageWidth - 14, 29, { align: "right" });

    // Trader info
    doc.setDrawColor(200);
    doc.line(14, 33, pageWidth - 14, 33);

    doc.setFontSize(10);
    doc.setTextColor(50);
    doc.setFont("helvetica", "bold");
    doc.text("Business Details", 14, 40);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(`Business: ${profile?.businessName || profile?.name || "—"}`, 14, 47);
    doc.text(`TIN: ${profile?.tinNumber || "—"}`, 14, 53);
    doc.text(`Role: ${(profile?.role || "—").replace("_", " ")}`, 14, 59);

    // VAT Summary
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("VAT Summary", 14, 70);

    autoTable(doc, {
        startY: 74,
        head: [["Category", "Amount (RWF)"]],
        body: [
            ["VAT Output (collected on sales)", vatOutput.toLocaleString()],
            ["VAT Input (paid on purchases)", vatInput.toLocaleString()],
            ["Net VAT Due to RRA", netVatDue.toLocaleString()],
        ],
        theme: "grid",
        headStyles: { fillColor: [41, 98, 255], fontSize: 8 },
        bodyStyles: { fontSize: 8 },
        columnStyles: { 1: { halign: "right", fontStyle: "bold" } },
        margin: { left: 14, right: 14 },
    });

    // Compliance Status
    const lastY1 = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Compliance Status", 14, lastY1);

    autoTable(doc, {
        startY: lastY1 + 4,
        head: [["Metric", "Value"]],
        body: [
            ["Total Paid", `${totalPaid.toLocaleString()} RWF`],
            ["Outstanding Balance", `${outstanding.toLocaleString()} RWF`],
            ["Compliance %", `${Math.round(compliancePct * 10) / 10}%`],
            ["Status", compliancePct >= 95 ? "✓ Compliant" : "⚠ Non-Compliant"],
            ["Payment Count", String(paymentSummary?.paymentCount || 0)],
        ],
        theme: "grid",
        headStyles: { fillColor: [41, 98, 255], fontSize: 8 },
        bodyStyles: { fontSize: 8 },
        columnStyles: { 1: { halign: "right", fontStyle: "bold" } },
        margin: { left: 14, right: 14 },
    });

    // Recent Transactions
    const lastY2 = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Recent Transactions (Sales)", 14, lastY2);

    if (recentTxns.length > 0) {
        autoTable(doc, {
            startY: lastY2 + 4,
            head: [["Product", "Qty", "Total (RWF)", "VAT (RWF)", "Status", "Date"]],
            body: recentTxns.map((t) => [
                t.productName,
                t.quantity.toString(),
                t.totalAmount.toLocaleString(),
                t.vatAmount.toLocaleString(),
                t.status,
                new Date(t.createdAt).toLocaleDateString(),
            ]),
            theme: "striped",
            headStyles: { fillColor: [41, 98, 255], fontSize: 7 },
            bodyStyles: { fontSize: 7 },
            margin: { left: 14, right: 14 },
        });
    } else {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.text("No transactions recorded.", 14, lastY2 + 6);
    }

    // Payment History
    const lastY3 = recentTxns.length > 0
        ? (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10
        : lastY2 + 14;

    // Check if we need a new page
    if (lastY3 > 250) {
        doc.addPage();
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.text("Payment History", 14, 20);

        if (recentPayments.length > 0) {
            autoTable(doc, {
                startY: 24,
                head: [["Amount (RWF)", "Method", "Reference", "Status", "Date"]],
                body: recentPayments.map((p) => [
                    p.amount.toLocaleString(),
                    p.method.replace("_", " "),
                    p.reference || "—",
                    p.status,
                    new Date(p.createdAt).toLocaleDateString(),
                ]),
                theme: "striped",
                headStyles: { fillColor: [41, 98, 255], fontSize: 7 },
                bodyStyles: { fontSize: 7 },
                margin: { left: 14, right: 14 },
            });
        }
    } else {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.text("Payment History", 14, lastY3);

        if (recentPayments.length > 0) {
            autoTable(doc, {
                startY: lastY3 + 4,
                head: [["Amount (RWF)", "Method", "Reference", "Status", "Date"]],
                body: recentPayments.map((p) => [
                    p.amount.toLocaleString(),
                    p.method.replace("_", " "),
                    p.reference || "—",
                    p.status,
                    new Date(p.createdAt).toLocaleDateString(),
                ]),
                theme: "striped",
                headStyles: { fillColor: [41, 98, 255], fontSize: 7 },
                bodyStyles: { fontSize: 7 },
                margin: { left: 14, right: 14 },
            });
        } else {
            doc.setFont("helvetica", "normal");
            doc.setFontSize(8);
            doc.text("No payments recorded.", 14, lastY3 + 6);
        }
    }

    // Footer
    const pageCount = doc.internal.pages.length - 1;
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(7);
        doc.setTextColor(150);
        doc.text(
            `TaxFlow Report — ${profile?.businessName || profile?.name || ""} — Page ${i} of ${pageCount}`,
            pageWidth / 2,
            doc.internal.pageSize.getHeight() - 8,
            { align: "center" },
        );
    }

    // Output
    const pdfBase64 = doc.output("datauristring");
    const dateStr = now.toISOString().slice(0, 10);
    const filename = `TaxReport_${(profile?.tinNumber || "export").replace(/\s/g, "_")}_${dateStr}.pdf`;

    return { base64: pdfBase64, filename };
}
