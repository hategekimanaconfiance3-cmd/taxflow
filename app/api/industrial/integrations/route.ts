import { NextResponse } from 'next/server';
import { getMyIndustrialIntegrations } from '@/lib/actions/industrial.action';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  try {
    return NextResponse.json({ integrations: await getMyIndustrialIntegrations() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Integrations could not be loaded.' }, { status: 401 });
  }
}
