import { NextRequest, NextResponse } from "next/server";

/**
 * Lightweight edge middleware — first layer of route protection for admin routes.
 *
 * Checks for a session cookie before allowing access to /admin/* routes.
 * This is a fast, stateless check — the authoritative role-level enforcement
 * remains in each server component / action via requireRRASession().
 *
 * We intentionally avoid database calls here to keep the middleware fast.
 */

const PROTECTED_ADMIN_PREFIX = "/admin";
const LOGIN_PAGE = "/admin-login";

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

  // Protect all /admin/* routes but not /admin-login itself
  if (
    pathname.startsWith(PROTECTED_ADMIN_PREFIX) &&
    !pathname.startsWith(LOGIN_PAGE)
  ) {
    if (!hasSessionCookie(request)) {
      const loginUrl = new URL(LOGIN_PAGE, request.url);
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
     * - _next/static (Next.js static assets)
     * - _next/image (image optimization)
     * - favicon, robots, sitemap
     * - Static file extensions
     * - API routes (they have their own auth checks)
     */
    "/((?!_next/static|_next/image|favicon\\.ico|robots\\.txt|sitemap\\.xml|api/|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|woff|woff2|ttf|eot)).*)",
  ],
};
