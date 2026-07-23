import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { msQuery } from "@/lib/mundoshop";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const LIMIT = 5000;

// IVA uruguayo. Se aplica SOLO al costo de Odoo (standard_price sin IVA).
// Los costos manuales de cost_overrides ya son finales y se usan tal cual.
const IVA = 1.22;

type OrderItem = {
  itemId: string;
  sku: string;
  title: string;
  qty: number;
  unitPrice: number;
  baseCost: number | null; // costo unitario final: override de la API, o Odoo×IVA
  overrideCost: number | null; // override manual local (nuestra base Neon)
};

type Order = {
  orderId: string; // una fila por orden de ML (igual que el sistema de referencia)
  packId: string | null; // si pertenece a un pack (varias órdenes juntas)
  date: string;
  status: string;
  venta: number;
  comision: number;
  logisticType: string | null;
  shipCost: number | null;
  shipSave: number | null;
  envio: number;
  items: OrderItem[];
};

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * GET /api/ventas-ml?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
 * Trae las órdenes de MercadoLibre del rango, agrupadas por orden con sus ítems,
 * el costo de Odoo por SKU y el override manual local (si existe).
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const desde = url.searchParams.get("desde") || "";
  const hasta = url.searchParams.get("hasta") || "";
  if (!DATE_RE.test(desde) || !DATE_RE.test(hasta)) {
    return NextResponse.json({ error: "Fechas inválidas (formato YYYY-MM-DD)" }, { status: 400 });
  }

  // Un renglón por ítem de cada (sub)orden. Un "pack" son varias órdenes con el
  // mismo pack_id que comparten un único envío (shipping_id). El envío se cuenta
  // una sola vez por pack; venta y comisión se suman por sub-orden.
  const sql = `
    SELECT o.id AS order_id, o.pack_id, o.shipping_id, o.date_created, o.status,
           o.total_amount, o.marketplace_fee,
           oi.item_id, oi.item_sku, oi.item_title, oi.quantity, oi.unit_price,
           s.logistic_type, s.sender_cost AS ship_cost, s.sender_save AS ship_save,
           p.standard_price AS odoo_cost, co.cost AS api_cost
    FROM ml_orders o
    JOIN ml_order_items oi ON oi.order_id = o.id
    LEFT JOIN ml_shipments s ON s.id = o.shipping_id
    LEFT JOIN (SELECT default_code, MIN(standard_price) standard_price
               FROM odoo_products GROUP BY default_code) p ON p.default_code = oi.item_sku
    LEFT JOIN cost_overrides co ON co.sku = oi.item_sku
    WHERE substr(o.date_created,1,10) >= '${desde}'
      AND substr(o.date_created,1,10) <= '${hasta}'
    ORDER BY o.date_created DESC
    LIMIT ${LIMIT}`;

  let rows: Record<string, unknown>[];
  let overrides: { sku: string; cost: number }[];
  try {
    // La API externa y la base local en paralelo.
    [rows, overrides] = await Promise.all([
      msQuery(sql),
      prisma.costOverride.findMany({ select: { sku: true, cost: true } }),
    ]);
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message || "No se pudieron obtener las órdenes." },
      { status: 502 },
    );
  }

  const ovMap = new Map(overrides.map((o) => [o.sku, o.cost]));

  const byOrder = new Map<string, Order>();
  for (const r of rows) {
    const orderId = String(r.order_id);
    let o = byOrder.get(orderId);
    if (!o) {
      const sc = num(r.ship_cost);
      const sv = num(r.ship_save);
      o = {
        orderId,
        packId: r.pack_id ? String(r.pack_id) : null,
        date: String(r.date_created),
        status: String(r.status ?? ""),
        venta: num(r.total_amount) ?? 0,
        comision: num(r.marketplace_fee) ?? 0,
        logisticType: r.logistic_type ? String(r.logistic_type) : null,
        shipCost: sc,
        shipSave: sv,
        // Envío neto = bonificación − costo del envío (fórmula pendiente de ajuste).
        envio: (sv ?? 0) - (sc ?? 0),
        items: [],
      };
      byOrder.set(orderId, o);
    }

    const sku = r.item_sku ? String(r.item_sku) : "";
    // Costo unitario final (misma lógica que el sistema de referencia):
    // 1) si hay override manual en la API (cost_overrides) → se usa tal cual;
    // 2) si no, standard_price de Odoo × IVA;
    // 3) si no hay ninguno → sin costo.
    const apiCost = num(r.api_cost);
    const odooRaw = num(r.odoo_cost);
    let baseCost: number | null = null;
    if (apiCost != null) baseCost = apiCost;
    else if (odooRaw != null && odooRaw > 0) baseCost = odooRaw * IVA;

    o.items.push({
      itemId: String(r.item_id ?? ""),
      sku,
      title: r.item_title ? String(r.item_title) : "",
      qty: num(r.quantity) ?? 0,
      unitPrice: num(r.unit_price) ?? 0,
      baseCost,
      overrideCost: ovMap.has(sku) ? (ovMap.get(sku) as number) : null,
    });
  }

  const orders = Array.from(byOrder.values());
  return NextResponse.json({
    orders,
    count: orders.length,
    truncated: rows.length >= LIMIT,
    syncedAt: new Date().toISOString(),
  });
}
