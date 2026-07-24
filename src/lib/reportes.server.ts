// Parte del reporte que toca red/base de datos (MUNDO SHOP + Prisma).
// Separada de `reportes.ts` para que la lógica pura siga siendo testeable.

import { prisma } from "@/lib/prisma";
import { msQuery } from "@/lib/mundoshop";
import {
  VENTAS_ACELERADAS_KEY,
  scoreVentasAceleradas,
  summarize,
  computeWindows,
  normalizeParams,
  reportToText,
  type VentasAceleradasParams,
  type VentasAceleradasInput,
  type VentasAceleradasReport,
} from "@/lib/reportes";
import { parseRecipients, sendReporteWhatsApp } from "@/lib/whatsapp";

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Consulta los datos en vivo (MUNDO SHOP + stock + en camino) y arma el reporte
 * completo de ventas aceleradas.
 */
export async function computeVentasAceleradas(
  params: VentasAceleradasParams,
  now: Date = new Date(),
): Promise<VentasAceleradasReport> {
  const w = computeWindows(params, now);

  // Ventas por SKU divididas en dos ventanas (reciente vs histórica previa),
  // unificando canales igual que /api/reposicion: ML real + Odoo POS (local) +
  // Odoo Sale sin "Mateo Alpuy" (espejo de ML, se excluye para no duplicar).
  const sqlVentas = `
    SELECT sku,
      SUM(CASE WHEN d >= '${w.recienteDesde}' THEN units ELSE 0 END) AS rec,
      SUM(CASE WHEN d <  '${w.recienteDesde}' THEN units ELSE 0 END) AS base
    FROM (
      SELECT oi.item_sku AS sku, oi.quantity AS units, substr(o.date_created,1,10) AS d
      FROM ml_orders o JOIN ml_order_items oi ON oi.order_id = o.id
      WHERE o.status <> 'cancelled'
        AND substr(o.date_created,1,10) >= '${w.baseDesde}' AND substr(o.date_created,1,10) <= '${w.recienteHasta}'
      UNION ALL
      SELECT pr.default_code AS sku, l.qty AS units, substr(o.date_order,1,10) AS d
      FROM odoo_pos_orders o JOIN odoo_pos_order_lines l ON l.order_id = o.id
      LEFT JOIN odoo_products pr ON pr.id = l.product_id
      WHERE o.state <> 'cancel'
        AND substr(o.date_order,1,10) >= '${w.baseDesde}' AND substr(o.date_order,1,10) <= '${w.recienteHasta}'
      UNION ALL
      SELECT pr.default_code AS sku, l.product_uom_qty AS units, substr(o.date_order,1,10) AS d
      FROM odoo_sale_orders o JOIN odoo_sale_order_lines l ON l.order_id = o.id
      LEFT JOIN odoo_products pr ON pr.id = l.product_id
      WHERE o.state = 'sale' AND (o.salesman_name IS NULL OR o.salesman_name <> 'Mateo Alpuy')
        AND substr(o.date_order,1,10) >= '${w.baseDesde}' AND substr(o.date_order,1,10) <= '${w.recienteHasta}'
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
    msQuery(sqlVentas),
    msQuery(sqlStock),
    msQuery(sqlEnCamino),
  ]);

  const stockMap = new Map<string, { stock: number | null; name: string | null }>();
  for (const r of stockRows) {
    stockMap.set(String(r.sku), { stock: numOrNull(r.stock), name: r.name ? String(r.name) : null });
  }
  const caminoMap = new Map<string, number>();
  for (const r of caminoRows) caminoMap.set(String(r.sku), num(r.en_camino));

  const inputs: VentasAceleradasInput[] = [];
  for (const v of ventasRows) {
    const sku = String(v.sku);
    // Igual que reposición: solo SKUs "de producto" (empiezan con dígito).
    if (!/^\d/.test(sku)) continue;
    const st = stockMap.get(sku);
    inputs.push({
      sku,
      titulo: st?.name ?? null,
      unidadesRecientes: num(v.rec),
      unidadesBase: num(v.base),
      stock: st ? st.stock : null,
      enCamino: caminoMap.get(sku) ?? 0,
    });
  }

  const items = scoreVentasAceleradas(inputs, params);
  return {
    key: VENTAS_ACELERADAS_KEY,
    generadoEn: now.toISOString(),
    ventana: w,
    params,
    items,
    summary: summarize(items),
  };
}

/** Config guardada del reporte (o defaults) desde Prisma + fallback de .env. */
export async function getVentasAceleradasConfig() {
  const cfg = await prisma.reportConfig.findUnique({ where: { key: VENTAS_ACELERADAS_KEY } });
  const params = normalizeParams((cfg?.params as Partial<VentasAceleradasParams> | null) ?? null);
  const envTo = (process.env.REPORT_WHATSAPP_TO || "").trim();
  return {
    enabled: cfg?.enabled ?? true,
    whatsappTo: (cfg?.whatsappTo ?? envTo) || null,
    params,
  };
}

/** La última corrida persistida del reporte (o null si nunca se corrió). */
export async function getLatestVentasAceleradasRun() {
  return prisma.reportRun.findFirst({
    where: { reportKey: VENTAS_ACELERADAS_KEY },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Corre el reporte, guarda la corrida y (si corresponde) lo manda por WhatsApp.
 * Lo usan tanto el botón manual como el cron diario.
 * @param trigger "manual" | "cron"
 * @param opts.send  false para no enviar (solo generar y guardar)
 */
export async function runAndDeliverVentasAceleradas(
  trigger: "manual" | "cron",
  opts: { send?: boolean } = {},
) {
  const cfg = await getVentasAceleradasConfig();
  const report = await computeVentasAceleradas(cfg.params);

  // Enviar por WhatsApp salvo que se pida lo contrario. En el cron, además,
  // respetamos el flag "enabled" y evitamos mandar cuando no hay nada en riesgo.
  let whatsapp: { status: string; to: string | null } = { status: "skipped:no-enviado", to: null };
  const shouldSend = opts.send !== false;
  const nadaQueAvisar = trigger === "cron" && report.summary.total === 0;
  if (shouldSend && cfg.enabled && !nadaQueAvisar) {
    const recipients = parseRecipients(cfg.whatsappTo);
    const res = await sendReporteWhatsApp(recipients, reportToText(report));
    whatsapp = { status: res.status, to: res.to };
  } else if (nadaQueAvisar) {
    whatsapp = { status: "skipped:sin-riesgo", to: null };
  } else if (!cfg.enabled) {
    whatsapp = { status: "skipped:deshabilitado", to: null };
  }

  const run = await prisma.reportRun.create({
    data: {
      reportKey: VENTAS_ACELERADAS_KEY,
      trigger,
      items: report.items as unknown as object,
      summary: report.summary as unknown as object,
      whatsappStatus: whatsapp.status,
      whatsappTo: whatsapp.to,
    },
  });

  return { report, run, whatsapp };
}
