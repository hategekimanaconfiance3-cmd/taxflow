import { NextRequest, NextResponse } from "next/server";

/**
 * Lightweight edge middleware — provides a first layer of route protection.
 *
 * Admin routes require an authenticated session cookie.
 * The actual role-level enforcement remains in each server component / action
 * (via requireRRASession / requireRRAPermission).
 *
 * We intentionally keep this middleware simple and stateless to avoid
 * database calls at the edge. The server-side guards are the authoritative check.
 */

const PROTECTED_ADMIN_PREFIX = "/admin";
const LOGIN_REDIRECT = "/admin-login";

/** Cookie names used by better-auth (checked statically — no DB call). */
const SESSION_COOKIE_NAMES = [
  "better-auth.session_token",
  "__Secure-better-auth.session_token",
];

function hasSessionCookie(request: NextRequest): boolean {
  return SESSION_COOKIE_NAMES.some(
    (name) => request.cookies.get(name) !== undefined,
  );
}

export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  // Protect all /admin/* routes (but not /admin-login itself)
  if (
    pathname.startsWith(PROTECTED_ADMIN_PREFIX) &&
    !pathname.startsWith(LOGIN_REDIRECT)
  ) {
    if (!hasSessionCookie(request)) {
      const loginUrl = new URL(LOGIN_REDIRECT, request.url);
      loginUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico, robots.txt, sitemap.xml
     * - Public assets
     * - API routes (they have their own auth checks)
     */
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|woff|woff2|ttf|eot)).*)",
  ],
};
