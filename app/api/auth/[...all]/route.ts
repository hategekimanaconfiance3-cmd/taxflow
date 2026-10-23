import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { auth } = await import('@/lib/auth');
    const response = await auth.handler(req);
    // Capture and re-emit so we can see what better-auth actually returns
    const body = await response.text();
    const headers: Record<string, string> = {};
    response.headers.forEach((v, k) => { headers[k] = v; });
    return new NextResponse(body || null, {
      status: response.status,
      headers: {
        ...headers,
        'content-type': headers['content-type'] || 'application/json',
        'x-debug-ba-status': String(response.status),
      },
    });
  } catch (error) {
    console.error('[Auth GET Error]', error);
    return NextResponse.json(
      { error: 'Auth GET error', detail: String(error) },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const { auth } = await import('@/lib/auth');
    const response = await auth.handler(req);
    // Capture and re-emit so we can see what better-auth actually returns
    const body = await response.text();
    const headers: Record<string, string> = {};
    response.headers.forEach((v, k) => { headers[k] = v; });
    return new NextResponse(body || '{"note":"empty body from better-auth"}', {
      status: response.status,
      headers: {
        ...headers,
        'content-type': headers['content-type'] || 'application/json',
        'x-debug-ba-status': String(response.status),
        'x-debug-ba-body-len': String(body.length),
      },
    });
  } catch (error) {
    console.error('[Auth POST Error]', error);
    return NextResponse.json(
      { error: 'Auth POST error', detail: String(error) },
      { status: 500 },
    );
  }
}
