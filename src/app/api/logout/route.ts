import { NextResponse } from "next/server";
import { AUTH_COOKIE } from "@/lib/auth";

export async function POST(req: Request) {
  // 303 (See Other): el navegador sigue el redirect con GET a /login.
  // Con el 307 por defecto, reenviaría el POST a /login → HTTP 405.
  const res = NextResponse.redirect(new URL("/login", req.url), 303);
  res.cookies.set(AUTH_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
