import { NextResponse } from "next/server";
import { AUTH_COOKIE, createSessionToken, SESSION_MAX_AGE } from "@/lib/auth";
import { authenticate } from "@/lib/users";
import { firstAllowedPath } from "@/lib/modules";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: { user?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });
  }

  const user = (body.user ?? "").trim();
  const password = body.password ?? "";

  const session = await authenticate(user, password);
  if (!session) {
    return NextResponse.json(
      { error: "Usuario o contraseña incorrectos" },
      { status: 401 },
    );
  }

  const token = await createSessionToken(session);
  // Destino tras loguear: Dashboard primero (es el primero en MODULES); si el
  // usuario no tiene ese módulo, firstAllowedPath cae al siguiente que sí tenga.
  const redirect = session.isAdmin ? "/dashboard" : firstAllowedPath(session.modules);
  const res = NextResponse.json({ ok: true, redirect });
  res.cookies.set(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}
