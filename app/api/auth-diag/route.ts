import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const results: Record<string, unknown> = {
    time: new Date().toISOString(),
    env: {
      hasDbUrl: !!process.env.DATABASE_URL,
      hasAuthUrl: !!process.env.BETTER_AUTH_URL,
      hasSecret: !!process.env.BETTER_AUTH_SECRET,
      nodeEnv: process.env.NODE_ENV,
    },
  };

  // Step 1: import db and auth
  let db: import('@/db/drizzle').default;
  let auth: import('@/lib/auth').auth;

  try {
    db = (await import('@/db/drizzle')).default;
    results.dbImport = 'ok';
  } catch (e) {
    results.dbImport = 'ERROR: ' + String(e);
    return NextResponse.json(results);
  }

  try {
    auth = (await import('@/lib/auth')).auth;
    results.authImport = 'ok';
  } catch (e) {
    results.authImport = 'ERROR: ' + String(e);
    return NextResponse.json(results);
  }

  // Step 2: direct DB queries
  try {
    const { user, account } = await import('@/db/schema');
    const users = await db.select({
      id: user.id,
      username: user.username,
      email: user.email,
      isActive: user.isActive,
      emailVerified: user.emailVerified,
      role: user.role,
    }).from(user).where(eq(user.username, 'sa-001')).limit(1);

    results.userQuery = users.length > 0 ? 'found' : 'NOT FOUND - user sa-001 does not exist!';
    if (users.length > 0) {
      results.userData = users[0];

      // Look up account
      const accounts = await db.select({
        id: account.id,
        providerId: account.providerId,
        hasPassword: eq(account.password, null),
        passwordLen: account.password,
      }).from(account).where(eq(account.userId, users[0].id)).limit(5);

      results.accountQuery = accounts.length > 0 ? `found ${accounts.length} accounts` : 'NO ACCOUNTS FOUND';
      results.accounts = accounts.map(a => ({
        providerId: a.providerId,
        passwordLen: typeof a.passwordLen === 'string' ? a.passwordLen.length : null,
        passwordPrefix: typeof a.passwordLen === 'string' ? a.passwordLen.slice(0, 20) : null,
      }));
    }
  } catch (e) {
    results.dbQueryError = 'ERROR: ' + String(e);
  }

  // Step 3: try auth.api.signInUsername directly (programmatic API)
  try {
    const result = await (auth as any).api.signInUsername({
      body: { username: 'sa-001', password: 'Conf123%' },
      headers: req.headers,
    });
    results.signInDirect = 'SUCCESS';
    results.signInResultKeys = Object.keys(result || {});
  } catch (e) {
    results.signInDirect = 'ERROR: ' + String(e);
    results.signInStack = e instanceof Error ? e.stack?.slice(0, 3000) : undefined;
  }

  return NextResponse.json(results);
}
