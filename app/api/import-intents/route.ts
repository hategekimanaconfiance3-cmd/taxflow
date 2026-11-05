import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createImportIntent, listImportIntents } from '@/lib/import-intent-service';
import { importIntentSchema } from '@/lib/validation/import-intent.schema';

const traderRoles = ['manufacturer', 'wholesaler', 'retailer'];

function json(body: unknown, status: number, requestId: string): NextResponse {
  return NextResponse.json(body, { status, headers: { 'x-request-id': requestId } });
}

async function getAuthorizedBusiness(request: Request, requestId: string) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return { id: null, denied: json({ error: 'Sign in to continue.' }, 401, requestId) };
  if (session.user.isActive === false) return { id: null, denied: json({ error: 'This account is inactive.' }, 403, requestId) };
  if (!traderRoles.includes(session.user.role ?? '')) {
    return { id: null, denied: json({ error: 'Import planning is available to manufacturers, wholesalers, and retailers.' }, 403, requestId) };
  }
  if ((session.user as Record<string, unknown>).clearanceStatus !== 'approved') {
    return { id: null, denied: json({ error: 'Your business account must be approved before planning imports.' }, 403, requestId) };
  }
  return { id: session.user.id, denied: null };
}

export async function GET(request: Request): Promise<NextResponse> {
  const requestId = randomUUID();
  try {
    const access = await getAuthorizedBusiness(request, requestId);
    if (access.denied || !access.id) return access.denied ?? json({ error: 'Sign in to continue.' }, 401, requestId);
    return json({ intents: await listImportIntents(access.id) }, 200, requestId);
  } catch (error) {
    console.error('[import-intents:list]', { requestId, errorName: error instanceof Error ? error.name : 'UnknownError' });
    return json({ error: 'Unable to load intended imports. Please retry.', requestId }, 500, requestId);
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  const requestId = randomUUID();
  try {
    const access = await getAuthorizedBusiness(request, requestId);
    if (access.denied || !access.id) return access.denied ?? json({ error: 'Sign in to continue.' }, 401, requestId);
    let body: unknown;
    try { body = await request.json(); } catch { return json({ error: 'Enter valid intended import details.' }, 400, requestId); }
    const parsed = importIntentSchema.safeParse(body);
    if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? 'Check the product, quantity, and country.' }, 400, requestId);
    const intent = await createImportIntent(access.id, parsed.data);
    return json({ intent }, 201, requestId);
  } catch (error) {
    console.error('[import-intents:create]', { requestId, errorName: error instanceof Error ? error.name : 'UnknownError' });
    return json({ error: 'Unable to record the intended import. Please retry.', requestId }, 500, requestId);
  }
}
