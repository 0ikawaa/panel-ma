import { NextResponse } from "next/server";
import {
  AUTH_COOKIE,
  checkCredentials,
  createSessionToken,
  SESSION_MAX_AGE,
} from "@/lib/auth";

export async function POST(req: Request) {
  let body: { user?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });
  }

  const user = (body.user ?? "").trim();
  const password = body.password ?? "";

  if (!checkCredentials(user, password)) {
    return NextResponse.json(
      { error: "Usuario o contraseña incorrectos" },
      { status: 401 },
    );
  }

  const token = await createSessionToken(user);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}
