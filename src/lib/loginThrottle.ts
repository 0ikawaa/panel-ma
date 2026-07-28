// Freno a la fuerza bruta contra el login.
//
// Vive aparte de la route (y de Prisma) para poder testear la matemática del
// bloqueo sola: acá no se toca la base, sólo se decide qué hacer con un contador
// de intentos fallidos.
//
// La idea es que un humano que se equivoca de contraseña no note nada y que un
// script que prueba miles quede parado enseguida. Por eso los primeros intentos
// son libres y el bloqueo crece a los saltos.

/** Estado guardado de una clave (una fila de `LoginAttempt`). */
export interface IntentoFallido {
  fails: number;
  lastFailAt: Date;
  lockedUntil: Date | null;
}

/** Intentos que no cuestan nada: por debajo de esto nunca se bloquea. */
export const INTENTOS_LIBRES = 5;

/**
 * Si no hubo fallos en este tiempo, el contador arranca de cero. Sin esto, un
 * usuario que se equivoca una vez por mes terminaría bloqueado por acumulación.
 */
export const VENTANA_OLVIDO_MS = 60 * 60 * 1000; // 1 hora

/** Cuánto dura el bloqueo según cuántos fallos lleva la clave (en minutos). */
const ESCALERA_MIN = [1, 2, 5, 15, 30];

/**
 * La clave por IP aguanta más intentos antes de bloquear: se le suman los
 * intentos libres de varias personas compartiendo la salida a internet.
 */
export const INTENTOS_LIBRES_IP = 15;

/**
 * Duración del bloqueo tras `fails` intentos fallidos. Los primeros `libres` no
 * bloquean; de ahí en más sube 1 → 2 → 5 → 15 → 30 minutos y se queda en 30
 * (bloquear para siempre convierte el freno en un botón de "dejar afuera al
 * dueño de casa").
 */
export function bloqueoMs(fails: number, libres: number = INTENTOS_LIBRES): number {
  const pasos = fails - libres;
  if (pasos <= 0) return 0;
  const min = ESCALERA_MIN[Math.min(pasos, ESCALERA_MIN.length) - 1];
  return min * 60 * 1000;
}

/** ¿La clave está bloqueada en este momento? */
export function estaBloqueado(estado: IntentoFallido | null, ahora: Date): boolean {
  return !!estado?.lockedUntil && estado.lockedUntil.getTime() > ahora.getTime();
}

/** Segundos que faltan para poder reintentar (0 si no está bloqueado). */
export function segundosRestantes(estado: IntentoFallido | null, ahora: Date): number {
  if (!estaBloqueado(estado, ahora)) return 0;
  const ms = estado!.lockedUntil!.getTime() - ahora.getTime();
  return Math.max(1, Math.ceil(ms / 1000));
}

/**
 * Estado nuevo después de un intento fallido. Si el último fallo quedó fuera de
 * la ventana de olvido, el contador vuelve a empezar.
 */
export function registrarFallo(
  estado: IntentoFallido | null,
  ahora: Date,
  libres: number = INTENTOS_LIBRES,
): IntentoFallido {
  const vencido =
    !estado || ahora.getTime() - estado.lastFailAt.getTime() > VENTANA_OLVIDO_MS;
  const fails = vencido ? 1 : estado.fails + 1;
  const espera = bloqueoMs(fails, libres);
  return {
    fails,
    lastFailAt: ahora,
    lockedUntil: espera > 0 ? new Date(ahora.getTime() + espera) : null,
  };
}

/**
 * Claves con las que se cuenta un intento. Se miran las dos:
 *
 * - `u:<usuario>|<ip>` — quien insiste con un usuario desde un lugar. Va con la
 *   IP adentro para que un atacante no pueda dejar afuera a una persona real
 *   simplemente fallándole el login a propósito desde otro lado.
 * - `ip:<ip>` — quien prueba usuarios distintos desde el mismo lugar. Es más
 *   permisiva porque una oficina entera comparte una sola IP.
 */
export function clavesDeIntento(usuario: string, ip: string): { usuario: string; ip: string } {
  const u = usuario.trim().toLowerCase() || "(vacio)";
  const dir = ip.trim() || "(sin-ip)";
  return { usuario: `u:${u}|${dir}`, ip: `ip:${dir}` };
}

/**
 * IP del cliente detrás del proxy de Vercel. `x-forwarded-for` puede traer
 * varias separadas por coma; la primera es la del visitante.
 */
export function ipDeRequest(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return headers.get("x-real-ip")?.trim() || "";
}
