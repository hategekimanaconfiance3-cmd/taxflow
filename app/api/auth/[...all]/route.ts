import { NextRequest, NextResponse } from 'next/server';

// Use dynamic import so any module-level crash in auth is caught by our try/catch
async function getHandler() {
  const { auth } = await import('@/lib/auth');
  const { toNextJsHandler } = await import('better-auth/next-js');
  return toNextJsHandler(auth);
}

export async function GET(req: NextRequest) {
  try {
    const handler = await getHandler();
    return await handler.GET(req);
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
    const handler = await getHandler();
    return await handler.POST(req);
  } catch (error) {
    console.error('[Auth POST Error]', error);
    return NextResponse.json(
      { error: 'Auth service unavailable', detail: String(error) },
      { status: 500 },
    );
  }
}
