import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import {
  listIncomingConfirmedTransactions,
  listManufacturerMaterialAccounting,
  submitProductionMaterialReceipt,
  MaterialAccountingError,
} from '@/lib/material-accounting-service';
import { productionMaterialReceiptSchema } from '@/lib/validation/production.schema';

function json(body: unknown, status: number, requestId: string): NextResponse {
  return NextResponse.json(body, { status, headers: { 'x-request-id': requestId } });
}

async function manufacturerId(request: Request, requestId: string): Promise<{ id: string } | { response: NextResponse }> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return { response: json({ error: 'Sign in to continue.' }, 401, requestId) };
  if (session.user.isActive === false) return { response: json({ error: 'This account is inactive.' }, 403, requestId) };
  if (session.user.role !== 'manufacturer') return { response: json({ error: 'Confidential material accounting is available only to the manufacturer account.' }, 403, requestId) };
  return { id: session.user.id };
}

export async function GET(request: Request): Promise<NextResponse> {
  const requestId = randomUUID();
  try {
    const access = await manufacturerId(request, requestId);
    if ('response' in access) return access.response;
    const [accounting, incomingTransactions] = await Promise.all([
      listManufacturerMaterialAccounting(access.id),
      listIncomingConfirmedTransactions(access.id),
    ]);
    return json({ ...accounting, incomingTransactions }, 200, requestId);
  } catch (error) {
    console.error('[production-material-accounting:read]', { requestId, errorName: error instanceof Error ? error.name : 'UnknownError' });
    return json({ error: 'Unable to load material accounting.', requestId }, 500, requestId);
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  const requestId = randomUUID();
  try {
    const access = await manufacturerId(request, requestId);
    if ('response' in access) return access.response;
    let body: unknown;
    try { body = await request.json(); } catch { return json({ error: 'Enter valid receipt details.' }, 400, requestId); }
    const parsed = productionMaterialReceiptSchema.safeParse(body);
    if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? 'Enter valid receipt details.' }, 400, requestId);
    const result = await submitProductionMaterialReceipt(access.id, parsed.data);
    return json(result, result.replayed ? 200 : 201, requestId);
  } catch (error) {
    if (error instanceof MaterialAccountingError) {
      const status = ['MATERIAL_NOT_FOUND', 'IMPORT_NOT_VERIFIED', 'TRANSACTION_NOT_CONFIRMED'].includes(error.code) ? 400 : 409;
      return json({ error: error.message, code: error.code }, status, requestId);
    }
    console.error('[production-material-accounting:submit]', { requestId, errorName: error instanceof Error ? error.name : 'UnknownError' });
    return json({ error: 'Unable to submit material receipt. No material stock was changed.', requestId }, 500, requestId);
  }
}
