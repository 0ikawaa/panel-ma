import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { msQuery } from "@/lib/mundoshop";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const LIMIT = 50000;

// IVA uruguayo. Se aplica SOLO al costo de Odoo (standard_price sin IVA), igual
// criterio que Órdenes ML. Los overrides manuales ya son costos finales.
const IVA = 1.22;

// Vendedores de Odoo que corresponden al canal Mayorista (confirmado por el
// usuario).
const MAYORISTA_SALESMEN = ["Gustavo Bauza", "Omar Iglesias", "Rodrigo Ruiz"];
// "Mateo Alpuy" es el usuario automático de MercadoLibre: sus Sale Orders son el
// espejo de ML, así que se excluyen (ML ya se cuenta desde ml_orders).
const ML_SALESMAN = "Mateo Alpuy";
// "Otros canales" = resto de las Sale Orders (ni ML, ni Mayorista): WhatsApp,
// atención al cliente, etc. Todo lo que se factura por fuera de esos usuarios.
const OTROS_EXCLUDE = [ML_SALESMAN, ...MAYORISTA_SALESMEN];

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Costo unitario efectivo de un SKU: override local (Neon) > override API > Odoo×IVA.
function unitCost(
  sku: string,
  apiCost: number | null,
  odoo: number | null,
  neon: Map<string, number>,
): number | null {
  if (sku && neon.has(sku)) return neon.get(sku)!;
  if (apiCost != null) return apiCost;
  if (odoo != null && odoo > 0) return odoo * IVA;
  return null;
}

type Channel = {
  ordenes: number; // órdenes totales del rango
  facturado: number; // venta total con IVA (todas las órdenes)
  ordenesConCosto: number; // órdenes con costo completo (todas sus líneas)
  ventaConCosto: number; // venta de esas órdenes (base de la rentabilidad)
  costo: number; // costo de esas órdenes (con IVA)
  comision: number; // ML: fee real de esas órdenes; otros canales: 0
  envio: number; // ML: envío neto de esas órdenes; otros canales: 0
  truncated: boolean;
};

function emptyChannel(): Channel {
  return {
    ordenes: 0,
    facturado: 0,
    ordenesConCosto: 0,
    ventaConCosto: 0,
    costo: 0,
    comision: 0,
    envio: 0,
    truncated: false,
  };
}

// Estructura intermedia por orden mientras acumulamos sus líneas.
type OrderAcc = {
  venta: number;
  comision: number;
  shippingId: string | null;
  envio: number;
  costo: number;
  hasCost: boolean;
};

/**
 * GET /api/resumen?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
 * Resumen de facturación y rentabilidad por canal de venta (ML, Mayorista, Local).
 * La comisión de tarjeta del Local y la publicidad de ML se calculan en el cliente
 * con porcentajes configurables (acá se devuelven los componentes crudos).
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const desde = url.searchParams.get("desde") || "";
  const hasta = url.searchParams.get("hasta") || "";
  if (!DATE_RE.test(desde) || !DATE_RE.test(hasta)) {
    return NextResponse.json({ error: "Fechas inválidas (formato YYYY-MM-DD)" }, { status: 400 });
  }

  // Sub-select de costo de Odoo por SKU (para ML, que trae item_sku).
  const odooBySku = `(SELECT default_code, MIN(standard_price) standard_price
                      FROM odoo_products GROUP BY default_code)`;

  const sqlMl = `
    SELECT o.id AS order_id, o.shipping_id, o.total_amount, o.marketplace_fee,
           oi.item_sku AS sku, oi.quantity AS qty,
           s.sender_cost AS ship_cost, s.sender_save AS ship_save,
           p.standard_price AS odoo_cost, co.cost AS api_cost
    FROM ml_orders o
    JOIN ml_order_items oi ON oi.order_id = o.id
    LEFT JOIN ml_shipments s ON s.id = o.shipping_id
    LEFT JOIN ${odooBySku} p ON p.default_code = oi.item_sku
    LEFT JOIN cost_overrides co ON co.sku = oi.item_sku
    WHERE substr(o.date_created,1,10) >= '${desde}'
      AND substr(o.date_created,1,10) <= '${hasta}'
    LIMIT ${LIMIT}`;

  // Mayorista, Otros y Local: las líneas de Odoo NO traen default_code (viene
  // null); el SKU y el costo se obtienen mapeando product_id → odoo_products.id.
  const quote = (s: string) => `'${s.replace(/'/g, "''")}'`;
  const salesmenList = MAYORISTA_SALESMEN.map(quote).join(",");
  const excludeList = OTROS_EXCLUDE.map(quote).join(",");
  const sqlMayorista = `
    SELECT o.id AS order_id, o.amount_total,
           l.product_uom_qty AS qty, pr.default_code AS sku,
           pr.standard_price AS odoo_cost, co.cost AS api_cost
    FROM odoo_sale_orders o
    JOIN odoo_sale_order_lines l ON l.order_id = o.id
    LEFT JOIN odoo_products pr ON pr.id = l.product_id
    LEFT JOIN cost_overrides co ON co.sku = pr.default_code
    WHERE o.state = 'sale'
      AND o.salesman_name IN (${salesmenList})
      AND substr(o.date_order,1,10) >= '${desde}'
      AND substr(o.date_order,1,10) <= '${hasta}'
    LIMIT ${LIMIT}`;

  const sqlOtros = `
    SELECT o.id AS order_id, o.amount_total,
           l.product_uom_qty AS qty, pr.default_code AS sku,
           pr.standard_price AS odoo_cost, co.cost AS api_cost
    FROM odoo_sale_orders o
    JOIN odoo_sale_order_lines l ON l.order_id = o.id
    LEFT JOIN odoo_products pr ON pr.id = l.product_id
    LEFT JOIN cost_overrides co ON co.sku = pr.default_code
    WHERE o.state = 'sale'
      AND (o.salesman_name IS NULL OR o.salesman_name NOT IN (${excludeList}))
      AND substr(o.date_order,1,10) >= '${desde}'
      AND substr(o.date_order,1,10) <= '${hasta}'
    LIMIT ${LIMIT}`;

  const sqlLocal = `
    SELECT o.id AS order_id, o.amount_total,
           l.qty AS qty, pr.default_code AS sku,
           pr.standard_price AS odoo_cost, co.cost AS api_cost
    FROM odoo_pos_orders o
    JOIN odoo_pos_order_lines l ON l.order_id = o.id
    LEFT JOIN odoo_products pr ON pr.id = l.product_id
    LEFT JOIN cost_overrides co ON co.sku = pr.default_code
    WHERE o.state != 'cancel'
      AND substr(o.date_order,1,10) >= '${desde}'
      AND substr(o.date_order,1,10) <= '${hasta}'
    LIMIT ${LIMIT}`;

  let mlRows: Record<string, unknown>[];
  let mayoRows: Record<string, unknown>[];
  let otrosRows: Record<string, unknown>[];
  let localRows: Record<string, unknown>[];
  let overrides: { sku: string; cost: number }[];
  try {
    [mlRows, mayoRows, otrosRows, localRows, overrides] = await Promise.all([
      msQuery(sqlMl),
      msQuery(sqlMayorista),
      msQuery(sqlOtros),
      msQuery(sqlLocal),
      prisma.costOverride.findMany({ select: { sku: true, cost: true } }),
    ]);
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message || "No se pudieron obtener las ventas." },
      { status: 502 },
    );
  }

  const neon = new Map(overrides.map((o) => [o.sku, o.cost]));

  // Agrega filas (una por línea/ítem) en un canal, agrupando por orden.
  function aggregate(
    rows: Record<string, unknown>[],
    opts: { withShipping: boolean },
  ): Channel {
    const byOrder = new Map<string, OrderAcc>();
    for (const r of rows) {
      const orderId = String(r.order_id);
      let o = byOrder.get(orderId);
      if (!o) {
        const shipCost = num(r.ship_cost);
        const shipSave = num(r.ship_save);
        o = {
          venta: num(r.total_amount ?? r.amount_total) ?? 0,
          comision: num(r.marketplace_fee) ?? 0,
          shippingId: r.shipping_id ? String(r.shipping_id) : null,
          // Envío neto = bonificación − costo (mismo criterio que Órdenes ML).
          envio: opts.withShipping ? (shipSave ?? 0) - (shipCost ?? 0) : 0,
          costo: 0,
          hasCost: true,
        };
        byOrder.set(orderId, o);
      }
      const sku = r.sku ? String(r.sku) : "";
      const qty = num(r.qty) ?? 0;
      const uc = unitCost(sku, num(r.api_cost), num(r.odoo_cost), neon);
      if (uc == null) o.hasCost = false;
      else o.costo += uc * qty;
    }

    const ch = emptyChannel();
    const countedShip = new Set<string>();
    for (const o of byOrder.values()) {
      ch.ordenes += 1;
      ch.facturado += o.venta;
      if (o.hasCost) {
        ch.ordenesConCosto += 1;
        ch.ventaConCosto += o.venta;
        ch.costo += o.costo;
        ch.comision += o.comision;
        // El envío de un pack se comparte (mismo shipping_id): contarlo una vez.
        if (o.shippingId) {
          if (!countedShip.has(o.shippingId)) {
            countedShip.add(o.shippingId);
            ch.envio += o.envio;
          }
        } else {
          ch.envio += o.envio;
        }
      }
    }
    return ch;
  }

  const ml = aggregate(mlRows, { withShipping: true });
  ml.truncated = mlRows.length >= LIMIT;
  const mayorista = aggregate(mayoRows, { withShipping: false });
  mayorista.truncated = mayoRows.length >= LIMIT;
  const otros = aggregate(otrosRows, { withShipping: false });
  otros.truncated = otrosRows.length >= LIMIT;
  const local = aggregate(localRows, { withShipping: false });
  local.truncated = localRows.length >= LIMIT;

  return NextResponse.json({
    desde,
    hasta,
    channels: { ml, mayorista, otros, local },
    syncedAt: new Date().toISOString(),
  });
}
