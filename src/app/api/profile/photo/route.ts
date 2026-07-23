import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import {
  AUTH_COOKIE,
  SESSION_MAX_AGE,
  createSessionToken,
  verifySessionToken,
  type SessionData,
} from "@/lib/auth";

export const runtime = "nodejs";

async function requireSession(): Promise<SessionData | null> {
  const token = (await cookies()).get(AUTH_COOKIE)?.value;
  return verifySessionToken(token);
}

// Solo aceptamos URLs de Vercel Blob (las que emite nuestro propio /api/blob/upload).
function isBlobUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname.endsWith(".blob.vercel-storage.com");
  } catch {
    return false;
  }
}

function sessionCookie(res: NextResponse, token: string) {
  res.cookies.set(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

/** POST /api/profile/photo — guarda la foto del usuario logueado y refresca la sesión. */
export async function POST(req: Request) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { url?: unknown };
  const url = typeof body.url === "string" ? body.url.trim() : "";
  if (!isBlobUrl(url)) {
    return NextResponse.json({ error: "URL de imagen inválida" }, { status: 400 });
  }

  await prisma.profile.upsert({
    where: { username: session.user },
    update: { photoUrl: url },
    create: { username: session.user, photoUrl: url },
  });

  // Reescribimos el token para que la foto se vea al instante (sin re-login).
  const token = await createSessionToken({ ...session, photoUrl: url });
  const res = NextResponse.json({ ok: true, photoUrl: url });
  sessionCookie(res, token);
  return res;
}

/** DELETE /api/profile/photo — quita la foto y vuelve al avatar con inicial. */
export async function DELETE() {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  await prisma.profile
    .update({ where: { username: session.user }, data: { photoUrl: null } })
    .catch(() => {});

  const token = await createSessionToken({ ...session, photoUrl: undefined });
  const res = NextResponse.json({ ok: true });
  sessionCookie(res, token);
  return res;
}
