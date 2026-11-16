import { NextResponse } from 'next/server';
import { submitFactory } from '@/lib/actions/factory.action';

export const runtime = 'nodejs';

export async function POST(
  _request: Request,
  context: { params: Promise<{ factoryId: string }> },
): Promise<NextResponse> {
  try {
    const { factoryId } = await context.params;
    return NextResponse.json({ factory: await submitFactory(factoryId) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Factory submission failed.' }, { status: 400 });
  }
}
