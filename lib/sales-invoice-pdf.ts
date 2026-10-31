import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { SalesInvoiceSnapshot } from "@/lib/sales-invoice-types";

const money = (amount: number): string => `${amount.toLocaleString("en-US")} RWF`;

export function renderSalesInvoicePdf(snapshot: SalesInvoiceSnapshot): Uint8Array {
  const doc = new jsPDF({ format: "a4", unit: "mm", compress: true });
  const margin = 16;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("TaxFlow Sales Invoice", margin, 20);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("TaxFlow sales document. This is not an RRA/EBM fiscal invoice.", margin, 27);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(snapshot.invoiceNumber, margin, 39);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Issued: ${new Date(snapshot.issuedAt).toLocaleDateString("en-GB", { timeZone: "UTC" })}`, margin, 46);
  doc.text(`Transaction: ${snapshot.transaction.id}`, margin, 52);
  doc.text(`Status: ${snapshot.transaction.status}`, margin, 58);

  doc.setFont("helvetica", "bold");
  doc.text("Seller", margin, 70);
  doc.text("Buyer", 108, 70);
  doc.setFont("helvetica", "normal");
  doc.text(snapshot.seller.name, margin, 76, { maxWidth: 82 });
  doc.text(snapshot.buyer.name, 108, 76, { maxWidth: 82 });
  if (snapshot.seller.tin) doc.text(`TIN: ${snapshot.seller.tin}`, margin, 82);
  if (snapshot.buyer.tin) doc.text(`TIN: ${snapshot.buyer.tin}`, 108, 82);

  autoTable(doc, {
    startY: 92,
    margin: { left: margin, right: margin },
    head: [["Description", "Quantity", "Unit", "Unit price", "VAT rate", "Recorded VAT", "Line total"]],
    body: snapshot.lines.map((line) => [
      line.description,
      line.quantity.toLocaleString("en-US"),
      line.unit,
      money(line.unitPriceRwf),
      line.vatRateBasisPoints === null ? "—" : `${(line.vatRateBasisPoints / 100).toLocaleString("en-US")}%`,
      money(line.vatRwf),
      money(line.totalRwf),
    ]),
    styles: { font: "helvetica", fontSize: 8, cellPadding: 3, overflow: "linebreak" },
    headStyles: { fillColor: [24, 24, 27], textColor: [255, 255, 255] },
    columnStyles: { 0: { cellWidth: 42 }, 1: { cellWidth: 20 }, 2: { cellWidth: 14 }, 3: { cellWidth: 27 }, 4: { cellWidth: 17 }, 5: { cellWidth: 27 }, 6: { cellWidth: 27 } },
    rowPageBreak: "avoid",
  });

  const finalY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 100;
  const summaryY = finalY + 37 > 270 ? 30 : finalY + 12;
  if (summaryY === 30) doc.addPage();
  doc.setFont("helvetica", "normal");
  doc.text(`Subtotal: ${money(snapshot.subtotalRwf)}`, 132, summaryY, { align: "right" });
  doc.text(`Recorded VAT: ${money(snapshot.recordedVatRwf)}`, 132, summaryY + 7, { align: "right" });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(`Invoice total: ${money(snapshot.totalRwf)}`, 132, summaryY + 16, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text("Invoice amount is not evidence of payment. Payment status is not certified by this document.", margin, summaryY + 25, { maxWidth: 175 });

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFontSize(8);
    doc.setTextColor(110, 110, 110);
    doc.text("TaxFlow Sales Invoice", margin, 286);
    doc.text(`Page ${page} of ${pageCount}`, 194, 286, { align: "right" });
  }
  return new Uint8Array(doc.output("arraybuffer"));
}
