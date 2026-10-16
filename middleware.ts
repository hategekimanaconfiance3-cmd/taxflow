import { NextRequest, NextResponse } from "next/server";

/**
 * Edge middleware — protects dashboard and admin routes.
 *
 * Strategy: check for the better-auth session cookie.
 * Full JWT/DB validation is done inside each route/action via requireTraderSession
 * or requireRRASession — middleware only blocks obviously unauthenticated requests
 * at the edge, which eliminates the blank-page flash on direct URL access.
 *
 * Cookie names used by better-auth (default):
 *   better-auth.session_token   — standard
 *   __Secure-better-auth.session_token — when served over HTTPS
 */

const SESSION_COOKIE = "better-auth.session_token";
const SECURE_SESSION_COOKIE = "__Secure-better-auth.session_token";

const PUBLIC_PATHS = [
  "/sign-in",
  "/sign-up",
  "/admin-login",
  "/forgot-password",
  "/reset-password",
  "/api/auth",        // better-auth API routes
  "/_next",
  "/favicon.ico",
  "/public",
];

function hasSessionCookie(req: NextRequest): boolean {
  return (
    req.cookies.has(SESSION_COOKIE) ||
    req.cookies.has(SECURE_SESSION_COOKIE)
  );
}

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p));
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow public paths through unconditionally
  if (isPublic(pathname)) {
    return NextResponse.next();
  }

  // Protected: /dashboard/** and /admin/**
  const isProtected =
    pathname.startsWith("/dashboard") || pathname.startsWith("/admin");

  if (isProtected && !hasSessionCookie(req)) {
    const loginUrl = pathname.startsWith("/admin")
      ? new URL("/admin-login", req.url)
      : new URL("/sign-in", req.url);

    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT static files, images, and Next.js internals.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};