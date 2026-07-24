// Compute del reporte "Publicaciones a revisar".
// Junta las publicaciones live de ML (active/paused/closed) con el stock de Odoo
// y las ventas por publicación (BD MUNDO SHOP), y arma los dos análisis con la
// lógica pura de `publicaciones.ts`.

import { prisma } from "@/lib/prisma";
import { msListAllItems, msQuery } from "@/lib/mundoshop";
import {
  PUBLICACIONES_KEY,
  normalizePublicacionesParams,
  ventanaDesde,
  ventanaLabel,
  buildInactivas,
  buildSinVentas,
  type PublicacionesParams,
  type PublicacionesReport,
  type InactivaInput,
  type SinVentasInput,
} from "@/lib/publicaciones";

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
// Código padre / base: "16000-BLA/MAR" → "16000".
function baseCode(sku: string): string {
  return sku.split(/[-\s/]/)[0].trim();
}

export async function computePublicaciones(
  params: PublicacionesParams,
  now: Date = new Date(),
): Promise<PublicacionesReport> {
  const desde = ventanaDesde(params, now);

  // Publicaciones live por estado (en paralelo).
  const [pausedRes, closedRes, activeRes] = await Promise.all([
    msListAllItems("paused", { timeoutMs: 30000 }),
    msListAllItems("closed", { timeoutMs: 30000 }),
    msListAllItems("active", { timeoutMs: 30000 }),
  ]);
  const paused = pausedRes.items;
  const closed = closedRes.items;
  const active = activeRes.items;
  // ML corta la búsqueda en 1000: si hay más pausadas/cerradas, no se pudieron leer todas.
  const inactivasReales = pausedRes.total + closedRes.total;
  const inactivasLeidas = paused.length + closed.length;

  // Datos de BD: puente item→SKU, stock Odoo, en camino, ventas de la ventana, última venta.
  const sqlBridge = `SELECT DISTINCT item_id, item_sku FROM ml_order_items WHERE item_sku IS NOT NULL AND item_sku <> ''`;
  const sqlStock = `SELECT default_code AS sku, SUM(qty_available) AS stock FROM odoo_products WHERE default_code IS NOT NULL AND default_code <> '' GROUP BY default_code`;
  const sqlCamino = `SELECT sku, SUM(cantidad) AS en_camino FROM productos_en_camino WHERE sku IS NOT NULL AND sku <> '' GROUP BY sku`;
  const sqlVentana = `
    SELECT oi.item_id AS item_id, SUM(oi.quantity) AS units
    FROM ml_orders o JOIN ml_order_items oi ON oi.order_id = o.id
    WHERE o.status <> 'cancelled' AND substr(o.date_created,1,10) >= '${desde}'
    GROUP BY oi.item_id`;
  const sqlUltima = `
    SELECT oi.item_id AS item_id, MAX(substr(o.date_created,1,10)) AS ultima
    FROM ml_orders o JOIN ml_order_items oi ON oi.order_id = o.id
    WHERE o.status <> 'cancelled'
    GROUP BY oi.item_id`;

  const [bridgeRows, stockRows, caminoRows, ventasRows, ultimaRows] = await Promise.all([
    msQuery(sqlBridge, 45000),
    msQuery(sqlStock, 45000),
    msQuery(sqlCamino, 45000),
    msQuery(sqlVentana, 45000),
    msQuery(sqlUltima, 45000),
  ]);

  // Puente item_id → SKUs Odoo.
  const skusByItem = new Map<string, string[]>();
  for (const r of bridgeRows) {
    const id = String(r.item_id);
    const sku = String(r.item_sku);
    const arr = skusByItem.get(id) ?? [];
    if (!arr.includes(sku)) arr.push(sku);
    skusByItem.set(id, arr);
  }
  const stockBySku = new Map<string, number>();
  for (const r of stockRows) stockBySku.set(String(r.sku), num(r.stock));
  const caminoByBase = new Map<string, number>();
  for (const r of caminoRows) {
    const b = baseCode(String(r.sku));
    caminoByBase.set(b, (caminoByBase.get(b) ?? 0) + num(r.en_camino));
  }
  const ventasByItem = new Map<string, number>();
  for (const r of ventasRows) ventasByItem.set(String(r.item_id), num(r.units));
  const ultimaByItem = new Map<string, string>();
  for (const r of ultimaRows) ultimaByItem.set(String(r.item_id), String(r.ultima));

  const stockOdooDe = (skus: string[]): number | null => {
    if (skus.length === 0) return null;
    let sum = 0;
    let any = false;
    for (const s of skus) {
      const v = stockBySku.get(s);
      if (v !== undefined) {
        sum += v;
        any = true;
      }
    }
    return any ? sum : null;
  };
  const enCaminoDe = (skus: string[]): number => {
    let sum = 0;
    const seen = new Set<string>();
    for (const s of skus) {
      const b = baseCode(s);
      if (seen.has(b)) continue;
      seen.add(b);
      sum += caminoByBase.get(b) ?? 0;
    }
    return sum;
  };

  // A) Inactivas (paused + closed).
  const inactivasSrc = [...paused, ...closed];
  let inactivasSinMapa = 0;
  const inactivaInputs: InactivaInput[] = inactivasSrc.map((it) => {
    const skus = skusByItem.get(it.id) ?? [];
    if (skus.length === 0) inactivasSinMapa += 1;
    return {
      id: it.id,
      titulo: it.title,
      thumbnail: it.thumbnail,
      permalink: it.permalink,
      status: it.status,
      subStatus: it.sub_status ?? [],
      mlDisponible: it.available_quantity,
      vendidas: it.sold_quantity,
      skus,
      stockOdoo: stockOdooDe(skus),
      enCamino: enCaminoDe(skus),
    };
  });
  const inactivas = buildInactivas(inactivaInputs);

  // B) Sin ventas (active).
  const sinVentasInputs: SinVentasInput[] = active.map((it) => {
    const skus = skusByItem.get(it.id) ?? [];
    return {
      id: it.id,
      titulo: it.title,
      thumbnail: it.thumbnail,
      permalink: it.permalink,
      mlDisponible: it.available_quantity,
      vendidas: it.sold_quantity,
      skus,
      stockOdoo: stockOdooDe(skus),
      ventasVentana: ventasByItem.get(it.id) ?? 0,
      ultimaVenta: ultimaByItem.get(it.id) ?? null,
    };
  });
  const sinVentas = buildSinVentas(sinVentasInputs, now);

  return {
    key: PUBLICACIONES_KEY,
    generadoEn: now.toISOString(),
    params,
    ventana: { unidad: params.ventanaUnidad, cantidad: params.ventanaCantidad, desde, label: ventanaLabel(params) },
    inactivas,
    sinVentas,
    summary: {
      inactivasTotal: inactivasSrc.length,
      inactivasConStock: inactivas.length,
      inactivasSinMapa,
      inactivasReales,
      inactivasNoLeidas: Math.max(0, inactivasReales - inactivasLeidas),
      sinVentasTotal: sinVentas.length,
      sinVentasConStock: sinVentas.filter((s) => s.conStock).length,
    },
  };
}

/** Config guardada del reporte (o defaults) desde Prisma. */
export async function getPublicacionesConfig() {
  const cfg = await prisma.reportConfig.findUnique({ where: { key: PUBLICACIONES_KEY } });
  return { params: normalizePublicacionesParams((cfg?.params as Partial<PublicacionesParams> | null) ?? null) };
}
