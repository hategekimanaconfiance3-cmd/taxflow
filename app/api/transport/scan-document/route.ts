// POST /api/transport/scan-document
// Accepts an uploaded transport document image and extracts structured data
// using Google Gemini multimodal OCR.
// Optionally cross-checks against a known transaction record.
//
// Requires: active RRA staff or trader session.
// File size limit: 10 MB (enforced by Next.js).

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import db from '@/db/drizzle';
import { rraStaff, transaction, user } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { extractTransportDocument, crossCheckOCRWithTransaction } from '@/lib/ai/document-ocr';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// 10 MB file size limit
const MAX_FILE_BYTES = 10 * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
]);

async function getAuthorizedSession(): Promise<{ userId: string; isStaff: boolean } | null> {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) return null;

    const [staff] = await db.select({ id: rraStaff.id })
      .from(rraStaff)
      .where(and(eq(rraStaff.userId, session.user.id), eq(rraStaff.isActive, true)))
      .limit(1);

    return { userId: session.user.id, isStaff: !!staff };
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthorizedSession();
    if (!session) {
      return NextResponse.json({ ok: false, error: 'Authentication required' }, { status: 401 });
    }

    const contentType = request.headers.get('content-type') ?? '';

    // Handle multipart form upload
    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = formData.get('document') as File | null;
      const transactionId = formData.get('transactionId') as string | null;

      if (!file) {
        return NextResponse.json({ ok: false, error: 'No document file provided. Use field name: document' }, { status: 400 });
      }

      if (file.size > MAX_FILE_BYTES) {
        return NextResponse.json({ ok: false, error: `File too large (${Math.round(file.size / 1024 / 1024)} MB). Maximum: 10 MB` }, { status: 413 });
      }

      const mimeType = file.type as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' | 'application/pdf';
      if (!ALLOWED_MIME_TYPES.has(mimeType)) {
        return NextResponse.json({
          ok: false,
          error: `Unsupported file type: ${mimeType}. Allowed: JPEG, PNG, WebP, GIF, PDF`,
        }, { status: 415 });
      }

      // Convert file to base64
      const arrayBuffer = await file.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString('base64');

      // Run OCR
      const ocrResult = await extractTransportDocument({
        type: 'base64',
        data: base64,
        mimeType,
      });

      if (!ocrResult.ok || !ocrResult.data) {
        return NextResponse.json({ ok: false, error: ocrResult.error ?? 'OCR failed' }, { status: 500 });
      }

      // Cross-check against transaction if provided
      let crossCheck = null;
      if (transactionId) {
        const [txn] = await db
          .select({
            id: transaction.id,
            quantity: transaction.quantity,
            buyerName: transaction.buyerName,
            buyerId: transaction.buyerId,
            sellerId: transaction.sellerId,
            status: transaction.status,
          })
          .from(transaction)
          .where(eq(transaction.id, transactionId))
          .limit(1);

        if (txn) {
          // Enforce access control: traders can only scan their own transactions
          if (!session.isStaff && txn.sellerId !== session.userId && txn.buyerId !== session.userId) {
            return NextResponse.json({ ok: false, error: 'Access denied to this transaction' }, { status: 403 });
          }

          const [buyerUser] = txn.buyerId
            ? await db.select({ businessName: user.businessName }).from(user).where(eq(user.id, txn.buyerId)).limit(1)
            : [null];

          const [sellerUser] = await db.select({ businessName: user.businessName }).from(user).where(eq(user.id, txn.sellerId)).limit(1);

          crossCheck = crossCheckOCRWithTransaction(ocrResult.data, {
            quantity: txn.quantity,
            buyerName: buyerUser?.businessName ?? txn.buyerName,
            sellerName: sellerUser?.businessName,
            reference: txn.id,
          });
        }
      }

      return NextResponse.json({
        ok: true,
        document: ocrResult.data,
        processingMs: ocrResult.processingMs,
        crossCheck,
        disclaimer: 'AI-generated OCR extraction. All data must be verified against original documents before any official action.',
      }, { headers: { 'Cache-Control': 'no-store' } });
    }

    // Handle JSON body with URL
    const body = await request.json() as { documentUrl?: string; transactionId?: string };
    if (!body.documentUrl) {
      return NextResponse.json({ ok: false, error: 'Provide a document file (multipart/form-data) or documentUrl (JSON)' }, { status: 400 });
    }

    // Validate URL is accessible (basic check)
    let url: URL;
    try {
      url = new URL(body.documentUrl);
      if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Invalid protocol');
    } catch {
      return NextResponse.json({ ok: false, error: 'Invalid document URL' }, { status: 400 });
    }

    const ocrResult = await extractTransportDocument({ type: 'url', url: body.documentUrl });

    if (!ocrResult.ok || !ocrResult.data) {
      return NextResponse.json({ ok: false, error: ocrResult.error ?? 'OCR failed' }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      document: ocrResult.data,
      processingMs: ocrResult.processingMs,
      crossCheck: null,
      disclaimer: 'AI-generated OCR extraction. All data must be verified against original documents before any official action.',
    }, { headers: { 'Cache-Control': 'no-store' } });

  } catch (error) {
    console.error('[/api/transport/scan-document] error:', error);
    return NextResponse.json({ ok: false, error: 'Internal error' }, { status: 500 });
  }
}
