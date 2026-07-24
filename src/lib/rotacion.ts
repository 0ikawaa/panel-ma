// Reporte "Publicaciones sin rotación".
//
// Agrupa las ventas por CÓDIGO PADRE (base, sin variante) y compara la venta de
// la ventana reciente contra el mes pasado y contra el mismo período del año
// pasado. Marca los productos que se venden menos (caída significativa) e infiere
// el motivo probable a partir del stock (agotado vs. con stock que no rota).
//
// Módulo PURO (sin red/DB) → testeable. El compute con datos vive en
// `reportes.server.ts`.

export const SIN_ROTACION_KEY = "sin-rotacion";

export type RotacionParams = {
  minUnidadesRef: number; // mínimo que vendía antes para tenerlo en cuenta
  caidaMin: number; // caída mínima (0..1) para marcarlo (ej. 0,5 = 50%)
};

export const ROTACION_DEFAULTS: RotacionParams = {
  minUnidadesRef: 5,
  caidaMin: 0.5,
};

export function normalizeRotacionParams(p?: Partial<RotacionParams> | null): RotacionParams {
  const src = p ?? {};
  const pos = (v: unknown, def: number, min = 0) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= min ? n : def;
  };
  const caidaRaw = Number(src.caidaMin);
  return {
    minUnidadesRef: pos(src.minUnidadesRef, ROTACION_DEFAULTS.minUnidadesRef),
    // caidaMin: si es un número, se recorta a [0, 1]; si no, cae al default.
    caidaMin: Number.isFinite(caidaRaw)
      ? Math.min(1, Math.max(0, caidaRaw))
      : ROTACION_DEFAULTS.caidaMin,
  };
}

// Motivo probable de la caída (inferido del stock).
export type Motivo = "sin-stock" | "sin-stock-en-camino" | "con-stock";

export function motivoLabel(m: Motivo): string {
  switch (m) {
    case "sin-stock":
      return "Sin stock (agotado)";
    case "sin-stock-en-camino":
      return "Sin stock (viene en camino)";
    case "con-stock":
      return "Con stock — no rota";
  }
}

// Entrada por código padre (agnóstica del origen de los datos → testeable).
export type RotacionInput = {
  codigo: string; // código padre / base
  titulo: string | null;
  ventaActual: number; // unidades en la ventana reciente
  ventaMesPasado: number; // unidades en la ventana anterior (mes pasado)
  ventaAnioPasado: number; // unidades en el mismo período del año pasado
  stock: number | null;
  enCamino: number;
};

export type RotacionItem = {
  codigo: string;
  titulo: string | null;
  ventaActual: number;
  ventaMesPasado: number;
  ventaAnioPasado: number;
  caidaMesPct: number | null; // (mesPasado − actual) / mesPasado. + = cayó, − = creció
  caidaAnioPct: number | null; // idem contra el año pasado
  peorCaida: number; // la mayor de las dos caídas (para ordenar/umbral)
  unidadesPerdidas: number; // referencia − actual (cuánto dejó de vender)
  stock: number | null; // nunca negativo
  enCamino: number;
  motivo: Motivo;
};

export type RotacionReport = {
  key: typeof SIN_ROTACION_KEY;
  generadoEn: string;
  // Los tres meses calendario comparados, en formato "YYYY-MM".
  meses: { actual: string; mesPasado: string; anioPasado: string };
  hayDatosAnioPasado: boolean; // false si la fuente no tiene ventas de ese mes
  params: RotacionParams;
  items: RotacionItem[];
  summary: {
    total: number;
    sinStock: number; // de esos, cuántos están sin stock (agotados o en camino)
    conStock: number; // con stock que no rota
    unidadesPerdidas: number;
  };
};

/** Mes "YYYY-MM" en horario de Uruguay (UTC-3, sin horario de verano). */
export function monthKeyUY(d: Date): string {
  return new Date(d.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 7);
}

/** Suma/resta meses a un "YYYY-MM". */
export function addMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const idx = y * 12 + (m - 1) + delta;
  const ny = Math.floor(idx / 12);
  const nm = (idx % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

/** Rango de fechas [desde, hasta] (YYYY-MM-DD) de un mes calendario. */
export function monthRange(ym: string): { desde: string; hasta: string } {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate(); // día 0 del mes siguiente
  return { desde: `${ym}-01`, hasta: `${ym}-${String(last).padStart(2, "0")}` };
}

/**
 * Los tres meses calendario a comparar a partir de "hoy" (UY): el último mes
 * CERRADO (actual), el mes anterior, y el mismo mes del año pasado. Al cambiar
 * el mes, estos tres avanzan solos.
 */
export function rotacionMeses(now: Date) {
  const enCurso = monthKeyUY(now);
  const actual = addMonth(enCurso, -1); // último mes completo
  const mesPasado = addMonth(actual, -1);
  const anioPasado = addMonth(actual, -12);
  return { actual, mesPasado, anioPasado };
}

/** Nombre legible de un "YYYY-MM", ej. "junio 2026". */
const MESES_ES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
export function mesLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return `${MESES_ES[m - 1] ?? ym} ${y}`;
}

/**
 * Núcleo del reporte: dado el histórico de ventas por código padre, marca los
 * que se venden menos que antes. Función pura → cubierta por tests.
 */
export function scoreRotacion(rows: RotacionInput[], params: RotacionParams): RotacionItem[] {
  const out: RotacionItem[] = [];
  for (const r of rows) {
    const ref = Math.max(r.ventaMesPasado, r.ventaAnioPasado);
    // Solo productos que ANTES vendían (si nunca vendió no es "sin rotación").
    if (ref < params.minUnidadesRef) continue;

    const bajaMes = r.ventaMesPasado > 0 && r.ventaActual < r.ventaMesPasado;
    const bajaAnio = r.ventaAnioPasado > 0 && r.ventaActual < r.ventaAnioPasado;
    if (!bajaMes && !bajaAnio) continue; // no está vendiendo menos → fuera

    const caidaMesPct = r.ventaMesPasado > 0 ? (r.ventaMesPasado - r.ventaActual) / r.ventaMesPasado : null;
    const caidaAnioPct = r.ventaAnioPasado > 0 ? (r.ventaAnioPasado - r.ventaActual) / r.ventaAnioPasado : null;
    const peorCaida = Math.max(caidaMesPct ?? 0, caidaAnioPct ?? 0);
    if (peorCaida < params.caidaMin) continue; // la caída no es lo bastante grande

    const stockPos = r.stock === null ? null : Math.max(0, r.stock);
    const enCamino = Math.max(0, r.enCamino);
    const motivo: Motivo =
      (stockPos ?? 0) <= 0 ? (enCamino > 0 ? "sin-stock-en-camino" : "sin-stock") : "con-stock";

    out.push({
      codigo: r.codigo,
      titulo: r.titulo,
      ventaActual: r.ventaActual,
      ventaMesPasado: r.ventaMesPasado,
      ventaAnioPasado: r.ventaAnioPasado,
      caidaMesPct,
      caidaAnioPct,
      peorCaida,
      unidadesPerdidas: Math.max(0, ref - r.ventaActual),
      stock: stockPos,
      enCamino,
      motivo,
    });
  }

  // Más impacto primero: más unidades dejadas de vender; a igualdad, mayor caída.
  out.sort((a, b) => b.unidadesPerdidas - a.unidadesPerdidas || b.peorCaida - a.peorCaida);
  return out;
}

export function summarizeRotacion(items: RotacionItem[]) {
  let sinStock = 0;
  let conStock = 0;
  let unidadesPerdidas = 0;
  for (const it of items) {
    if (it.motivo === "con-stock") conStock += 1;
    else sinStock += 1;
    unidadesPerdidas += it.unidadesPerdidas;
  }
  return { total: items.length, sinStock, conStock, unidadesPerdidas };
}
