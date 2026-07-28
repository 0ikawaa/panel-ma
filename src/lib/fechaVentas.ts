// Fechas de las pantallas de ventas (Órdenes ML, Resumen, Rentabilidad,
// Reposición, Dashboard).
//
// Son dos cosas distintas que antes estaban copiadas en cada componente:
//
//  1. Los valores por defecto de los `<input type="date">` de los filtros, que
//     tienen que salir en el día local de quien mira la pantalla.
//  2. El formato de los timestamps que devuelve MercadoLibre.
//
// No se mezcla con `lib/fecha.ts`: ese archivo es para fechas de calendario de
// los embarques (la ETA, que se guarda como medianoche UTC). Acá se trabaja con
// instantes y con el día local del navegador.

/** "YYYY-MM-DD" de un instante leído en la zona local del navegador. */
function aInputLocal(d: Date): string {
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

/** Hoy, para el valor por defecto de un `<input type="date">`. */
export function hoyInput(ahora: Date = new Date()): string {
  return aInputLocal(ahora);
}

/** El primero del mes en curso, para el "desde" de los filtros mensuales. */
export function primeroDelMesInput(ahora: Date = new Date()): string {
  return aInputLocal(new Date(ahora.getFullYear(), ahora.getMonth(), 1));
}

/**
 * El mismo día, `n` meses atrás. Si el mes destino no tiene ese día, Date lo
 * corre al mes siguiente (31 de marzo menos 1 mes = 3 de marzo); para los
 * filtros de "últimos N meses" eso no molesta.
 */
export function mesesAtrasInput(n: number, ahora: Date = new Date()): string {
  const d = new Date(ahora.getTime());
  d.setMonth(d.getMonth() - n);
  return aInputLocal(d);
}

// Los timestamps de ML vienen con offset -04:00. El DÍA se muestra tal cual lo
// manda ML (mismo criterio que el filtro por fecha, igual que el sistema de
// referencia). La HORA se convierte a zona Uruguay (America/Montevideo, -03:00),
// que es la hora real local (ej. 08:56 -04:00 → 09:56 Uruguay).
const TZ = "America/Montevideo";
const LOCALE = "es-UY";

/** Día y mes de un timestamp de ML, ej. "28/7". */
export function fmtDiaCortoMl(iso: string): string {
  if (!iso || iso.length < 10) return "";
  return `${+iso.slice(8, 10)}/${+iso.slice(5, 7)}`;
}

/** Hora uruguaya de un timestamp de ML, ej. "09:56 a. m.". */
export function fmtHoraMl(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString(LOCALE, {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

/** Fecha y hora completas de un timestamp de ML, ej. "28/7/2026, 09:56:03 a. m.". */
export function fmtFechaLargaMl(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const dia = `${+iso.slice(8, 10)}/${+iso.slice(5, 7)}/${iso.slice(0, 4)}`;
  const hora = d.toLocaleTimeString(LOCALE, {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  return `${dia}, ${hora}`;
}
