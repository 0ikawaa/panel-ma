// Parte del reporte "Sin rotación" que toca red/base de datos.
// La lógica pura (scoring, meses) está en `rotacion.ts`.
//
// Compara ventas por CÓDIGO PADRE en tres meses calendario (último mes cerrado,
// mes anterior, mismo mes del año pasado). Cada mes se toma de UNA fuente:
//  - meses recientes (posteriores al histórico importado) → MUNDO SHOP en vivo,
//  - meses viejos → tabla VentaHistorica (export Zureo/Odoo).
// Así, al cambiar el mes, las ventanas avanzan solas y los datos recientes salen
// siempre frescos de MUNDO SHOP.

import { prisma } from "@/lib/prisma";
import { msQuery } from "@/lib/mundoshop";
import {
  SIN_ROTACION_KEY,
  scoreRotacion,
  summarizeRotacion,
  rotacionMeses,
  monthRange,
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

// Suma unidades por (código padre) → mes, en un mapa acumulador.
type MonthlyMap = Map<string, Map<string, number>>;
function addUnits(map: MonthlyMap, code: string, mes: string, qty: number) {
  const base = baseCode(code);
  if (!/^\d/.test(base)) return; // solo SKUs "de producto"
  let byMes = map.get(base);
  if (!byMes) {
    byMes = new Map();
    map.set(base, byMes);
  }
  byMes.set(mes, (byMes.get(mes) ?? 0) + qty);
}

/** Ventas mensuales en vivo (MUNDO SHOP) por SKU, para los meses indicados. */
async function ventasLive(meses: string[]): Promise<{ code: string; mes: string; qty: number }[]> {
  if (meses.length === 0) return [];
  const ranges = meses.map((m) => ({ m, ...monthRange(m) }));
  const minDesde = ranges.reduce((a, r) => (r.desde < a ? r.desde : a), ranges[0].desde);
  const maxHasta = ranges.reduce((a, r) => (r.hasta > a ? r.hasta : a), ranges[0].hasta);
  const caseCols = ranges
    .map((r, i) => `SUM(CASE WHEN d >= '${r.desde}' AND d <= '${r.hasta}' THEN units ELSE 0 END) AS m${i}`)
    .join(", ");

  const sql = `
    SELECT sku, ${caseCols}
    FROM (
      SELECT oi.item_sku AS sku, oi.quantity AS units, substr(o.date_created,1,10) AS d
      FROM ml_orders o JOIN ml_order_items oi ON oi.order_id = o.id
      WHERE o.status <> 'cancelled' AND substr(o.date_created,1,10) >= '${minDesde}' AND substr(o.date_created,1,10) <= '${maxHasta}'
      UNION ALL
      SELECT pr.default_code AS sku, l.qty AS units, substr(o.date_order,1,10) AS d
      FROM odoo_pos_orders o JOIN odoo_pos_order_lines l ON l.order_id = o.id
      LEFT JOIN odoo_products pr ON pr.id = l.product_id
      WHERE o.state <> 'cancel' AND substr(o.date_order,1,10) >= '${minDesde}' AND substr(o.date_order,1,10) <= '${maxHasta}'
      UNION ALL
      SELECT pr.default_code AS sku, l.product_uom_qty AS units, substr(o.date_order,1,10) AS d
      FROM odoo_sale_orders o JOIN odoo_sale_order_lines l ON l.order_id = o.id
      LEFT JOIN odoo_products pr ON pr.id = l.product_id
      WHERE o.state = 'sale' AND (o.salesman_name IS NULL OR o.salesman_name <> 'Mateo Alpuy')
        AND substr(o.date_order,1,10) >= '${minDesde}' AND substr(o.date_order,1,10) <= '${maxHasta}'
    )
    WHERE sku IS NOT NULL AND sku <> ''
    GROUP BY sku`;

  const rows = await msQuery(sql, 45000);
  const out: { code: string; mes: string; qty: number }[] = [];
  for (const r of rows) {
    const code = String(r.sku);
    ranges.forEach((rg, i) => {
      const q = num(r[`m${i}`]);
      if (q !== 0) out.push({ code, mes: rg.m, qty: q });
    });
  }
  return out;
}

export async function computeSinRotacion(
  params: RotacionParams,
  now: Date = new Date(),
): Promise<RotacionReport> {
  const meses = rotacionMeses(now);
  const targetMonths = [meses.actual, meses.mesPasado, meses.anioPasado];

  // Hasta qué mes llega el histórico importado (define el corte hist/live).
  const maxHist = await prisma.ventaHistorica.findFirst({
    orderBy: { mes: "desc" },
    select: { mes: true },
  });
  const jsonMax = maxHist?.mes ?? "0000-00";

  const histMonths = targetMonths.filter((m) => m <= jsonMax);
  const liveMonths = targetMonths.filter((m) => m > jsonMax);

  // Datos de ventas: histórico (Prisma) + live (MUNDO SHOP) + stock + en camino.
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

  const [histRows, liveRows, stockRows, caminoRows] = await Promise.all([
    histMonths.length
      ? prisma.ventaHistorica.findMany({
          where: { mes: { in: histMonths } },
          select: { code: true, mes: true, qty: true },
        })
      : Promise.resolve([] as { code: string; mes: string; qty: number }[]),
    ventasLive(liveMonths),
    msQuery(sqlStock),
    msQuery(sqlEnCamino),
  ]);

  // Ventas mensuales por código padre.
  const monthly: MonthlyMap = new Map();
  for (const r of histRows) addUnits(monthly, r.code, r.mes, r.qty);
  for (const r of liveRows) addUnits(monthly, r.code, r.mes, r.qty);

  // Stock por código padre (suma de variantes; null si ninguna tenía dato).
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
  for (const [codigo, byMes] of monthly) {
    const ventaAnioPasado = byMes.get(meses.anioPasado) ?? 0;
    anioTotal += ventaAnioPasado;
    const st = stock.get(codigo);
    inputs.push({
      codigo,
      titulo: st?.name ?? null,
      ventaActual: byMes.get(meses.actual) ?? 0,
      ventaMesPasado: byMes.get(meses.mesPasado) ?? 0,
      ventaAnioPasado,
      stock: st ? (st.hasStock ? st.stock : null) : null,
      enCamino: camino.get(codigo) ?? 0,
    });
  }

  const items = scoreRotacion(inputs, params);
  return {
    key: SIN_ROTACION_KEY,
    generadoEn: now.toISOString(),
    meses,
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
