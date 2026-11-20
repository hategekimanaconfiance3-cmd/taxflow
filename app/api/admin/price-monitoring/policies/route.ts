import { NextResponse } from 'next/server';
import { requireRRAPermission } from '@/lib/auth-guard';
import { listPriceMonitoringPolicies, upsertPriceMonitoringPolicy } from '@/lib/price-monitoring-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requireRRAPermission('price.policy.manage');
    return NextResponse.json({ policies: await listPriceMonitoringPolicies() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Policies could not be loaded.' }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const { user } = await requireRRAPermission('price.policy.manage');
    return NextResponse.json({ policy: await upsertPriceMonitoringPolicy(user.id, await request.json()) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Policy could not be saved.' }, { status: 400 });
  }
}
