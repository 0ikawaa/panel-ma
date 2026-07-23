import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { AUTH_COOKIE, verifySessionToken } from "@/lib/auth";
import { moduleForPath, firstAllowedPath } from "@/lib/modules";

// Rutas públicas (no requieren sesión)
const PUBLIC_PATHS = ["/login", "/api/login", "/api/blob/upload"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isPublic = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );

  const token = req.cookies.get(AUTH_COOKIE)?.value;
  const session = await verifySessionToken(token);

  // Si ya está logueado y va al login -> mándalo a su primer módulo
  // (si no tiene ninguno accesible, dejamos que vea el login para re-loguear)
  if (session && pathname === "/login") {
    const dest = firstAllowedPath(session.modules);
    if (dest !== "/login") {
      return NextResponse.redirect(new URL(dest, req.url));
    }
  }

  if (isPublic) return NextResponse.next();

  if (!session) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Control de acceso por módulo
  const mod = moduleForPath(pathname);
  if (mod && !session.isAdmin && !session.modules.includes(mod)) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
    }
    return NextResponse.redirect(new URL(firstAllowedPath(session.modules), req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
