/**
 * Fechas de calendario (sin hora): la ETA de un embarque es "llega el 30 de
 * julio", no un instante. Se guardan como medianoche UTC, así que hay que
 * leerlas y escribirlas en UTC: formatearlas en la zona local (Uruguay, UTC-3)
 * las corre un día para atrás.
 *
 * Para instantes de verdad (receivedAt, createdAt) va `fmtDate`/`fmtDateTime`
 * de `lib/format`, que sí se muestran en hora local.
 */

const LOCALE = "es-UY";

/** Uruguay es UTC-3 todo el año (no tiene horario de verano desde 2015). */
const UY_OFFSET_MS = 3 * 60 * 60 * 1000;

/**
 * "2026-07-30" (o un ISO completo) -> 2026-07-30T00:00:00Z.
 * null si no es una fecha válida.
 */
export function parseFecha(v: unknown): Date | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v.trim());
  if (!m) return null;
  const [, anio, mes, dia] = m;
  const d = new Date(Date.UTC(Number(anio), Number(mes) - 1, Number(dia)));
  // Date normaliza en silencio lo imposible ("2026-02-31" -> 3 de marzo).
  return d.getUTCMonth() === Number(mes) - 1 && d.getUTCDate() === Number(dia)
    ? d
    : null;
}

/** Valor para un `<input type="date">`: "YYYY-MM-DD" leído en UTC. */
export function toInputFecha(v: Date | string | null | undefined): string {
  const d = v == null ? null : parseFecha(v);
  return d ? d.toISOString().slice(0, 10) : "";
}

/** Fecha de calendario para mostrar, ej. "30 jul 2026". */
export function fmtFecha(v: Date | string | null | undefined): string {
  const d = v == null ? null : parseFecha(v);
  if (!d) return "—";
  return d.toLocaleDateString(LOCALE, {
    timeZone: "UTC",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/**
 * El día de calendario uruguayo de un instante, como medianoche UTC. Sirve para
 * comparar contra fechas de calendario (ETA) sin que la hora arrastre el día.
 */
export function hoyUy(ahora: Date = new Date()): Date {
  const d = new Date(ahora.getTime() - UY_OFFSET_MS);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
