import { NextResponse } from "next/server";
import { computeSinRotacion, getSinRotacionConfig } from "@/lib/rotacion.server";
import { cachearPorClave } from "@/lib/cache";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// Mismo criterio que los otros reportes en vivo: el resultado se reusa un rato y
// la clave del cache es la configuración con la que se armó. El botón
// «Actualizar» de la pantalla manda `forzar=1`.
const TTL_MS = 15 * 60 * 1000;

const sinRotacionCacheado = cachearPorClave(
  (clave) => computeSinRotacion(JSON.parse(clave)),
  { ttlMs: TTL_MS },
);

// GET /api/reportes/sin-rotacion[?forzar=1] → genera el reporte con la config guardada.
export async function GET(req: Request) {
  const forzar = new URL(req.url).searchParams.get("forzar") === "1";
  try {
    const { params } = await getSinRotacionConfig();
    const report = await sinRotacionCacheado(JSON.stringify(params), { forzar });
    return NextResponse.json({ report, config: { params } });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message || "No se pudo generar el reporte." },
      { status: 502 },
    );
  }
}
