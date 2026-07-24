// Lógica de la sección "Reportes".
//
// Primer reporte: "Ventas aceleradas / riesgo de quiebre". Detecta SKUs que
// últimamente se venden mucho más rápido que su ritmo histórico y cuyo stock
// (más lo que viene en camino) no alcanza a cubrir esa nueva velocidad: es
// decir, productos donde no vamos a llegar con la reposición.
//
// Este módulo es PURO (sin acceso a red ni base de datos) para poder testearlo.
// La parte que consulta MUNDO SHOP + Prisma vive en `reportes.server.ts`.

export const VENTAS_ACELERADAS_KEY = "ventas-aceleradas";

export type VentasAceleradasParams = {
  ventanaDias: number; // ventana "reciente" para medir la velocidad actual
  baseDias: number; // ventana histórica previa para el ritmo "normal"
  ratioMin: number; // aceleración mínima (velReciente / velBase) para marcar
  coberturaMax: number; // días de stock que quedan; por debajo = riesgo
  minUnidades: number; // mínimo de unidades vendidas en la ventana reciente
  objetivoDias: number; // días de cobertura objetivo para la sugerencia de compra
};

export const DEFAULT_PARAMS: VentasAceleradasParams = {
  ventanaDias: 30,
  baseDias: 90,
  ratioMin: 1.5,
  coberturaMax: 30,
  minUnidades: 5,
  objetivoDias: 45,
};

/** Normaliza params parciales (ej. venidos de la config guardada) con defaults. */
export function normalizeParams(p?: Partial<VentasAceleradasParams> | null): VentasAceleradasParams {
  const src = p ?? {};
  const pos = (v: unknown, def: number, min = 0) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= min ? n : def;
  };
  return {
    ventanaDias: Math.max(1, pos(src.ventanaDias, DEFAULT_PARAMS.ventanaDias, 1)),
    baseDias: Math.max(1, pos(src.baseDias, DEFAULT_PARAMS.baseDias, 1)),
    ratioMin: pos(src.ratioMin, DEFAULT_PARAMS.ratioMin),
    coberturaMax: pos(src.coberturaMax, DEFAULT_PARAMS.coberturaMax),
    minUnidades: pos(src.minUnidades, DEFAULT_PARAMS.minUnidades),
    objetivoDias: Math.max(1, pos(src.objetivoDias, DEFAULT_PARAMS.objetivoDias, 1)),
  };
}

// Entrada por SKU para el scoring (agnóstica del origen de los datos → testeable).
export type VentasAceleradasInput = {
  sku: string;
  titulo: string | null;
  unidadesRecientes: number;
  unidadesBase: number;
  stock: number | null;
  enCamino: number;
};

// Fila resultante marcada como en riesgo.
export type VentasAceleradasItem = {
  sku: string;
  titulo: string | null;
  unidadesRecientes: number;
  unidadesBase: number;
  velReciente: number; // unidades/día en la ventana reciente
  velBase: number; // unidades/día en la ventana histórica
  aceleracion: number | null; // velReciente / velBase (null si no hay historial)
  sinHistorial: boolean; // no se vendía antes y ahora sí (producto que "explota")
  stock: number | null;
  enCamino: number;
  diasCobertura: number | null; // días de stock que quedan al ritmo actual (null = infinito)
  sugerido: number; // unidades sugeridas para llegar al objetivo de cobertura
};

export type VentasAceleradasReport = {
  key: typeof VENTAS_ACELERADAS_KEY;
  generadoEn: string; // ISO
  ventana: { recienteDesde: string; recienteHasta: string; baseDesde: string; baseHasta: string };
  params: VentasAceleradasParams;
  items: VentasAceleradasItem[];
  summary: {
    total: number; // SKUs en riesgo
    sinReposicion: number; // de esos, cuántos no tienen nada en camino
    unidadesSugeridas: number; // total de unidades sugeridas
  };
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Fecha YYYY-MM-DD en horario de Uruguay (UTC-3, sin horario de verano). */
function uyDateStr(d: Date): string {
  return new Date(d.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Calcula las cuatro fechas límite de las ventanas a partir de "hoy" (UY). */
export function computeWindows(params: VentasAceleradasParams, now: Date) {
  const recienteHasta = uyDateStr(now);
  const recienteDesde = uyDateStr(new Date(now.getTime() - (params.ventanaDias - 1) * DAY_MS));
  const baseHasta = uyDateStr(new Date(now.getTime() - params.ventanaDias * DAY_MS));
  const baseDesde = uyDateStr(new Date(now.getTime() - (params.ventanaDias + params.baseDias - 1) * DAY_MS));
  return { recienteDesde, recienteHasta, baseDesde, baseHasta };
}

/**
 * Núcleo del reporte: dado el ritmo de ventas reciente vs histórico y el stock,
 * decide qué SKUs están en riesgo de quiebre. Función pura → cubierta por tests.
 */
export function scoreVentasAceleradas(
  rows: VentasAceleradasInput[],
  params: VentasAceleradasParams,
): VentasAceleradasItem[] {
  const out: VentasAceleradasItem[] = [];
  for (const r of rows) {
    const velReciente = r.unidadesRecientes / params.ventanaDias;
    const velBase = r.unidadesBase / params.baseDias;
    const sinHistorial = velBase <= 0;
    const aceleracion = sinHistorial ? null : velReciente / velBase;

    // Filtro 1: la ventana reciente tiene que tener volumen real.
    if (r.unidadesRecientes < params.minUnidades) continue;
    // Filtro 2: se tiene que estar acelerando (o ser un producto nuevo que explota).
    if (!sinHistorial && (aceleracion as number) < params.ratioMin) continue;

    const stockPos = Math.max(0, r.stock ?? 0);
    const disponible = stockPos + Math.max(0, r.enCamino);
    const diasCobertura = velReciente > 0 ? disponible / velReciente : null;

    // Filtro 3: el stock + lo que viene NO alcanza a cubrir el ritmo actual.
    if (diasCobertura === null || diasCobertura > params.coberturaMax) continue;

    const objetivo = velReciente * params.objetivoDias;
    const sugerido = Math.max(0, Math.round(objetivo - disponible));

    out.push({
      sku: r.sku,
      titulo: r.titulo,
      unidadesRecientes: r.unidadesRecientes,
      unidadesBase: r.unidadesBase,
      velReciente,
      velBase,
      aceleracion,
      sinHistorial,
      stock: r.stock,
      enCamino: r.enCamino,
      diasCobertura,
      sugerido,
    });
  }

  // Más urgente primero: menos días de cobertura; a igualdad, mayor aceleración.
  out.sort((a, b) => {
    const da = a.diasCobertura ?? Infinity;
    const db = b.diasCobertura ?? Infinity;
    if (da !== db) return da - db;
    const aa = a.aceleracion ?? Infinity;
    const ab = b.aceleracion ?? Infinity;
    return ab - aa;
  });
  return out;
}

/** Arma el summary del reporte a partir de los items marcados. */
export function summarize(items: VentasAceleradasItem[]) {
  let sinReposicion = 0;
  let unidadesSugeridas = 0;
  for (const it of items) {
    if (it.enCamino <= 0) sinReposicion += 1;
    unidadesSugeridas += it.sugerido;
  }
  return { total: items.length, sinReposicion, unidadesSugeridas };
}

/** Arma un resumen en texto plano del reporte (para WhatsApp / logs). */
export function reportToText(report: VentasAceleradasReport, max = 12): string {
  const { summary, items, ventana } = report;
  const fmt1 = (n: number) => n.toLocaleString("es-UY", { maximumFractionDigits: 1 });
  const lines: string[] = [];
  lines.push("🚨 *Ventas aceleradas / riesgo de quiebre*");
  lines.push(`Ventana: últimos ${report.params.ventanaDias} días (hasta ${ventana.recienteHasta})`);
  if (summary.total === 0) {
    lines.push("");
    lines.push("✅ Sin SKUs en riesgo hoy. Todo el stock cubre la demanda actual.");
    return lines.join("\n");
  }
  lines.push(
    `${summary.total} SKU(s) en riesgo · ${summary.sinReposicion} sin nada en camino · ` +
      `${summary.unidadesSugeridas.toLocaleString("es-UY")} u. sugeridas`,
  );
  lines.push("");
  for (const it of items.slice(0, max)) {
    const cob = it.diasCobertura === null ? "—" : `${Math.round(it.diasCobertura)}d`;
    const accel = it.sinHistorial ? "nuevo" : `${fmt1(it.aceleracion ?? 0)}×`;
    const camino = it.enCamino > 0 ? `, ${it.enCamino} en camino` : ", sin reposición";
    const titulo = (it.titulo ?? it.sku).slice(0, 40);
    lines.push(`• *${it.sku}* ${titulo}`);
    lines.push(`   ${fmt1(it.velReciente)} u/día (${accel}) · quedan ${cob}${camino} · pedir ~${it.sugerido}`);
  }
  if (items.length > max) lines.push(`… y ${items.length - max} más (ver en la plataforma).`);
  return lines.join("\n");
}
