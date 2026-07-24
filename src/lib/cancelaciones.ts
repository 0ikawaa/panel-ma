// Reporte "Cancelaciones de MercadoLibre".
//
// Métricas de cancelación de órdenes de ML agrupadas por semana o mes, con una
// comparación del último período cerrado contra el anterior. Pensado para
// sumarle los RECLAMOS reales cuando MUNDO SHOP habilite ese sync (la tabla
// ml_claims ya existe pero hoy está vacía).
//
// Módulo PURO (sin red/DB) → testeable. El compute con datos está en
// `cancelaciones.server.ts`.

import { monthKeyUY, addMonth, monthRange, mesLabel } from "./rotacion";

export const CANCELACIONES_KEY = "cancelaciones";

export type Granularidad = "semana" | "mes";

export const DEFAULT_N: Record<Granularidad, number> = { semana: 12, mes: 6 };

export type PeriodoDef = {
  key: string; // identificador ("2026-06" o "2026-06-15" para semanas)
  label: string; // legible ("junio 2026" o "15–21 jun")
  desde: string; // YYYY-MM-DD
  hasta: string; // YYYY-MM-DD
  parcial: boolean; // true = período en curso (incompleto)
};

export type DailyRow = {
  dia: string; // YYYY-MM-DD
  total: number;
  canceladas: number;
  noPagada: number;
  fraude: number;
};

export type CancelPeriodo = {
  key: string;
  label: string;
  parcial: boolean;
  totalOrdenes: number;
  canceladas: number;
  noPagada: number;
  fraude: number;
  otras: number;
  tasa: number; // canceladas / totalOrdenes (0..1)
};

export type Comparacion = {
  actual: CancelPeriodo | null; // último período CERRADO
  anterior: CancelPeriodo | null; // el anterior a ese
  deltaCanceladas: number | null; // actual − anterior
  deltaPct: number | null; // variación relativa de canceladas
  deltaTasa: number | null; // actual.tasa − anterior.tasa (puntos)
};

export type CancelacionesReport = {
  key: typeof CANCELACIONES_KEY;
  generadoEn: string;
  granularidad: Granularidad;
  series: CancelPeriodo[]; // ascendente (viejo → nuevo)
  comparacion: Comparacion;
  totales: { totalOrdenes: number; canceladas: number; noPagada: number; fraude: number; tasa: number };
};

const DAY_MS = 24 * 60 * 60 * 1000;

function isoUTC(d: Date): string {
  return d.toISOString().slice(0, 10);
}
/** Lunes (00:00 UTC) de la semana que contiene a `d`, en calendario de Uruguay. */
function mondayOfUY(d: Date): Date {
  const s = new Date(d.getTime() - 3 * 60 * 60 * 1000); // desplazar a UY
  const off = (s.getUTCDay() + 6) % 7; // 0 = lunes … 6 = domingo
  return new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate() - off));
}
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
function weekLabel(mon: Date, sun: Date): string {
  const dM = mon.getUTCDate();
  const dS = sun.getUTCDate();
  const mesM = MESES_CORTOS[mon.getUTCMonth()];
  const mesS = MESES_CORTOS[sun.getUTCMonth()];
  return mesM === mesS ? `${dM}–${dS} ${mesS}` : `${dM} ${mesM}–${dS} ${mesS}`;
}

/** Construye los últimos `n` períodos (ascendente), incluido el en curso. */
export function buildPeriodos(gran: Granularidad, now: Date, n: number): PeriodoDef[] {
  const out: PeriodoDef[] = [];
  if (gran === "mes") {
    const cur = monthKeyUY(now);
    for (let i = n - 1; i >= 0; i--) {
      const mk = addMonth(cur, -i);
      const { desde, hasta } = monthRange(mk);
      out.push({ key: mk, label: mesLabel(mk), desde, hasta, parcial: i === 0 });
    }
  } else {
    const mon0 = mondayOfUY(now);
    for (let i = n - 1; i >= 0; i--) {
      const mon = new Date(mon0.getTime() - i * 7 * DAY_MS);
      const sun = new Date(mon.getTime() + 6 * DAY_MS);
      out.push({ key: isoUTC(mon), label: weekLabel(mon, sun), desde: isoUTC(mon), hasta: isoUTC(sun), parcial: i === 0 });
    }
  }
  return out;
}

/** Reparte las filas diarias en los períodos y calcula las métricas de cada uno. */
export function bucketByPeriodo(daily: DailyRow[], periodos: PeriodoDef[]): CancelPeriodo[] {
  return periodos.map((p) => {
    let totalOrdenes = 0,
      canceladas = 0,
      noPagada = 0,
      fraude = 0;
    for (const r of daily) {
      if (r.dia >= p.desde && r.dia <= p.hasta) {
        totalOrdenes += r.total;
        canceladas += r.canceladas;
        noPagada += r.noPagada;
        fraude += r.fraude;
      }
    }
    const otras = Math.max(0, canceladas - noPagada - fraude);
    return {
      key: p.key,
      label: p.label,
      parcial: p.parcial,
      totalOrdenes,
      canceladas,
      noPagada,
      fraude,
      otras,
      tasa: totalOrdenes > 0 ? canceladas / totalOrdenes : 0,
    };
  });
}

/** Compara el último período CERRADO contra el anterior. */
export function buildComparacion(series: CancelPeriodo[]): Comparacion {
  const cerrados = series.filter((s) => !s.parcial);
  const actual = cerrados[cerrados.length - 1] ?? null;
  const anterior = cerrados[cerrados.length - 2] ?? null;
  let deltaCanceladas: number | null = null;
  let deltaPct: number | null = null;
  let deltaTasa: number | null = null;
  if (actual && anterior) {
    deltaCanceladas = actual.canceladas - anterior.canceladas;
    deltaPct = anterior.canceladas > 0 ? deltaCanceladas / anterior.canceladas : null;
    deltaTasa = actual.tasa - anterior.tasa;
  }
  return { actual, anterior, deltaCanceladas, deltaPct, deltaTasa };
}

/** Totales sobre todos los períodos mostrados. */
export function totalizar(series: CancelPeriodo[]) {
  let totalOrdenes = 0,
    canceladas = 0,
    noPagada = 0,
    fraude = 0;
  for (const s of series) {
    totalOrdenes += s.totalOrdenes;
    canceladas += s.canceladas;
    noPagada += s.noPagada;
    fraude += s.fraude;
  }
  return { totalOrdenes, canceladas, noPagada, fraude, tasa: totalOrdenes > 0 ? canceladas / totalOrdenes : 0 };
}
