import { NextResponse } from 'next/server';
import { getMyIndustrialEquipment, registerIndustrialEquipment } from '@/lib/actions/industrial.action';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  try {
    return NextResponse.json({ equipment: await getMyIndustrialEquipment() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Equipment could not be loaded.' }, { status: 401 });
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    return NextResponse.json({ equipment: await registerIndustrialEquipment(await request.json()) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Equipment registration failed.' }, { status: 400 });
  }
}
