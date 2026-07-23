import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { msQuery } from "@/lib/mundoshop";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Código base de un SKU con variante: "20105-NEG" → "20105" (para cruzar con el
// costo de origen de los contenedores, que se guarda por código base).
function baseCode(sku: string): string {
  return sku.split(/[-\s/]/)[0].trim();
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

type Row = {
  sku: string;
  titulo: string | null;
  categoria: string | null;
  vendidas: number; // unidades totales en el período (todos los canales)
  stock: number | null; // disponible actual (Odoo qty_available)
  enCamino: number; // unidades en contenedores/producción (productos_en_camino)
  costoOrigen: number | null; // FOB USD (Product.precioChina de Importaciones)
};

/**
 * GET /api/reposicion?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
 * Datos en vivo para la reposición: ventas por SKU (ML + Odoo local/mayorista/
 * otros, sin duplicar ML), stock actual, unidades en camino y costo de origen.
 * La sugerencia (meses de cobertura, descontar en camino) se calcula en el cliente.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const desde = url.searchParams.get("desde") || "";
  const hasta = url.searchParams.get("hasta") || "";
  if (!DATE_RE.test(desde) || !DATE_RE.test(hasta)) {
    return NextResponse.json({ error: "Fechas inválidas (formato YYYY-MM-DD)" }, { status: 400 });
  }

  // Ventas unificadas por SKU: ML real (ml_order_items, sin canceladas) + Odoo POS
  // (local) + Odoo Sale sin "Mateo Alpuy" (que es el espejo de ML → evita duplicar).
  const sqlVentas = `
    SELECT sku, SUM(units) vendidas FROM (
      SELECT oi.item_sku AS sku, oi.quantity AS units
      FROM ml_orders o JOIN ml_order_items oi ON oi.order_id = o.id
      WHERE o.status <> 'cancelled'
        AND substr(o.date_created,1,10) >= '${desde}' AND substr(o.date_created,1,10) <= '${hasta}'
      UNION ALL
      SELECT pr.default_code AS sku, l.qty AS units
      FROM odoo_pos_orders o JOIN odoo_pos_order_lines l ON l.order_id = o.id
      LEFT JOIN odoo_products pr ON pr.id = l.product_id
      WHERE o.state <> 'cancel'
        AND substr(o.date_order,1,10) >= '${desde}' AND substr(o.date_order,1,10) <= '${hasta}'
      UNION ALL
      SELECT pr.default_code AS sku, l.product_uom_qty AS units
      FROM odoo_sale_orders o JOIN odoo_sale_order_lines l ON l.order_id = o.id
      LEFT JOIN odoo_products pr ON pr.id = l.product_id
      WHERE o.state = 'sale' AND (o.salesman_name IS NULL OR o.salesman_name <> 'Mateo Alpuy')
        AND substr(o.date_order,1,10) >= '${desde}' AND substr(o.date_order,1,10) <= '${hasta}'
    )
    WHERE sku IS NOT NULL AND sku <> ''
    GROUP BY sku`;

  // Stock actual + título + categoría por SKU (varias filas por default_code → se suma stock).
  const sqlStock = `
    SELECT default_code AS sku, SUM(qty_available) AS stock,
           MAX(name) AS name, MAX(categ_name) AS categ
    FROM odoo_products
    WHERE default_code IS NOT NULL AND default_code <> ''
    GROUP BY default_code`;

  const sqlEnCamino = `
    SELECT sku, SUM(cantidad) AS en_camino
    FROM productos_en_camino
    WHERE sku IS NOT NULL AND sku <> ''
    GROUP BY sku`;

  let ventasRows: Record<string, unknown>[];
  let stockRows: Record<string, unknown>[];
  let campinoRows: Record<string, unknown>[];
  let productos: { codigo: string | null; precioChina: number | null }[];
  try {
    [ventasRows, stockRows, campinoRows, productos] = await Promise.all([
      msQuery(sqlVentas),
      msQuery(sqlStock),
      msQuery(sqlEnCamino),
      // Costo de origen (FOB USD) desde los contenedores de Importaciones.
      prisma.product.findMany({
        where: { codigo: { not: null }, precioChina: { not: null } },
        select: { codigo: true, precioChina: true },
        orderBy: { createdAt: "desc" },
      }),
    ]);
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message || "No se pudieron obtener los datos de reposición." },
      { status: 502 },
    );
  }

  // Mapas auxiliares.
  const stockMap = new Map<string, { stock: number | null; name: string | null; categ: string | null }>();
  for (const r of stockRows) {
    stockMap.set(String(r.sku), {
      stock: num(r.stock),
      name: r.name ? String(r.name) : null,
      categ: r.categ ? String(r.categ) : null,
    });
  }
  const campinoMap = new Map<string, number>();
  for (const r of campinoRows) campinoMap.set(String(r.sku), num(r.en_camino) ?? 0);

  // Costo de origen: el más reciente por código (productos vienen ordenados desc).
  const costoMap = new Map<string, number>();
  for (const p of productos) {
    if (p.codigo && p.precioChina != null && !costoMap.has(p.codigo)) {
      costoMap.set(p.codigo, p.precioChina);
    }
  }
  const costoDe = (sku: string): number | null => {
    if (costoMap.has(sku)) return costoMap.get(sku)!;
    const b = baseCode(sku);
    return costoMap.has(b) ? costoMap.get(b)! : null;
  };

  // Lista base: SKUs que tuvieron ventas y cuyo código empieza con dígito
  // (descarta "self_service", "drop_off", etc., igual que el módulo anterior).
  const rows: Row[] = [];
  for (const v of ventasRows) {
    const sku = String(v.sku);
    if (!/^\d/.test(sku)) continue;
    const st = stockMap.get(sku);
    rows.push({
      sku,
      titulo: st?.name ?? null,
      categoria: st?.categ ?? null,
      vendidas: num(v.vendidas) ?? 0,
      stock: st ? st.stock : null,
      enCamino: campinoMap.get(sku) ?? 0,
      costoOrigen: costoDe(sku),
    });
  }

  return NextResponse.json({ desde, hasta, rows, count: rows.length, syncedAt: new Date().toISOString() });
}
