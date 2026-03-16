import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

export default function proxy(request: NextRequest) {
    // Skip middleware for server actions (e.g. verifyRRAStaff called from admin-login)
    if (request.headers.get("Next-Action")) {
        return NextResponse.next();
    }

    const sessionCookie = getSessionCookie(request);
    const { pathname } = request.nextUrl;

    const isAuthPage = pathname.startsWith("/sign-in")
        || pathname.startsWith("/sign-up")
        || pathname.startsWith("/admin-login");

    // Redirect authenticated users away from auth pages
    if (sessionCookie && isAuthPage) {
        return NextResponse.redirect(new URL("/dashboard", request.url));
    }

    // Redirect unauthenticated users to sign-in (or admin-login for admin routes)
    if (!sessionCookie && !isAuthPage) {
        const redirectTo = pathname.startsWith("/admin")
            ? "/admin-login"
            : "/sign-in";
        return NextResponse.redirect(new URL(redirectTo, request.url));
    }

    return NextResponse.next();
}

export const config = {
    matcher: ["/", "/dashboard/:path*", "/admin/:path*", "/sign-in", "/sign-up", "/admin-login"],
};
