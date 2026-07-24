// Parte del reporte "Sin rotación" que toca red/base de datos.
// La lógica pura (scoring, ventanas) está en `rotacion.ts`.

import { prisma } from "@/lib/prisma";
import { msQuery } from "@/lib/mundoshop";
import {
  SIN_ROTACION_KEY,
  scoreRotacion,
  summarizeRotacion,
  rotacionWindows,
  normalizeRotacionParams,
  type RotacionParams,
  type RotacionInput,
  type RotacionReport,
} from "@/lib/rotacion";

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
// Código padre / base: "16000-BLA/MAR" → "16000".
function baseCode(sku: string): string {
  return sku.split(/[-\s/]/)[0].trim();
}

/**
 * Calcula el reporte de publicaciones sin rotación: ventas por código padre en
 * tres ventanas (actual, mes pasado, mismo período del año pasado) cruzadas con
 * el stock actual y lo que viene en camino.
 */
export async function computeSinRotacion(
  params: RotacionParams,
  now: Date = new Date(),
): Promise<RotacionReport> {
  const w = rotacionWindows(params.ventanaDias, now);

  // Filtro de fecha que limita el escaneo a las tres ventanas (no al año entero).
  const enRango = (d: string) =>
    `((${d} >= '${w.actualDesde}' AND ${d} <= '${w.actualHasta}') OR ` +
    `(${d} >= '${w.mesDesde}' AND ${d} <= '${w.mesHasta}') OR ` +
    `(${d} >= '${w.anioDesde}' AND ${d} <= '${w.anioHasta}'))`;

  // Ventas por SKU divididas en las tres ventanas, unificando canales igual que
  // el resto de los reportes (ML real + Odoo POS + Sale sin "Mateo Alpuy").
  const sqlVentas = `
    SELECT sku,
      SUM(CASE WHEN d >= '${w.actualDesde}' AND d <= '${w.actualHasta}' THEN units ELSE 0 END) AS actual,
      SUM(CASE WHEN d >= '${w.mesDesde}'    AND d <= '${w.mesHasta}'    THEN units ELSE 0 END) AS mes,
      SUM(CASE WHEN d >= '${w.anioDesde}'   AND d <= '${w.anioHasta}'   THEN units ELSE 0 END) AS anio
    FROM (
      SELECT oi.item_sku AS sku, oi.quantity AS units, substr(o.date_created,1,10) AS d
      FROM ml_orders o JOIN ml_order_items oi ON oi.order_id = o.id
      WHERE o.status <> 'cancelled' AND ${enRango("substr(o.date_created,1,10)")}
      UNION ALL
      SELECT pr.default_code AS sku, l.qty AS units, substr(o.date_order,1,10) AS d
      FROM odoo_pos_orders o JOIN odoo_pos_order_lines l ON l.order_id = o.id
      LEFT JOIN odoo_products pr ON pr.id = l.product_id
      WHERE o.state <> 'cancel' AND ${enRango("substr(o.date_order,1,10)")}
      UNION ALL
      SELECT pr.default_code AS sku, l.product_uom_qty AS units, substr(o.date_order,1,10) AS d
      FROM odoo_sale_orders o JOIN odoo_sale_order_lines l ON l.order_id = o.id
      LEFT JOIN odoo_products pr ON pr.id = l.product_id
      WHERE o.state = 'sale' AND (o.salesman_name IS NULL OR o.salesman_name <> 'Mateo Alpuy')
        AND ${enRango("substr(o.date_order,1,10)")}
    )
    WHERE sku IS NOT NULL AND sku <> ''
    GROUP BY sku`;

  const sqlStock = `
    SELECT default_code AS sku, SUM(qty_available) AS stock, MAX(name) AS name
    FROM odoo_products
    WHERE default_code IS NOT NULL AND default_code <> ''
    GROUP BY default_code`;

  const sqlEnCamino = `
    SELECT sku, SUM(cantidad) AS en_camino
    FROM productos_en_camino
    WHERE sku IS NOT NULL AND sku <> ''
    GROUP BY sku`;

  const [ventasRows, stockRows, caminoRows] = await Promise.all([
    msQuery(sqlVentas, 45000),
    msQuery(sqlStock),
    msQuery(sqlEnCamino),
  ]);

  // Agregación por código PADRE (base).
  type Agg = { actual: number; mes: number; anio: number };
  const ventas = new Map<string, Agg>();
  for (const r of ventasRows) {
    const sku = String(r.sku);
    if (!/^\d/.test(sku)) continue; // solo SKUs "de producto"
    const b = baseCode(sku);
    const a = ventas.get(b) ?? { actual: 0, mes: 0, anio: 0 };
    a.actual += num(r.actual);
    a.mes += num(r.mes);
    a.anio += num(r.anio);
    ventas.set(b, a);
  }

  // Stock por código padre: suma de las variantes; null solo si ninguna tenía dato.
  const stock = new Map<string, { stock: number; hasStock: boolean; name: string | null }>();
  for (const r of stockRows) {
    const b = baseCode(String(r.sku));
    const prev = stock.get(b) ?? { stock: 0, hasStock: false, name: null };
    const st = numOrNull(r.stock);
    if (st !== null) {
      prev.stock += st;
      prev.hasStock = true;
    }
    if (!prev.name && r.name) prev.name = String(r.name);
    stock.set(b, prev);
  }

  const camino = new Map<string, number>();
  for (const r of caminoRows) {
    const b = baseCode(String(r.sku));
    camino.set(b, (camino.get(b) ?? 0) + num(r.en_camino));
  }

  const inputs: RotacionInput[] = [];
  let anioTotal = 0;
  for (const [codigo, v] of ventas) {
    anioTotal += v.anio;
    const st = stock.get(codigo);
    inputs.push({
      codigo,
      titulo: st?.name ?? null,
      ventaActual: v.actual,
      ventaMesPasado: v.mes,
      ventaAnioPasado: v.anio,
      stock: st ? (st.hasStock ? st.stock : null) : null,
      enCamino: camino.get(codigo) ?? 0,
    });
  }

  const items = scoreRotacion(inputs, params);
  return {
    key: SIN_ROTACION_KEY,
    generadoEn: now.toISOString(),
    ventana: w,
    hayDatosAnioPasado: anioTotal > 0,
    params,
    items,
    summary: summarizeRotacion(items),
  };
}

/** Config guardada del reporte (o defaults) desde Prisma. */
export async function getSinRotacionConfig() {
  const cfg = await prisma.reportConfig.findUnique({ where: { key: SIN_ROTACION_KEY } });
  return { params: normalizeRotacionParams((cfg?.params as Partial<RotacionParams> | null) ?? null) };
}
