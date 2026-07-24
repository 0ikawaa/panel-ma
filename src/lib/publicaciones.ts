// Reporte "Publicaciones a revisar".
//
// Dos análisis sobre las publicaciones de MercadoLibre, cruzados con el stock de
// Odoo (a través del puente item_id → SKU que arman las órdenes históricas):
//
//  A) INACTIVAS CON STOCK: publicaciones pausadas/cerradas en ML que en Odoo
//     todavía tienen stock. Para cada una se explica POR QUÉ está inactiva
//     (motivo de ML) y qué hacer.
//  B) SIN VENTAS: publicaciones activas que no vendieron nada en una ventana
//     configurable (semanas o meses).
//
// Módulo PURO (sin red/DB) → testeable. El fetch/compute vive en
// `publicaciones.server.ts`.

export const PUBLICACIONES_KEY = "publicaciones-inactivas";

export type VentanaUnidad = "semana" | "mes";

export type PublicacionesParams = {
  ventanaUnidad: VentanaUnidad;
  ventanaCantidad: number;
};

export const PUBLICACIONES_DEFAULTS: PublicacionesParams = {
  ventanaUnidad: "mes",
  ventanaCantidad: 2,
};

export function normalizePublicacionesParams(p?: Partial<PublicacionesParams> | null): PublicacionesParams {
  const src = p ?? {};
  const unidad: VentanaUnidad = src.ventanaUnidad === "semana" ? "semana" : "mes";
  const cantRaw = Number(src.ventanaCantidad);
  const max = unidad === "semana" ? 52 : 24;
  const cantidad = Number.isFinite(cantRaw) && cantRaw >= 1 ? Math.min(max, Math.floor(cantRaw)) : PUBLICACIONES_DEFAULTS.ventanaCantidad;
  return { ventanaUnidad: unidad, ventanaCantidad: cantidad };
}

const DAY_MS = 24 * 60 * 60 * 1000;
const DIAS_POR_MES = 30.44;

/** Días que abarca la ventana configurada. */
export function ventanaDias(p: PublicacionesParams): number {
  return Math.round(p.ventanaCantidad * (p.ventanaUnidad === "semana" ? 7 : DIAS_POR_MES));
}

/** Fecha "desde" (YYYY-MM-DD, horario UY) de la ventana. */
export function ventanaDesde(p: PublicacionesParams, now: Date): string {
  const desde = new Date(now.getTime() - ventanaDias(p) * DAY_MS);
  return new Date(desde.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function ventanaLabel(p: PublicacionesParams): string {
  const u = p.ventanaUnidad === "semana" ? (p.ventanaCantidad === 1 ? "semana" : "semanas") : p.ventanaCantidad === 1 ? "mes" : "meses";
  return `${p.ventanaCantidad} ${u}`;
}

// ---------- A) Inactivas con stock ----------

export type MotivoInactiva = "sin-stock" | "pausada-vendedor" | "cerrada" | "otra";

export type InactivaInput = {
  id: string;
  titulo: string;
  thumbnail: string | null;
  permalink: string | null;
  status: string; // paused | closed
  subStatus: string[];
  mlDisponible: number | null; // available_quantity en ML
  vendidas: number | null; // sold_quantity histórico
  skus: string[]; // SKUs Odoo mapeados (puede ser vacío)
  stockOdoo: number | null; // suma de stock Odoo de esos SKUs (null si no se pudo mapear)
  enCamino: number;
};

export type InactivaItem = Omit<InactivaInput, "subStatus"> & {
  motivo: MotivoInactiva;
  motivoLabel: string;
  explicacion: string; // por qué está inactiva + qué hacer
  accionable: boolean; // tiene stock en Odoo (vale la pena reactivarla)
};

/** Traduce el sub_status/estado de ML a un motivo legible. */
export function motivoInactiva(status: string, subStatus: string[]): { motivo: MotivoInactiva; label: string } {
  const ss = (subStatus ?? []).map((s) => s.toLowerCase());
  if (status === "closed") return { motivo: "cerrada", label: "Cerrada / finalizada en ML" };
  if (ss.includes("out_of_stock")) return { motivo: "sin-stock", label: "Sin stock en la publicación" };
  if (ss.includes("deleted")) return { motivo: "cerrada", label: "Eliminada en ML" };
  if (ss.includes("paused_by_seller")) return { motivo: "pausada-vendedor", label: "Pausada manualmente" };
  if (ss.length === 0) return { motivo: "otra", label: "Pausada (ML no informa el motivo)" };
  return { motivo: "otra", label: `Pausada (${ss.join(", ")})` };
}

function explicar(motivo: MotivoInactiva, stockOdoo: number | null, enCamino: number): string {
  const tieneStock = (stockOdoo ?? 0) > 0;
  const stockTxt = tieneStock ? `En Odoo tenés ${stockOdoo} unidad${stockOdoo === 1 ? "" : "es"}` : "En Odoo no hay stock";
  const camino = enCamino > 0 ? ` (y ${enCamino} en camino)` : "";
  switch (motivo) {
    case "sin-stock":
      return tieneStock
        ? `MercadoLibre la pausó porque la publicación se quedó en 0. ${stockTxt}${camino}: hay que reponer el stock en la publicación o republicarla.`
        : `MercadoLibre la pausó porque se quedó sin stock. ${stockTxt}${camino}.`;
    case "pausada-vendedor":
      return tieneStock
        ? `Se pausó a mano. ${stockTxt}${camino}: si todavía la vendés, reactivala.`
        : `Se pausó a mano. ${stockTxt}${camino}.`;
    case "cerrada":
      return tieneStock
        ? `La publicación está cerrada/finalizada en ML. ${stockTxt}${camino}: si querés seguir vendiéndolo, hay que crear una publicación nueva.`
        : `La publicación está cerrada/finalizada en ML. ${stockTxt}${camino}.`;
    default:
      return tieneStock
        ? `Está inactiva en ML sin motivo informado. ${stockTxt}${camino}: revisá la publicación y reactivala.`
        : `Está inactiva en ML sin motivo informado. ${stockTxt}${camino}.`;
  }
}

/**
 * Núcleo del análisis A: de las publicaciones inactivas, quedarse con las que
 * tienen stock en Odoo (accionables) y explicar por qué están inactivas.
 * Puro → testeable.
 */
export function buildInactivas(inputs: InactivaInput[]): InactivaItem[] {
  const out: InactivaItem[] = [];
  for (const r of inputs) {
    const stockPos = r.stockOdoo === null ? null : Math.max(0, r.stockOdoo);
    if ((stockPos ?? 0) <= 0) continue; // sólo las que tienen stock en Odoo
    const { motivo, label } = motivoInactiva(r.status, r.subStatus);
    out.push({
      id: r.id,
      titulo: r.titulo,
      thumbnail: r.thumbnail,
      permalink: r.permalink,
      status: r.status,
      mlDisponible: r.mlDisponible,
      vendidas: r.vendidas,
      skus: r.skus,
      stockOdoo: stockPos,
      enCamino: Math.max(0, r.enCamino),
      motivo,
      motivoLabel: label,
      explicacion: explicar(motivo, stockPos, Math.max(0, r.enCamino)),
      accionable: true,
    });
  }
  // Más stock inmovilizado primero.
  out.sort((a, b) => (b.stockOdoo ?? 0) - (a.stockOdoo ?? 0) || (b.vendidas ?? 0) - (a.vendidas ?? 0));
  return out;
}

// ---------- B) Sin ventas ----------

export type SinVentasInput = {
  id: string;
  titulo: string;
  thumbnail: string | null;
  permalink: string | null;
  mlDisponible: number | null;
  vendidas: number | null;
  skus: string[];
  stockOdoo: number | null;
  ventasVentana: number; // unidades vendidas en la ventana
  ultimaVenta: string | null; // YYYY-MM-DD de la última venta (o null si nunca)
};

export type SinVentasItem = {
  id: string;
  titulo: string;
  thumbnail: string | null;
  permalink: string | null;
  sku: string | null;
  stock: number | null; // Odoo si se pudo mapear; si no, disponible en ML
  stockOrigen: "odoo" | "ml" | null;
  conStock: boolean;
  vendidas: number | null;
  ultimaVenta: string | null;
  diasSinVenta: number | null;
};

/**
 * Núcleo del análisis B: publicaciones activas que no vendieron en la ventana.
 * Puro → testeable.
 */
export function buildSinVentas(inputs: SinVentasInput[], now: Date): SinVentasItem[] {
  const hoy = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  const out: SinVentasItem[] = [];
  for (const r of inputs) {
    if (r.ventasVentana > 0) continue; // vendió algo en la ventana → fuera
    const stockOdooPos = r.stockOdoo === null ? null : Math.max(0, r.stockOdoo);
    const stock = stockOdooPos !== null ? stockOdooPos : r.mlDisponible;
    const stockOrigen: "odoo" | "ml" | null = stockOdooPos !== null ? "odoo" : r.mlDisponible !== null ? "ml" : null;
    let diasSinVenta: number | null = null;
    if (r.ultimaVenta) {
      diasSinVenta = Math.max(0, Math.round((hoy.getTime() - new Date(r.ultimaVenta + "T00:00:00").getTime()) / DAY_MS));
    }
    out.push({
      id: r.id,
      titulo: r.titulo,
      thumbnail: r.thumbnail,
      permalink: r.permalink,
      sku: r.skus[0] ?? null,
      stock,
      stockOrigen,
      conStock: (stock ?? 0) > 0,
      vendidas: r.vendidas,
      ultimaVenta: r.ultimaVenta,
      diasSinVenta,
    });
  }
  // Con stock primero (plata quieta), luego más stock, luego más tiempo sin vender.
  out.sort((a, b) => {
    if (a.conStock !== b.conStock) return a.conStock ? -1 : 1;
    if ((b.stock ?? 0) !== (a.stock ?? 0)) return (b.stock ?? 0) - (a.stock ?? 0);
    return (b.diasSinVenta ?? 0) - (a.diasSinVenta ?? 0);
  });
  return out;
}

export type PublicacionesReport = {
  key: typeof PUBLICACIONES_KEY;
  generadoEn: string;
  params: PublicacionesParams;
  ventana: { unidad: VentanaUnidad; cantidad: number; desde: string; label: string };
  inactivas: InactivaItem[];
  sinVentas: SinVentasItem[];
  summary: {
    inactivasTotal: number; // inactivas en ML (paused + closed) leídas
    inactivasConStock: number; // inactivas.length (con stock Odoo)
    inactivasSinMapa: number; // inactivas sin SKU mapeable (no se pudo cruzar stock)
    inactivasReales: number; // total real informado por ML (puede ser > leídas)
    inactivasNoLeidas: number; // inactivas que ML no dejó leer (tope de offset 1000)
    sinVentasTotal: number; // sinVentas.length
    sinVentasConStock: number; // de esas, con stock
  };
};
