import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { ALL_MODULES } from "@/lib/modules";
import type { SessionData } from "@/lib/auth";

/**
 * Verifica credenciales contra el superadmin (variables de entorno) y contra
 * los usuarios de la base. Devuelve los datos de sesión o null.
 */
export async function authenticate(
  username: string,
  password: string,
): Promise<SessionData | null> {
  const envUser = process.env.ADMIN_USER;
  const envPass = process.env.ADMIN_PASSWORD;

  // Sin credenciales configuradas no hay superadmin. Antes esto caía a
  // "admin"/"admin": si alguna vez se deployaba sin cargar las variables, el
  // panel entero quedaba abierto con la contraseña más adivinable que existe.
  // Es preferible que el superadmin no entre a que entre cualquiera.
  if (envUser && envPass && username === envUser && password === envPass) {
    return {
      user: username,
      name: "Matias",
      modules: [...ALL_MODULES],
      isAdmin: true,
      photoUrl: await photoOf(username),
    };
  }

  const u = await prisma.user.findUnique({ where: { username } });
  if (!u) return null;
  const ok = await bcrypt.compare(password, u.passwordHash);
  if (!ok) return null;

  // Registrar el último acceso exitoso.
  await prisma.user
    .update({ where: { id: u.id }, data: { lastLoginAt: new Date() } })
    .catch(() => {});

  return {
    user: u.username,
    name: u.name ?? undefined,
    modules: u.modules,
    isAdmin: false,
    photoUrl: await photoOf(u.username),
  };
}

/** Foto de perfil guardada para un usuario (o undefined si no tiene). */
async function photoOf(username: string): Promise<string | undefined> {
  const p = await prisma.profile
    .findUnique({ where: { username }, select: { photoUrl: true } })
    .catch(() => null);
  return p?.photoUrl ?? undefined;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}
