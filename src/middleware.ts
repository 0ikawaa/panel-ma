import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { AUTH_COOKIE, verifySessionToken } from "@/lib/auth";

// Rutas públicas (no requieren sesión)
const PUBLIC_PATHS = ["/login", "/api/login"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isPublic = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );

  const token = req.cookies.get(AUTH_COOKIE)?.value;
  const session = await verifySessionToken(token);

  // Si ya está logueado y va al login -> mándalo al panel
  if (session && pathname === "/login") {
    return NextResponse.redirect(new URL("/arribos", req.url));
  }

  if (isPublic) return NextResponse.next();

  if (!session) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    const url = new URL("/login", req.url);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Protege todo excepto assets estáticos e imágenes internas de Next
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
