import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const results: Record<string, unknown> = {
    time: new Date().toISOString(),
    env: {
      hasDbUrl: !!process.env.DATABASE_URL,
      hasAuthUrl: !!process.env.BETTER_AUTH_URL,
      hasSecret: !!process.env.BETTER_AUTH_SECRET,
      nodeEnv: process.env.NODE_ENV,
    },
  };

  // Step 1: try importing db
  try {
    await import('@/db/drizzle');
    results.dbImport = 'ok';
  } catch (e) {
    results.dbImport = 'ERROR: ' + String(e);
  }

  // Step 2: try importing schema
  try {
    await import('@/db/schema');
    results.schemaImport = 'ok';
  } catch (e) {
    results.schemaImport = 'ERROR: ' + String(e);
  }

  // Step 3: try importing auth
  try {
    const mod = await import('@/lib/auth');
    results.authImport = 'ok';
    results.authKeys = Object.keys(mod);
  } catch (e) {
    results.authImport = 'ERROR: ' + String(e);
    results.authStack = e instanceof Error ? e.stack?.slice(0, 2000) : undefined;
  }

  return NextResponse.json(results);
}
