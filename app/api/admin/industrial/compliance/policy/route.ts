import { NextResponse } from 'next/server';
import { configureIndustrialIntegrationPolicy } from '@/lib/actions/industrial.action';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<NextResponse> {
  try {
    return NextResponse.json({ policy: await configureIndustrialIntegrationPolicy(await request.json()) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Integration policy could not be saved.' }, { status: 400 });
  }
}
