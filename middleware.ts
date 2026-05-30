import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, isValidAuthCookie } from "@/lib/auth";

export async function middleware(req: NextRequest) {
  const cookie = req.cookies.get(AUTH_COOKIE_NAME)?.value;
  const ok = await isValidAuthCookie(cookie);
  if (ok) return NextResponse.next();

  const url = new URL("/login", req.url);
  if (req.nextUrl.pathname !== "/") {
    url.searchParams.set("next", req.nextUrl.pathname + req.nextUrl.search);
  }
  return NextResponse.redirect(url);
}

// Run this middleware on every request EXCEPT:
//   /login           — the login page itself
//   /display/*       — the TV display URLs (intentionally public)
//   /api/login       — submit login
//   /api/logout      — clear cookie
//   /_next/*         — Next.js internals (JS bundles, etc.)
//   /favicon.ico, /robots.txt — static
export const config = {
  matcher: [
    "/((?!login|display|api/login|api/logout|_next|favicon.ico|robots.txt).*)"
  ]
};
