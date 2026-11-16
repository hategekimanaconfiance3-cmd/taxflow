import { NextResponse } from 'next/server';
import { getMyFactories, registerFactory } from '@/lib/actions/factory.action';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function safeError(error: unknown): string {
  return error instanceof Error ? error.message : 'Factory operation could not be completed.';
}

export async function GET(): Promise<NextResponse> {
  try {
    return NextResponse.json({ factories: await getMyFactories() });
  } catch (error) {
    return NextResponse.json({ error: safeError(error) }, { status: 401 });
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body: unknown = await request.json();
    return NextResponse.json({ factory: await registerFactory(body) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: safeError(error) }, { status: 400 });
  }
}
