import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { loadSalesInvoiceForParty } from '@/lib/sales-invoice-access';
import { renderSalesInvoicePdf } from '@/lib/sales-invoice-pdf';

const invoiceIdSchema = z.string().uuid();

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ invoiceId: string }> },
): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const { invoiceId } = await context.params;
  const parsed = invoiceIdSchema.safeParse(invoiceId);
  if (!parsed.success) return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 });

  const invoice = await loadSalesInvoiceForParty(parsed.data, session.user.id);
  if (!invoice) return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 });

  const pdf = renderSalesInvoicePdf(invoice.snapshot);
  return new NextResponse(Buffer.from(pdf), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${invoice.invoiceNumber}.pdf"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
