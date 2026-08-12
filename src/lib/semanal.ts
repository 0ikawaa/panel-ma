// Lógica del reporte semanal de ventas y reposición a 4 meses.
//
// Responde dos preguntas de una sola vez, por VARIANTE (el SKU completo,
// "16214-BLA", no el código padre):
//   1. qué se vendió la semana que cerró, y
//   2. cuánto stock hace falta para cubrir los próximos 4 meses.
//
// OJO con el ritmo: proyectar cuatro meses con los siete días de una sola
// semana es engañoso (una semana buena multiplica el pedido por nada). Por eso
// las unidades de la semana son el DATO A MIRAR, pero la velocidad con la que
// se proyecta sale de una ventana larga (90 días por defecto, `ritmoDias`).
//
// Módulo PURO (sin red ni base) para poder testearlo. La parte que consulta
// MUNDO SHOP + Prisma vive en `semanal.server.ts`.

import { DIAS_POR_MES } from "@/lib/reportes";

export const SEMANAL_KEY = "semanal";

export type SemanalParams = {
  mesesObjetivo: number; // meses de cobertura a asegurar (el "a 4 meses" del pedido)
  ritmoDias: number; // ventana larga con la que se mide la velocidad de venta
  descontarEnCamino: boolean; // restar del pedido lo que ya viene en contenedores
};

export const DEFAULT_PARAMS: SemanalParams = {
  mesesObjetivo: 4,
  ritmoDias: 90,
  descontarEnCamino: true,
};

/** Normaliza params parciales (ej. los guardados en ReportConfig) con defaults. */
export function normalizeParams(p?: Partial<SemanalParams> | null): SemanalParams {
  const src = (p ?? {}) as Partial<SemanalParams>;
  const pos = (v: unknown, def: number, min: number) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= min ? n : def;
  };
  return {
    mesesObjetivo: pos(src.mesesObjetivo, DEFAULT_PARAMS.mesesObjetivo, 0.25),
    ritmoDias: Math.round(pos(src.ritmoDias, DEFAULT_PARAMS.ritmoDias, 7)),
    descontarEnCamino:
      typeof src.descontarEnCamino === "boolean"
        ? src.descontarEnCamino
        : DEFAULT_PARAMS.descontarEnCamino,
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;
const UY_OFFSET_MS = 3 * 60 * 60 * 1000; // Uruguay es UTC-3 todo el año

/** Fecha YYYY-MM-DD en horario de Uruguay. */
function uyDateStr(d: Date): string {
  return new Date(d.getTime() - UY_OFFSET_MS).toISOString().slice(0, 10);
}

/** Día de la semana en Uruguay (0 = domingo … 6 = sábado). */
function uyDay(d: Date): number {
  return new Date(d.getTime() - UY_OFFSET_MS).getUTCDay();
}

export type Ventana = {
  desde: string; // lunes YYYY-MM-DD
  hasta: string; // domingo YYYY-MM-DD
  ritmoDesde: string; // arranque de la ventana larga que mide la velocidad
  label: string; // "4–10 ago" para el asunto del mail
};

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"];

/** "2026-08-04" + "2026-08-10" → "4–10 ago" (y "28 jul – 3 ago" si cruza de mes). */
export function ventanaLabel(desde: string, hasta: string): string {
  const [, md, dd] = desde.split("-").map(Number);
  const [, mh, dh] = hasta.split("-").map(Number);
  if (md === mh) return `${dd}–${dh} ${MESES[mh - 1]}`;
  return `${dd} ${MESES[md - 1]} – ${dh} ${MESES[mh - 1]}`;
}

/**
 * La última semana COMPLETA de lunes a domingo antes de `now`. Corriendo el
 * cron el lunes a la mañana, es la semana que acaba de cerrar; corriéndolo a
 * mano un miércoles, sigue siendo esa misma semana (nunca una a medio andar).
 */
export function ventanaSemanal(params: SemanalParams, now: Date = new Date()): Ventana {
  const dow = uyDay(now); // 0 = domingo
  // Días para atrás hasta el domingo anterior (si hoy ES domingo, el de hace 7).
  const atrasHastaDomingo = dow === 0 ? 7 : dow;
  const hastaMs = now.getTime() - atrasHastaDomingo * DAY_MS;
  const hasta = uyDateStr(new Date(hastaMs));
  const desde = uyDateStr(new Date(hastaMs - 6 * DAY_MS));
  const ritmoDesde = uyDateStr(new Date(hastaMs - (params.ritmoDias - 1) * DAY_MS));
  return { desde, hasta, ritmoDesde, label: ventanaLabel(desde, hasta) };
}

// Entrada por variante, agnóstica de dónde salieron los datos → testeable.
export type SemanalInput = {
  sku: string; // SKU completo, con variante
  titulo: string | null;
  categoria: string | null;
  unidadesSemana: number; // vendidas en la semana del reporte
  unidadesRitmo: number; // vendidas en la ventana larga (para la velocidad)
  stock: number | null; // disponible actual en Odoo
  enCamino: number; // unidades en contenedores / producción
  photo: string | null; // foto: manual > MercadoLibre > Excel
};

export type SemanalItem = {
  sku: string;
  codigoBase: string; // código padre, para agrupar las variantes de un producto
  titulo: string | null;
  categoria: string | null;
  unidadesSemana: number;
  unidadesRitmo: number;
  velDia: number; // unidades/día en la ventana larga
  stock: number;
  enCamino: number;
  disponible: number; // stock + en camino (lo que hay para cubrir la demanda)
  mesesCobertura: number | null; // meses que cubre lo disponible; null = no se vende
  pedir: number; // unidades a comprar para llegar a `mesesObjetivo`
  alcanza: boolean; // true si ya cubre el objetivo (pedir === 0)
  photo: string | null;
};

export type SemanalReport = {
  key: typeof SEMANAL_KEY;
  generadoEn: string; // ISO
  ventana: Ventana;
  params: SemanalParams;
  items: SemanalItem[];
  summary: {
    variantes: number; // variantes con al menos una venta en la semana
    productos: number; // códigos padre distintos
    unidadesSemana: number;
    aReponer: number; // variantes que no llegan al objetivo
    unidadesAPedir: number;
    sinStock: number; // variantes que vendieron y ya están en cero
  };
};

/** Código padre de un SKU con variante: "16214-BLA" → "16214". */
export function codigoBase(sku: string): string {
  return sku.split(/[-\s/]/)[0].trim();
}

/**
 * Códigos de Odoo que no son productos sino conceptos de servicio: envíos,
 * armado, instalación, diferencias de precio. Venden "unidades" y tienen stock
 * cero, así que sin esto encabezan la lista pidiendo 305 unidades de "ENVÍO".
 *
 * Es una lista explícita a propósito. Filtrar por nombre o por la categoría
 * "All" de Odoo se llevaría puestos productos reales: ahí adentro conviven los
 * envíos con packs, colchones y lámparas que sí hay que reponer.
 */
export const SKUS_NO_PRODUCTO = new Set([
  "000-1", // Prueba OT
  "0001", // COSTO DE ENVIO
  "0005", // INSUMOS LASER
  "001", // ENVÍO
  "003", // Armado de bicicleta
  "004", // INSTALACION ZERKO
  "005", // Envío UES
  "006", // Envío Pedido Ya
  "007", // Envíos Soy Delivery
  "008", // Envío DAC
  "1025-0", // DIFERENCIA DE PRECIO
]);

/**
 * Núcleo del reporte: cruza lo vendido con el stock y calcula la cobertura y el
 * pedido para llegar al objetivo. Devuelve las variantes ordenadas por urgencia
 * (menos cobertura primero) y, a igual cobertura, por lo que más se vendió.
 */
export function construirFilas(rows: SemanalInput[], params: SemanalParams): SemanalItem[] {
  const objetivoDias = params.mesesObjetivo * DIAS_POR_MES;
  const items: SemanalItem[] = [];

  for (const r of rows) {
    // Sólo entra lo que se vendió en la semana: el reporte es "lo que vendimos".
    if (r.unidadesSemana <= 0) continue;
    if (SKUS_NO_PRODUCTO.has(r.sku)) continue;

    // El stock negativo de Odoo (ventas sin ingreso cargado) se lee como cero:
    // tratar -8 como stock haría pedir de más.
    const stock = Math.max(0, r.stock ?? 0);
    const enCamino = Math.max(0, r.enCamino);
    const disponible = stock + (params.descontarEnCamino ? enCamino : 0);

    const velDia = params.ritmoDias > 0 ? r.unidadesRitmo / params.ritmoDias : 0;
    // Sin ritmo medido no hay proyección posible: la cobertura queda en null
    // (infinita) y no se pide nada, en vez de inventar un número.
    const mesesCobertura = velDia > 0 ? disponible / velDia / DIAS_POR_MES : null;
    const objetivo = velDia * objetivoDias;
    const pedir = velDia > 0 ? Math.max(0, Math.ceil(objetivo - disponible)) : 0;

    items.push({
      sku: r.sku,
      codigoBase: codigoBase(r.sku),
      titulo: r.titulo,
      categoria: r.categoria,
      unidadesSemana: r.unidadesSemana,
      unidadesRitmo: r.unidadesRitmo,
      velDia,
      stock,
      enCamino,
      disponible,
      mesesCobertura,
      pedir,
      alcanza: pedir === 0,
      photo: r.photo,
    });
  }

  items.sort((a, b) => {
    // null = cobertura infinita (no se vende en la ventana larga): al final.
    const ca = a.mesesCobertura ?? Number.POSITIVE_INFINITY;
    const cb = b.mesesCobertura ?? Number.POSITIVE_INFINITY;
    if (ca !== cb) return ca - cb;
    return b.unidadesSemana - a.unidadesSemana;
  });
  return items;
}

/** Totales del reporte, para el asunto del mail y la pantalla. */
export function resumir(items: SemanalItem[]): SemanalReport["summary"] {
  const productos = new Set<string>();
  let unidadesSemana = 0;
  let aReponer = 0;
  let unidadesAPedir = 0;
  let sinStock = 0;
  for (const it of items) {
    productos.add(it.codigoBase);
    unidadesSemana += it.unidadesSemana;
    if (!it.alcanza) {
      aReponer += 1;
      unidadesAPedir += it.pedir;
    }
    if (it.stock === 0) sinStock += 1;
  }
  return {
    variantes: items.length,
    productos: productos.size,
    unidadesSemana,
    aReponer,
    unidadesAPedir,
    sinStock,
  };
}

/** Arma el reporte completo a partir de las filas ya cruzadas. */
export function buildReport(
  rows: SemanalInput[],
  params: SemanalParams,
  now: Date = new Date(),
): SemanalReport {
  const items = construirFilas(rows, params);
  return {
    key: SEMANAL_KEY,
    generadoEn: now.toISOString(),
    ventana: ventanaSemanal(params, now),
    params,
    items,
    summary: resumir(items),
  };
}

// ------------------------------------------------------------------ formato

const fmtInt = (n: number) => Math.round(n).toLocaleString("es-UY");
/** Meses de cobertura como "1,2 m"; "—" cuando no hay ritmo para proyectar. */
export function fmtCobertura(m: number | null): string {
  if (m === null) return "—";
  if (m >= 99) return "99+ m";
  return `${m.toFixed(1).replace(".", ",")} m`;
}
/** Velocidad como "2,1 u/día". */
export function fmtVel(v: number): string {
  return `${v.toFixed(1).replace(".", ",")} u/día`;
}

/** Resumen en texto plano (cuerpo alternativo del mail y logs). */
export function reportToText(r: SemanalReport): string {
  const s = r.summary;
  const lines = [
    `Reporte semanal · ${r.ventana.label}`,
    `${fmtInt(s.unidadesSemana)} unidades · ${s.variantes} variantes de ${s.productos} productos`,
    `${s.aReponer} variantes no llegan a ${r.params.mesesObjetivo} meses → pedir ${fmtInt(s.unidadesAPedir)} u`,
    s.sinStock > 0 ? `${s.sinStock} vendieron y ya están sin stock` : "",
    "",
  ].filter(Boolean);
  for (const it of r.items.slice(0, 20)) {
    lines.push(
      `${it.sku} · ${it.titulo ?? "sin título"}`,
      `   ${it.unidadesSemana} u en la semana · stock ${fmtInt(it.stock)}${
        it.enCamino > 0 ? ` (+${fmtInt(it.enCamino)} en camino)` : ""
      } · cubre ${fmtCobertura(it.mesesCobertura)}${it.pedir > 0 ? ` · pedir ${fmtInt(it.pedir)}` : ""}`,
    );
  }
  if (r.items.length > 20) lines.push(`… y ${r.items.length - 20} variantes más en el Excel adjunto.`);
  return lines.join("\n");
}
