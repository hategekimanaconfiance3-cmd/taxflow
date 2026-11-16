import { NextResponse } from 'next/server';
import { getMyFactoryLines, registerFactoryProductionLine } from '@/lib/actions/factory.action';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ factoryId: string }> },
): Promise<NextResponse> {
  try {
    const { factoryId } = await context.params;
    return NextResponse.json({ lines: await getMyFactoryLines(factoryId) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Production lines could not be loaded.' }, { status: 401 });
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ factoryId: string }> },
): Promise<NextResponse> {
  try {
    const { factoryId } = await context.params;
    const body: unknown = await request.json();
    const input = isRecord(body) ? { ...body, factoryId } : { factoryId };
    return NextResponse.json({ line: await registerFactoryProductionLine(input) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Production-line registration failed.' }, { status: 400 });
  }
}
