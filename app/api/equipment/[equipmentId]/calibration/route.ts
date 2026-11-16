import { NextResponse } from 'next/server';
import { recordIndustrialCalibration } from '@/lib/actions/industrial.action';

export const runtime = 'nodejs';

export async function POST(request: Request, context: { params: Promise<{ equipmentId: string }> }): Promise<NextResponse> {
  try {
    const { equipmentId } = await context.params;
    const body: unknown = await request.json();
    const input = typeof body === 'object' && body !== null && !Array.isArray(body) ? { ...body, equipmentId } : { equipmentId };
    return NextResponse.json({ calibration: await recordIndustrialCalibration(input) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Calibration record failed.' }, { status: 400 });
  }
}
