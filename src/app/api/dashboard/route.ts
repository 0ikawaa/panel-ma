import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { msQuery } from "@/lib/mundoshop";

export const dynamic = "force-dynamic";

// Primer día del mes, n meses atrás (YYYY-MM-DD), en horario local.
function firstOfMonthAgo(n: number): string {
  const d = new Date();
  const first = new Date(d.getFullYear(), d.getMonth() - n, 1);
  const off = first.getTimezoneOffset();
  return new Date(first.getTime() - off * 60000).toISOString().slice(0, 10);
}

/**
 * GET /api/dashboard
 * Métricas de Importaciones + tendencia de facturación (6 meses) para el panorama
 * general. Ventas y Reposición del mes los toma el cliente de /api/resumen y
 * /api/reposicion.
 */
export async function GET() {
  let contenedores: number;
  let productAgg: { _count: { _all: number }; _sum: { cbmTotal: number | null } };
  let transito: { _count: { _all: number }; _sum: { totalPrice: number | null } };
  let proximo: { name: string; eta: Date | null } | null;
  try {
    [contenedores, productAgg, transito, proximo] = await Promise.all([
      prisma.container.count(),
      prisma.product.aggregate({ _count: { _all: true }, _sum: { cbmTotal: true } }),
      prisma.container.aggregate({
        where: { receivedAt: null },
        _count: { _all: true },
        _sum: { totalPrice: true },
      }),
      prisma.container.findFirst({
        where: { receivedAt: null, eta: { gte: new Date() } },
        orderBy: { eta: "asc" },
        select: { name: true, eta: true },
      }),
    ]);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || "Error de base de datos" }, { status: 502 });
  }

  // "En camino" + tendencia vienen de la API externa; si está caída, no rompe el resto.
  let enCaminoSkus = 0;
  let enCaminoUnidades = 0;
  let trend: { month: string; facturado: number }[] = [];
  const desde6 = firstOfMonthAgo(5); // incluye el mes actual + 5 previos
  try {
    const [camino, serie] = await Promise.all([
      msQuery(
        "SELECT COUNT(DISTINCT sku) skus, SUM(cantidad) unidades FROM productos_en_camino WHERE sku IS NOT NULL AND sku <> ''",
      ),
      // Facturación total por mes (ML sin canceladas + POS + Sale sin Mateo Alpuy).
      msQuery(`
        SELECT month, SUM(amount) facturado FROM (
          SELECT substr(date_created,1,7) month, total_amount amount
          FROM ml_orders WHERE status <> 'cancelled' AND substr(date_created,1,10) >= '${desde6}'
          UNION ALL
          SELECT substr(date_order,1,7), amount_total
          FROM odoo_pos_orders WHERE state <> 'cancel' AND substr(date_order,1,10) >= '${desde6}'
          UNION ALL
          SELECT substr(date_order,1,7), amount_total
          FROM odoo_sale_orders
          WHERE state = 'sale' AND (salesman_name IS NULL OR salesman_name <> 'Mateo Alpuy')
            AND substr(date_order,1,10) >= '${desde6}'
        )
        GROUP BY month ORDER BY month`),
    ]);
    const r = camino[0] ?? {};
    enCaminoSkus = Number(r.skus) || 0;
    enCaminoUnidades = Number(r.unidades) || 0;
    trend = serie.map((x) => ({ month: String(x.month), facturado: Number(x.facturado) || 0 }));
  } catch {
    /* API externa no disponible */
  }

  return NextResponse.json({
    contenedores,
    items: productAgg._count._all,
    cbmTotal: productAgg._sum.cbmTotal ?? 0,
    transitoCount: transito._count._all,
    transitoValorUSD: transito._sum.totalPrice ?? 0,
    enCaminoSkus,
    enCaminoUnidades,
    proximoArribo: proximo ? { name: proximo.name, eta: proximo.eta } : null,
    trend,
    syncedAt: new Date().toISOString(),
  });
}
