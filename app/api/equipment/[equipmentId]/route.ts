import { NextResponse } from 'next/server';
import { updateIndustrialEquipment } from '@/lib/actions/industrial.action';

export const runtime = 'nodejs';

export async function PATCH(request: Request, context: { params: Promise<{ equipmentId: string }> }): Promise<NextResponse> {
  try {
    const { equipmentId } = await context.params;
    const body: unknown = await request.json();
    const input = typeof body === 'object' && body !== null && !Array.isArray(body) ? { ...body, equipmentId } : { equipmentId };
    return NextResponse.json({ equipment: await updateIndustrialEquipment(input) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Equipment update failed.' }, { status: 400 });
  }
}
