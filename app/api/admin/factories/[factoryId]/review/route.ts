import { NextResponse } from 'next/server';
import { reviewFactory } from '@/lib/actions/factory.action';

export const runtime = 'nodejs';

export async function POST(
  request: Request,
  context: { params: Promise<{ factoryId: string }> },
): Promise<NextResponse> {
  try {
    const { factoryId } = await context.params;
    const body: unknown = await request.json();
    const input = typeof body === 'object' && body !== null && !Array.isArray(body)
      ? { ...body, factoryId }
      : { factoryId };
    return NextResponse.json({ factory: await reviewFactory(input) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Factory review could not be saved.' }, { status: 400 });
  }
}
