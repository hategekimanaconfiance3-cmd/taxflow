import { NextRequest, NextResponse } from 'next/server';
import { getSessionCookie } from 'better-auth/cookies';

export default function proxy(request: NextRequest) {
  // Skip middleware for server actions
  if (request.headers.get('Next-Action')) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;

  const sessionCookie = getSessionCookie(request);

  const isAuthPage =
    pathname.startsWith('/sign-in') || pathname.startsWith('/sign-up') || pathname.startsWith('/admin-login');

  const isAuthenticated = !!sessionCookie;

  // Redirect authenticated users away from auth pages
  // Exception: always allow /admin-login — admins signing out may still
  // carry the session cookie until the browser processes the Set-Cookie header
  if (isAuthenticated && isAuthPage) {
    if (pathname.startsWith('/admin-login')) {
      return NextResponse.next();
    }
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  // Redirect unauthenticated users, preserving the original path as callbackUrl
  if (!isAuthenticated && !isAuthPage) {
    const redirectTo = pathname.startsWith('/admin') ? '/admin-login' : '/sign-in';
    const redirectUrl = new URL(redirectTo, request.url);
    redirectUrl.searchParams.set('callbackUrl', pathname);

    return NextResponse.redirect(redirectUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/dashboard/:path*', '/admin/:path*', '/sign-in', '/sign-up', '/admin-login'],
};