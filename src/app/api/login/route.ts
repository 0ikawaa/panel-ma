import { NextResponse } from "next/server";
import { AUTH_COOKIE, createSessionToken, SESSION_MAX_AGE } from "@/lib/auth";
import { authenticate } from "@/lib/users";
import { firstAllowedPath } from "@/lib/modules";
import { prisma } from "@/lib/prisma";
import {
  INTENTOS_LIBRES_IP,
  clavesDeIntento,
  estaBloqueado,
  ipDeRequest,
  registrarFallo,
  segundosRestantes,
  type IntentoFallido,
} from "@/lib/loginThrottle";

export const runtime = "nodejs";

/** Lee el estado de las dos claves de una sola consulta. */
async function leerIntentos(keys: string[]): Promise<Map<string, IntentoFallido>> {
  const filas = await prisma.loginAttempt.findMany({ where: { key: { in: keys } } });
  return new Map(filas.map((f) => [f.key, f]));
}

/** Guarda el contador actualizado de una clave. */
async function guardarFallo(key: string, estado: IntentoFallido): Promise<void> {
  await prisma.loginAttempt.upsert({
    where: { key },
    create: { key, ...estado },
    update: estado,
  });
}

export async function POST(req: Request) {
  let body: { user?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });
  }

  const user = (body.user ?? "").trim();
  const password = body.password ?? "";

  const ahora = new Date();
  const keys = clavesDeIntento(user, ipDeRequest(req.headers));

  // Si la base no contesta, el login sigue funcionando sin freno: preferimos que
  // la gente pueda entrar a que un problema de red deje a todos afuera.
  let previos = new Map<string, IntentoFallido>();
  try {
    previos = await leerIntentos([keys.usuario, keys.ip]);
  } catch {
    /* sin freno */
  }

  const bloqueado = [keys.usuario, keys.ip]
    .map((k) => previos.get(k) ?? null)
    .find((e) => estaBloqueado(e, ahora));

  if (bloqueado) {
    const seg = segundosRestantes(bloqueado, ahora);
    const min = Math.ceil(seg / 60);
    return NextResponse.json(
      {
        error: `Demasiados intentos fallidos. Probá de nuevo en ${
          min <= 1 ? "un minuto" : `${min} minutos`
        }.`,
      },
      { status: 429, headers: { "Retry-After": String(seg) } },
    );
  }

  const session = await authenticate(user, password);

  if (!session) {
    try {
      await Promise.all([
        guardarFallo(keys.usuario, registrarFallo(previos.get(keys.usuario) ?? null, ahora)),
        guardarFallo(
          keys.ip,
          registrarFallo(previos.get(keys.ip) ?? null, ahora, INTENTOS_LIBRES_IP),
        ),
      ]);
    } catch {
      /* que no se pueda anotar el fallo no cambia la respuesta */
    }
    return NextResponse.json(
      { error: "Usuario o contraseña incorrectos" },
      { status: 401 },
    );
  }

  // Login bueno: se limpian los contadores de esta persona (la clave por IP
  // también, porque quien acaba de entrar bien no es quien estaba probando).
  try {
    await prisma.loginAttempt.deleteMany({ where: { key: { in: [keys.usuario, keys.ip] } } });
  } catch {
    /* best-effort */
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
