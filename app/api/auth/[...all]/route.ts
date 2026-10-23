import { auth } from '@/lib/auth';
import { toNextJsHandler } from 'better-auth/next-js';
import { NextRequest } from 'next/server';

// Wrap with error logging so we can see the actual crash reason
const handler = toNextJsHandler(auth);

export async function GET(req: NextRequest, ctx: { params: Promise<{ all: string[] }> }) {
  try {
    return await handler.GET(req, ctx);
  } catch (error) {
    console.error('[Auth API GET Error]', error);
    return new Response(
      JSON.stringify({ error: 'Auth service error', detail: String(error) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ all: string[] }> }) {
  try {
    return await handler.POST(req, ctx);
  } catch (error) {
    console.error('[Auth API POST Error]', error);
    return new Response(
      JSON.stringify({ error: 'Auth service error', detail: String(error) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
}
