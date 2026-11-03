import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import QRCode from "qrcode";
import type { SalesInvoiceSnapshot } from "@/lib/sales-invoice-types";

const money = (amount: number): string => `${amount.toLocaleString("en-US")} RWF`;
const navy: [number, number, number] = [12, 42, 112];
const green: [number, number, number] = [0, 112, 72];
const slate: [number, number, number] = [74, 85, 104];

export function renderSalesInvoicePdf(snapshot: SalesInvoiceSnapshot, verificationUrl: string): Uint8Array {
  const doc = new jsPDF({ orientation: "landscape", format: "a4", unit: "mm", compress: true });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  const issuedAt = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(snapshot.issuedAt));

  // Invoice header: clear identity, document class, and immutable reference.
  doc.setFillColor(...navy);
  doc.roundedRect(margin, 10, 15, 15, 2, 2, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("TF", margin + 7.5, 19.5, { align: "center" });
  doc.setTextColor(...navy);
  doc.setFontSize(19);
  doc.text("TaxFlow", margin + 20, 17);
  doc.setTextColor(...green);
  doc.text(" Sales Invoice", margin + 45, 17);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...slate);
  doc.text("TaxFlow sales document", margin + 20, 22);
  doc.setTextColor(175, 35, 35);
  doc.text("This is not an RRA/EBM fiscal invoice.", margin + 20, 27);

  const metaX = pageWidth - margin - 92;
  doc.setFillColor(242, 247, 255);
  doc.setDrawColor(185, 207, 245);
  doc.roundedRect(metaX, 9, 92, 30, 2, 2, "FD");
  doc.setTextColor(...green);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(snapshot.invoiceNumber, metaX + 5, 16);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...slate);
  doc.setFontSize(8);
  doc.text(`Issued: ${issuedAt}`, metaX + 5, 23);
  doc.setTextColor(0, 103, 63);
  doc.text("CONFIRMED", metaX + 5, 29);
  doc.setTextColor(...slate);
  doc.text(`Currency: ${snapshot.currency}`, metaX + 5, 35);
  doc.text(`Transaction: ${snapshot.transaction.id}`, metaX + 5, 39, { maxWidth: 58 });

  const qr = QRCode.create(verificationUrl, { errorCorrectionLevel: "M" });
  const qrSize = 20;
  const qrX = metaX + 68;
  const qrY = 12;
  const qrModuleSize = qrSize / qr.modules.size;
  doc.setFillColor(255, 255, 255);
  doc.rect(qrX - 1, qrY - 1, qrSize + 2, qrSize + 2, "F");
  doc.setFillColor(0, 0, 0);
  for (let row = 0; row < qr.modules.size; row += 1) {
    for (let column = 0; column < qr.modules.size; column += 1) {
      if (qr.modules.get(row, column)) {
        doc.rect(qrX + column * qrModuleSize, qrY + row * qrModuleSize, qrModuleSize, qrModuleSize, "F");
      }
    }
  }
  doc.setFontSize(6);
  doc.setTextColor(...navy);
  doc.text("SCAN TO VERIFY", qrX + qrSize / 2, 36, { align: "center" });

  // Summary notice makes document purpose explicit without asserting fiscal status.
  doc.setFillColor(239, 249, 246);
  doc.setDrawColor(163, 217, 201);
  doc.roundedRect(margin, 44, contentWidth, 16, 2, 2, "FD");
  doc.setTextColor(0, 96, 74);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("DOCUMENT SUMMARY", margin + 5, 50);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(48, 60, 78);
  doc.setFontSize(8);
  doc.text("Generated for a confirmed or completed TaxFlow transaction. Amounts are stated in Rwandan Francs (RWF). Anyone with the QR can view invoice details.", margin + 5, 55, { maxWidth: contentWidth - 10 });

  const partyY = 65;
  const partyGap = 5;
  const partyWidth = (contentWidth - partyGap) / 2;
  const drawParty = (x: number, heading: string, name: string, tin: string | null): void => {
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(185, 207, 245);
    doc.roundedRect(x, partyY, partyWidth, 25, 2, 2, "FD");
    doc.setTextColor(...navy);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text(heading.toUpperCase(), x + 5, partyY + 6);
    doc.setFontSize(10);
    doc.text(name, x + 5, partyY + 13, { maxWidth: partyWidth - 10 });
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...slate);
    doc.setFontSize(8);
    if (tin) doc.text(`TIN: ${tin}`, x + 5, partyY + 20);
  };
  drawParty(margin, "Seller", snapshot.seller.name, snapshot.seller.tin);
  drawParty(margin + partyWidth + partyGap, "Buyer", snapshot.buyer.name, snapshot.buyer.tin);

  autoTable(doc, {
    startY: 95,
    margin: { left: margin, right: margin, bottom: 18 },
    head: [["#", "Description", "HS Code", "Quantity", "Unit", "Unit Price (RWF)", "VAT Rate", "Recorded VAT (RWF)", "Line Total (RWF)"]],
    body: snapshot.lines.map((line, index) => [
      String(index + 1),
      line.description,
      "—",
      line.quantity.toLocaleString("en-US"),
      line.unit,
      money(line.unitPriceRwf),
      line.vatRateBasisPoints === null ? "—" : `${(line.vatRateBasisPoints / 100).toLocaleString("en-US")}%`,
      money(line.vatRwf),
      money(line.totalRwf),
    ]),
    styles: { font: "helvetica", fontSize: 7.2, cellPadding: 2.2, overflow: "linebreak", textColor: [32, 43, 61] },
    headStyles: { fillColor: navy, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 7 },
    alternateRowStyles: { fillColor: [247, 249, 253] },
    columnStyles: {
      0: { cellWidth: 8 }, 1: { cellWidth: 45 }, 2: { cellWidth: 18 }, 3: { cellWidth: 18 },
      4: { cellWidth: 17 }, 5: { cellWidth: 31 }, 6: { cellWidth: 17 }, 7: { cellWidth: 31 }, 8: { cellWidth: 34 },
    },
    rowPageBreak: "avoid",
  });

  const finalY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 100;
  let cardsY = finalY + 6;
  if (cardsY + 40 > pageHeight - 17) {
    doc.addPage();
    cardsY = 18;
  }
  const cardGap = 4;
  const cardWidth = (contentWidth - cardGap * 2) / 3;
  const amountX = margin;
  const noticeX = margin + cardWidth + cardGap;
  const paymentX = margin + (cardWidth + cardGap) * 2;
  const cardHeight = 39;

  doc.setFillColor(239, 249, 246);
  doc.setDrawColor(163, 217, 201);
  doc.roundedRect(amountX, cardsY, cardWidth, cardHeight, 2, 2, "FD");
  doc.setTextColor(0, 96, 74);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("AMOUNTS SUMMARY", amountX + 4, cardsY + 7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(48, 60, 78);
  doc.setFontSize(8);
  doc.text(`Subtotal (excl. VAT)   ${money(snapshot.subtotalRwf)}`, amountX + 4, cardsY + 15);
  doc.text(`Recorded VAT           ${money(snapshot.recordedVatRwf)}`, amountX + 4, cardsY + 22);
  doc.setDrawColor(163, 217, 201);
  doc.line(amountX + 4, cardsY + 25, amountX + cardWidth - 4, cardsY + 25);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 96, 74);
  doc.text(`Invoice total: ${money(snapshot.totalRwf)}`, amountX + 4, cardsY + 33);

  doc.setFillColor(255, 248, 232);
  doc.setDrawColor(245, 193, 98);
  doc.roundedRect(noticeX, cardsY, cardWidth, cardHeight, 2, 2, "FD");
  doc.setTextColor(151, 83, 0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("IMPORTANT NOTICE", noticeX + 4, cardsY + 7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(48, 60, 78);
  doc.setFontSize(7.4);
  doc.text("Invoice amount is not proof of payment. Payment is recorded separately when confirmed. This document does not itself create tax liability.", noticeX + 4, cardsY + 14, { maxWidth: cardWidth - 8, lineHeightFactor: 1.4 });

  doc.setFillColor(245, 248, 255);
  doc.setDrawColor(185, 207, 245);
  doc.roundedRect(paymentX, cardsY, cardWidth, cardHeight, 2, 2, "FD");
  doc.setTextColor(...navy);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("PAYMENT STATUS", paymentX + 4, cardsY + 7);
  doc.setTextColor(0, 76, 170);
  doc.setFontSize(9);
  doc.text("Not available on this invoice", paymentX + 4, cardsY + 15);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(48, 60, 78);
  doc.setFontSize(7.4);
  doc.text("This invoice does not certify payment.", paymentX + 4, cardsY + 22, { maxWidth: cardWidth - 8 });

  const evidenceY = cardsY + cardHeight + 5;
  if (evidenceY + 12 > pageHeight - 16) doc.addPage();
  const actualEvidenceY = evidenceY + 12 > pageHeight - 16 ? 18 : evidenceY;
  doc.setDrawColor(185, 207, 245);
  doc.setLineDashPattern([1.5, 1.5], 0);
  doc.line(margin, actualEvidenceY, pageWidth - margin, actualEvidenceY);
  doc.setLineDashPattern([], 0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(...navy);
  doc.text("EVIDENCE & INTEGRITY", margin, actualEvidenceY + 6);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...slate);
  doc.text("Immutable invoice snapshot; recorded details cannot be edited or deleted.", margin + 38, actualEvidenceY + 6);
  doc.text(`Document: ${snapshot.invoiceNumber}  |  Issued: ${issuedAt}  |  TaxFlow transaction record`, margin, actualEvidenceY + 11);

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(205, 216, 235);
    doc.line(margin, pageHeight - 10, pageWidth - margin, pageHeight - 10);
    doc.setFontSize(7.5);
    doc.setTextColor(110, 120, 137);
    doc.text("Powered by TaxFlow · TaxFlow sales document; not an RRA/EBM fiscal invoice", margin, pageHeight - 5);
    doc.text(`Page ${page} of ${pageCount}`, pageWidth - margin, pageHeight - 5, { align: "right" });
  }
  return new Uint8Array(doc.output("arraybuffer"));
}
