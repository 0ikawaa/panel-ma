import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { msQuery } from "@/lib/mundoshop";

export const dynamic = "force-dynamic";

/**
 * GET /api/dashboard
 * Métricas de Importaciones para el panorama general (Dashboard): contenedores,
 * valor en tránsito, CBM y unidades en camino. Los datos de Ventas y Reposición
 * los toma el cliente de /api/resumen y /api/reposicion.
 */
export async function GET() {
  let contenedores: number;
  let productAgg: { _count: { _all: number }; _sum: { cbmTotal: number | null } };
  let transito: { _count: { _all: number }; _sum: { totalPrice: number | null } };
  try {
    [contenedores, productAgg, transito] = await Promise.all([
      prisma.container.count(),
      prisma.product.aggregate({ _count: { _all: true }, _sum: { cbmTotal: true } }),
      prisma.container.aggregate({
        where: { receivedAt: null },
        _count: { _all: true },
        _sum: { totalPrice: true },
      }),
    ]);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || "Error de base de datos" }, { status: 502 });
  }

  // "En camino" viene de la API externa; si está caída, no rompe el resto.
  let enCaminoSkus = 0;
  let enCaminoUnidades = 0;
  try {
    const rows = await msQuery(
      "SELECT COUNT(DISTINCT sku) skus, SUM(cantidad) unidades FROM productos_en_camino WHERE sku IS NOT NULL AND sku <> ''",
    );
    const r = rows[0] ?? {};
    enCaminoSkus = Number(r.skus) || 0;
    enCaminoUnidades = Number(r.unidades) || 0;
  } catch {
    /* API externa no disponible: dejamos en camino en 0 */
  }

  return NextResponse.json({
    contenedores,
    items: productAgg._count._all,
    cbmTotal: productAgg._sum.cbmTotal ?? 0,
    transitoCount: transito._count._all,
    transitoValorUSD: transito._sum.totalPrice ?? 0,
    enCaminoSkus,
    enCaminoUnidades,
    syncedAt: new Date().toISOString(),
  });
}
