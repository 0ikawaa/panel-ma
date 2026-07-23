import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { msQuery } from "@/lib/mundoshop";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const LIMIT = 50000;

// IVA uruguayo. Solo se aplica al costo de Odoo (standard_price viene sin IVA);
// los overrides manuales ya son costos finales. Mismo criterio que /api/resumen.
const IVA = 1.22;

// "Mateo Alpuy" es el usuario automático de MercadoLibre en Odoo: sus Sale
// Orders son el espejo de ML, así que se excluyen para no duplicar unidades.
const ML_SALESMAN = "Mateo Alpuy";
const MAYORISTA_SALESMEN = ["Gustavo Bauza", "Omar Iglesias", "Rodrigo Ruiz"];

type Canal = "ml" | "mayorista" | "otros" | "local";

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

type Acc = {
  sku: string;
  titulo: string | null;
  unidades: number;
  ingreso: number; // venta con IVA atribuible al SKU
  comision: number; // fee de ML prorrateado por línea
  porCanal: Record<Canal, number>; // ingreso por canal
};

/**
 * GET /api/rentabilidad?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
 *
 * Rentabilidad por SKU: cruza las ventas de todos los canales a nivel de línea
 * (no de orden, como hace /api/resumen) contra el costo unitario vigente, y
 * suma el stock actual para detectar mercadería parada.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const desde = url.searchParams.get("desde") || "";
  const hasta = url.searchParams.get("hasta") || "";
  if (!DATE_RE.test(desde) || !DATE_RE.test(hasta)) {
    return NextResponse.json({ error: "Fechas inválidas (formato YYYY-MM-DD)" }, { status: 400 });
  }

  const quote = (s: string) => `'${s.replace(/'/g, "''")}'`;

  // ML: el precio de ML ya es final (con IVA). La comisión es por orden, así que
  // se prorratea entre los ítems según cuánto aporta cada uno a la venta.
  const sqlMl = `
    SELECT o.id AS order_id, o.marketplace_fee AS fee,
           oi.item_sku AS sku, oi.item_title AS titulo,
           oi.quantity AS qty, oi.unit_price AS price
    FROM ml_orders o
    JOIN ml_order_items oi ON oi.order_id = o.id
    WHERE o.status <> 'cancelled'
      AND substr(o.date_created,1,10) >= '${desde}'
      AND substr(o.date_created,1,10) <= '${hasta}'
    LIMIT ${LIMIT}`;

  // Odoo (mayorista + otros): las líneas no traen default_code, se mapea por
  // product_id. `price_subtotal` es neto (ya con el descuento aplicado); se pasa
  // a "con IVA" con la relación real de cada orden (amount_total / amount_untaxed),
  // así el total por SKU cierra con la facturación del Resumen.
  const sqlSale = `
    SELECT pr.default_code AS sku, pr.name AS titulo,
           l.product_uom_qty AS qty, l.price_subtotal AS sub,
           o.amount_total AS tot, o.amount_untaxed AS unt,
           o.salesman_name AS salesman
    FROM odoo_sale_orders o
    JOIN odoo_sale_order_lines l ON l.order_id = o.id
    LEFT JOIN odoo_products pr ON pr.id = l.product_id
    WHERE o.state = 'sale'
      AND (o.salesman_name IS NULL OR o.salesman_name <> ${quote(ML_SALESMAN)})
      AND substr(o.date_order,1,10) >= '${desde}'
      AND substr(o.date_order,1,10) <= '${hasta}'
    LIMIT ${LIMIT}`;

  // Local (POS): mismo criterio; el neto sale de amount_total − amount_tax.
  const sqlPos = `
    SELECT pr.default_code AS sku, pr.name AS titulo,
           l.qty AS qty, l.price_subtotal AS sub,
           o.amount_total AS tot, o.amount_tax AS tax
    FROM odoo_pos_orders o
    JOIN odoo_pos_order_lines l ON l.order_id = o.id
    LEFT JOIN odoo_products pr ON pr.id = l.product_id
    WHERE o.state <> 'cancel'
      AND substr(o.date_order,1,10) >= '${desde}'
      AND substr(o.date_order,1,10) <= '${hasta}'
    LIMIT ${LIMIT}`;

  // Catálogo: stock actual, título, categoría y costo de Odoo por SKU.
  const sqlProductos = `
    SELECT default_code AS sku, SUM(qty_available) AS stock,
           MAX(name) AS name, MAX(categ_name) AS categ,
           MIN(standard_price) AS odoo_cost
    FROM odoo_products
    WHERE default_code IS NOT NULL AND default_code <> ''
    GROUP BY default_code`;

  // Overrides de costo que vive en la propia API (además de los nuestros en Neon).
  const sqlOverrides = `SELECT sku, cost FROM cost_overrides LIMIT ${LIMIT}`;

  let mlRows: Record<string, unknown>[];
  let saleRows: Record<string, unknown>[];
  let posRows: Record<string, unknown>[];
  let prodRows: Record<string, unknown>[];
  let apiOv: Record<string, unknown>[];
  let neonOv: { sku: string; cost: number }[];
  try {
    [mlRows, saleRows, posRows, prodRows, apiOv, neonOv] = await Promise.all([
      msQuery(sqlMl),
      msQuery(sqlSale),
      msQuery(sqlPos),
      msQuery(sqlProductos),
      msQuery(sqlOverrides),
      prisma.costOverride.findMany({ select: { sku: true, cost: true } }),
    ]);
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message || "No se pudieron obtener las ventas." },
      { status: 502 },
    );
  }

  // ---------- Costo unitario vigente por SKU ----------
  // Prioridad: override local (Neon) > override de la API > Odoo × IVA.
  const neonMap = new Map(neonOv.map((o) => [o.sku, o.cost]));
  const apiMap = new Map<string, number>();
  for (const r of apiOv) {
    const c = num(r.cost);
    if (r.sku && c != null) apiMap.set(String(r.sku), c);
  }

  const catalogo = new Map<
    string,
    { stock: number; name: string | null; categ: string | null; odooCost: number | null }
  >();
  for (const r of prodRows) {
    catalogo.set(String(r.sku), {
      stock: num(r.stock) ?? 0,
      name: r.name ? String(r.name) : null,
      categ: r.categ ? String(r.categ) : null,
      odooCost: num(r.odoo_cost),
    });
  }

  function costoUnitario(sku: string): number | null {
    if (neonMap.has(sku)) return neonMap.get(sku)!;
    if (apiMap.has(sku)) return apiMap.get(sku)!;
    const odoo = catalogo.get(sku)?.odooCost ?? null;
    return odoo != null && odoo > 0 ? odoo * IVA : null;
  }

  // ---------- Acumulación por SKU ----------
  const acc = new Map<string, Acc>();
  function get(sku: string, titulo: string | null): Acc {
    let a = acc.get(sku);
    if (!a) {
      a = {
        sku,
        titulo,
        unidades: 0,
        ingreso: 0,
        comision: 0,
        porCanal: { ml: 0, mayorista: 0, otros: 0, local: 0 },
      };
      acc.set(sku, a);
    }
    if (!a.titulo && titulo) a.titulo = titulo;
    return a;
  }

  function add(sku: string, titulo: string | null, canal: Canal, qty: number, ingreso: number) {
    const a = get(sku, titulo);
    a.unidades += qty;
    a.ingreso += ingreso;
    a.porCanal[canal] += ingreso;
  }

  // ML — primero el ingreso por orden para poder prorratear la comisión.
  const ventaPorOrden = new Map<string, number>();
  for (const r of mlRows) {
    const v = (num(r.qty) ?? 0) * (num(r.price) ?? 0);
    const id = String(r.order_id);
    ventaPorOrden.set(id, (ventaPorOrden.get(id) ?? 0) + v);
  }
  for (const r of mlRows) {
    const sku = r.sku ? String(r.sku) : "";
    if (!sku) continue;
    const qty = num(r.qty) ?? 0;
    const ingreso = qty * (num(r.price) ?? 0);
    add(sku, r.titulo ? String(r.titulo) : null, "ml", qty, ingreso);

    const totalOrden = ventaPorOrden.get(String(r.order_id)) ?? 0;
    const fee = num(r.fee) ?? 0;
    if (fee && totalOrden > 0) {
      get(sku, null).comision += fee * (ingreso / totalOrden);
    }
  }

  // Odoo mayorista / otros (se separan acá, no en SQL, para leer las líneas una sola vez).
  const esMayorista = new Set(MAYORISTA_SALESMEN);
  for (const r of saleRows) {
    const sku = r.sku ? String(r.sku) : "";
    if (!sku) continue;
    const sub = num(r.sub) ?? 0;
    const tot = num(r.tot);
    const unt = num(r.unt);
    // Relación con IVA real de la orden; si no se puede calcular, 22%.
    const factor = tot != null && unt != null && unt > 0 ? tot / unt : IVA;
    const salesman = r.salesman ? String(r.salesman) : "";
    const canal: Canal = esMayorista.has(salesman) ? "mayorista" : "otros";
    add(sku, r.titulo ? String(r.titulo) : null, canal, num(r.qty) ?? 0, sub * factor);
  }

  // Local (POS).
  for (const r of posRows) {
    const sku = r.sku ? String(r.sku) : "";
    if (!sku) continue;
    const sub = num(r.sub) ?? 0;
    const tot = num(r.tot) ?? 0;
    const tax = num(r.tax) ?? 0;
    const neto = tot - tax;
    const factor = neto > 0 ? tot / neto : IVA;
    add(sku, r.titulo ? String(r.titulo) : null, "local", num(r.qty) ?? 0, sub * factor);
  }

  // ---------- Filas finales ----------
  const rows = Array.from(acc.values()).map((a) => {
    const cat = catalogo.get(a.sku);
    const cu = costoUnitario(a.sku);
    const costo = cu != null ? cu * a.unidades : null;
    const margen = costo != null ? a.ingreso - costo - a.comision : null;
    return {
      sku: a.sku,
      titulo: a.titulo ?? cat?.name ?? null,
      categoria: cat?.categ ?? null,
      unidades: a.unidades,
      ingreso: a.ingreso,
      costoUnitario: cu,
      costo,
      comision: a.comision,
      margen,
      pct: margen != null && a.ingreso > 0 ? margen / a.ingreso : null,
      stock: cat?.stock ?? null,
      porCanal: a.porCanal,
    };
  });

  // Stock muerto: hay unidades en depósito pero no se vendió nada en el rango.
  const vendidos = new Set(acc.keys());
  const stockMuerto = Array.from(catalogo.entries())
    .filter(([sku, c]) => c.stock > 0 && !vendidos.has(sku))
    .map(([sku, c]) => {
      const cu = costoUnitario(sku);
      return {
        sku,
        titulo: c.name,
        categoria: c.categ,
        stock: c.stock,
        costoUnitario: cu,
        inmovilizado: cu != null ? cu * c.stock : null,
      };
    })
    .sort((a, b) => (b.inmovilizado ?? 0) - (a.inmovilizado ?? 0));

  return NextResponse.json({
    desde,
    hasta,
    rows,
    stockMuerto,
    truncated:
      mlRows.length >= LIMIT || saleRows.length >= LIMIT || posRows.length >= LIMIT,
    syncedAt: new Date().toISOString(),
  });
}
