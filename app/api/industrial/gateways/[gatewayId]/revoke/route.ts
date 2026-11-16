import { NextResponse } from 'next/server';
import { revokeIndustrialGateway } from '@/lib/actions/industrial.action';

export const runtime = 'nodejs';

export async function POST(_request: Request, context: { params: Promise<{ gatewayId: string }> }): Promise<NextResponse> {
  try {
    const { gatewayId } = await context.params;
    return NextResponse.json({ gateway: await revokeIndustrialGateway(gatewayId) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Gateway revocation failed.' }, { status: 400 });
  }
}
