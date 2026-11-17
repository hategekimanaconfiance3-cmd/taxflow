import { NextResponse } from 'next/server';
import { getIndustrialIntegrationRequestsForOfficer } from '@/lib/actions/industrial.action';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  try {
    return NextResponse.json({ requests: await getIndustrialIntegrationRequestsForOfficer() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Integration requests could not be loaded.' }, { status: 401 });
  }
}
