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
  const envUser = process.env.ADMIN_USER ?? "admin";
  const envPass = process.env.ADMIN_PASSWORD ?? "admin";

  if (username === envUser && password === envPass) {
    return {
      user: username,
      name: "Matias",
      modules: [...ALL_MODULES],
      isAdmin: true,
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
  };
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}
