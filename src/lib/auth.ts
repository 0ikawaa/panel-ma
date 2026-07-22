import { SignJWT, jwtVerify } from "jose";

export const AUTH_COOKIE = "ma_session";
const MAX_AGE = 60 * 60 * 24 * 7; // 7 días

export interface SessionData {
  user: string;
  name?: string;
  modules: string[];
  isAdmin: boolean; // superadmin (acceso total)
}

function getSecretKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("Falta AUTH_SECRET en el .env");
  return new TextEncoder().encode(secret);
}

/** Crea un token de sesión firmado con los datos del usuario. */
export async function createSessionToken(data: SessionData): Promise<string> {
  return new SignJWT({
    user: data.user,
    name: data.name ?? null,
    modules: data.modules,
    isAdmin: data.isAdmin,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(getSecretKey());
}

/** Verifica un token de sesión. Devuelve los datos o null. */
export async function verifySessionToken(
  token: string | undefined,
): Promise<SessionData | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    return {
      user: payload.user as string,
      name: (payload.name as string | null) ?? undefined,
      modules: (payload.modules as string[] | undefined) ?? [],
      isAdmin: !!payload.isAdmin,
    };
  } catch {
    return null;
  }
}

export const SESSION_MAX_AGE = MAX_AGE;
