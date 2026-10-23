import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { auth } = await import('@/lib/auth');
    return await auth.handler(req);
  } catch (error) {
    console.error('[Auth GET Error]', error);
    return NextResponse.json(
      { error: 'Auth service unavailable', detail: String(error) },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const { auth } = await import('@/lib/auth');
    return await auth.handler(req);
  } catch (error) {
    console.error('[Auth POST Error]', error);
    return NextResponse.json(
      { error: 'Auth service unavailable', detail: String(error) },
      { status: 500 },
    );
  }
}
