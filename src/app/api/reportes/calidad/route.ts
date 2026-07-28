import { NextResponse } from "next/server";
import { computeCalidad } from "@/lib/calidad.server";
import { cachearConTtl } from "@/lib/cache";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

// Armar este reporte son cientos de llamadas a MercadoLibre (el detalle de cada
// publicación activa) y más de un minuto de espera, así que el resultado se
// reusa un rato. El botón «Actualizar» de la pantalla manda `forzar=1` y lo
// rehace igual: si alguien lo aprieta es porque quiere los datos de ahora.
const TTL_MS = 15 * 60 * 1000;

const calidadCacheada = cachearConTtl(computeCalidad, { ttlMs: TTL_MS });

// GET /api/reportes/calidad[?forzar=1] → evalúa la calidad de las publicaciones activas.
export async function GET(req: Request) {
  const forzar = new URL(req.url).searchParams.get("forzar") === "1";
  try {
    const report = await calidadCacheada({ forzar });
    return NextResponse.json({ report, generadoHaceMs: calidadCacheada.edadMs() });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message || "No se pudo generar el reporte." },
      { status: 502 },
    );
  }
}
