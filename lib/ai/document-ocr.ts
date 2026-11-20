// Server-only — Document OCR Engine
// Uses Google Gemini's multimodal vision capabilities to extract structured
// data from transport documents: waybills, delivery notes, CMR documents,
// and import declarations.
// No external OCR service required — uses existing GOOGLE_GENERATIVE_AI_API_KEY.

import { generateObject } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Output schema — extracted transport document data
// ---------------------------------------------------------------------------

export const TransportDocumentSchema = z.object({
  documentType: z.enum([
    'waybill',
    'delivery_note',
    'cmr',
    'import_declaration',
    'invoice',
    'packing_list',
    'unknown',
  ]).describe('Type of transport document detected'),

  referenceNumber: z.string().nullable().describe('Waybill, delivery note or customs reference number'),

  shipper: z.object({
    name: z.string().nullable(),
    tin: z.string().nullable().describe('Tax Identification Number if visible'),
    address: z.string().nullable(),
  }).describe('Sending party'),

  consignee: z.object({
    name: z.string().nullable(),
    tin: z.string().nullable(),
    address: z.string().nullable(),
  }).describe('Receiving party'),

  carrier: z.object({
    name: z.string().nullable(),
    vehicleRegistration: z.string().nullable().describe('Truck or vehicle plate number'),
    driverName: z.string().nullable(),
  }).describe('Transport carrier details'),

  goods: z.array(z.object({
    description: z.string(),
    quantity: z.number().nullable(),
    unit: z.string().nullable(),
    weight: z.string().nullable(),
    batchOrLotNumber: z.string().nullable(),
  })).describe('List of goods being transported'),

  origin: z.string().nullable().describe('Place of loading / origin'),
  destination: z.string().nullable().describe('Place of delivery / destination'),

  dates: z.object({
    documentDate: z.string().nullable().describe('Date on the document (ISO 8601 or as written)'),
    loadingDate: z.string().nullable(),
    expectedDeliveryDate: z.string().nullable(),
  }),

  declaredValue: z.number().nullable().describe('Total declared value in RWF if stated'),
  currency: z.string().nullable().describe('Currency code (RWF, USD, EUR, etc.)'),

  discrepancyFlags: z.array(z.string()).describe(
    'List of potential issues found in the document, e.g. missing TIN, illegible quantities, inconsistent dates'
  ),

  ocrConfidence: z.enum(['high', 'medium', 'low']).describe(
    'Overall OCR confidence: high = most fields clear, medium = some unclear, low = document poor quality'
  ),

  rawTextExtracted: z.string().describe('Raw text extracted from the document before structured parsing'),
});

export type TransportDocument = z.infer<typeof TransportDocumentSchema>;

export interface OCRResult {
  ok: boolean;
  data?: TransportDocument;
  error?: string;
  processingMs?: number;
}

// ---------------------------------------------------------------------------
// Main OCR function — accepts image URL or base64
// ---------------------------------------------------------------------------

/**
 * Extract structured transport document data from an image.
 *
 * @param imageSource - Either a URL string or a base64-encoded image with mime type
 */
export async function extractTransportDocument(imageSource: {
  type: 'url';
  url: string;
} | {
  type: 'base64';
  data: string;        // base64 string without data: prefix
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' | 'application/pdf';
}): Promise<OCRResult> {
  const startMs = Date.now();

  try {
    const imagePart = imageSource.type === 'url'
      ? { type: 'image' as const, image: new URL(imageSource.url) }
      : {
          type: 'image' as const,
          image: Buffer.from(imageSource.data, 'base64'),
          mimeType: imageSource.mimeType,
        };

    const { object } = await generateObject({
      model: google('gemini-1.5-flash'),
      schema: TransportDocumentSchema,
      messages: [
        {
          role: 'user',
          content: [
            imagePart,
            {
              type: 'text',
              text: `You are a document intelligence system for Rwanda Revenue Authority (RRA) TaxFlow.

Extract all readable information from this transport document image.

EXTRACTION RULES:
1. Extract ONLY what is visible in the document. Do not guess or invent data.
2. For TIN numbers: look for "TIN:", "TIN No:", "NIF:", or long numeric codes near business names.
3. For vehicle registration: look for plate numbers near "truck", "vehicle", "transport", "reg no".
4. For quantities: extract the numeric value and the unit separately.
5. If a field is not visible or illegible, return null.
6. Set ocrConfidence based on overall document readability.
7. List in discrepancyFlags: missing required fields, illegible areas, inconsistent dates/quantities, missing TIN.
8. For rawTextExtracted: capture all readable text from the document as a single string.

This is a legal tax compliance system. Accuracy is critical. When uncertain, prefer null over a guess.`,
            },
          ],
        },
      ],
    });

    return {
      ok: true,
      data: object,
      processingMs: Date.now() - startMs,
    };
  } catch (error) {
    console.error('[Document OCR] extractTransportDocument error:', error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'OCR extraction failed',
      processingMs: Date.now() - startMs,
    };
  }
}

// ---------------------------------------------------------------------------
// Cross-check OCR result against a known transaction
// ---------------------------------------------------------------------------

export interface OCRCrossCheckResult {
  matched: boolean;
  discrepancies: Array<{
    field: string;
    ocrValue: string | number | null;
    recordedValue: string | number | null;
    severity: 'info' | 'warning' | 'critical';
  }>;
  summary: string;
}

export function crossCheckOCRWithTransaction(
  ocr: TransportDocument,
  transaction: {
    quantity: number;
    buyerName?: string | null;
    sellerName?: string | null;
    productName?: string | null;
    reference?: string | null;
  },
): OCRCrossCheckResult {
  const discrepancies: OCRCrossCheckResult['discrepancies'] = [];

  // Check total quantity
  const totalOCRQty = ocr.goods.reduce((sum, g) => sum + (g.quantity ?? 0), 0);
  if (totalOCRQty > 0 && transaction.quantity > 0) {
    const diff = Math.abs(totalOCRQty - transaction.quantity);
    const diffPct = (diff / transaction.quantity) * 100;
    if (diffPct > 10) {
      discrepancies.push({
        field: 'quantity',
        ocrValue: totalOCRQty,
        recordedValue: transaction.quantity,
        severity: diffPct > 30 ? 'critical' : 'warning',
      });
    }
  }

  // Check buyer name (fuzzy)
  if (ocr.consignee.name && transaction.buyerName) {
    const ocrName = ocr.consignee.name.toLowerCase().trim();
    const txnName = transaction.buyerName.toLowerCase().trim();
    if (!ocrName.includes(txnName.slice(0, 6)) && !txnName.includes(ocrName.slice(0, 6))) {
      discrepancies.push({
        field: 'consignee_name',
        ocrValue: ocr.consignee.name,
        recordedValue: transaction.buyerName,
        severity: 'warning',
      });
    }
  }

  // Check reference number
  if (ocr.referenceNumber && transaction.reference) {
    if (!ocr.referenceNumber.includes(transaction.reference) && !transaction.reference.includes(ocr.referenceNumber)) {
      discrepancies.push({
        field: 'reference_number',
        ocrValue: ocr.referenceNumber,
        recordedValue: transaction.reference,
        severity: 'info',
      });
    }
  }

  const critical = discrepancies.filter(d => d.severity === 'critical').length;
  const warnings = discrepancies.filter(d => d.severity === 'warning').length;

  return {
    matched: discrepancies.length === 0,
    discrepancies,
    summary: discrepancies.length === 0
      ? 'OCR data matches transaction records within tolerance.'
      : `${critical} critical and ${warnings} warning discrepancies found between document and recorded transaction.`,
  };
}
