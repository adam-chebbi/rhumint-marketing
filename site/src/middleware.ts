import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifySessionToken } from "@/lib/auth";

const publicPaths = ["/login", "/api/auth/login", "/api/auth/logout"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (publicPaths.some((p) => pathname === p || pathname.startsWith("/_next/") || pathname === "/favicon.ico")) {
    return NextResponse.next();
  }

  const session = request.cookies.get("session")?.value;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!session || !adminPassword) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const valid = await verifySessionToken(session, adminPassword);
  if (!valid) {
    const res = NextResponse.redirect(new URL("/login", request.url));
    res.cookies.delete("session");
    return res;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
