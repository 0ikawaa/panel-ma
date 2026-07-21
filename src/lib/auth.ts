import { SignJWT, jwtVerify } from "jose";

export const AUTH_COOKIE = "ma_session";
const MAX_AGE = 60 * 60 * 24 * 7; // 7 días

function getSecretKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("Falta AUTH_SECRET en el .env");
  return new TextEncoder().encode(secret);
}

/** Verifica usuario y contraseña contra las variables de entorno. */
export function checkCredentials(user: string, password: string): boolean {
  const validUser = process.env.ADMIN_USER ?? "admin";
  const validPass = process.env.ADMIN_PASSWORD ?? "admin";
  return user === validUser && password === validPass;
}

/** Crea un token de sesión firmado. */
export async function createSessionToken(user: string): Promise<string> {
  return new SignJWT({ user })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(getSecretKey());
}

/** Verifica un token de sesión. Devuelve el payload o null. */
export async function verifySessionToken(
  token: string | undefined,
): Promise<{ user: string } | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    return { user: payload.user as string };
  } catch {
    return null;
  }
}

export const SESSION_MAX_AGE = MAX_AGE;
