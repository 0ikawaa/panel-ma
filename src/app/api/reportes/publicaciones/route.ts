import { NextResponse } from "next/server";
import { computePublicaciones, getPublicacionesConfig } from "@/lib/publicaciones.server";
import { cachearPorClave } from "@/lib/cache";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// El reporte sale caro (barre las publicaciones en vivo), así que se reusa un
// rato. La clave del cache es la configuración: si alguien cambia la ventana de
// días, lo guardado con la anterior no se toca. El botón «Actualizar» de la
// pantalla manda `forzar=1`.
const TTL_MS = 15 * 60 * 1000;

const publicacionesCacheadas = cachearPorClave(
  (clave) => computePublicaciones(JSON.parse(clave)),
  { ttlMs: TTL_MS },
);

// GET /api/reportes/publicaciones[?forzar=1] → arma el reporte con la config guardada.
export async function GET(req: Request) {
  const forzar = new URL(req.url).searchParams.get("forzar") === "1";
  try {
    const { params } = await getPublicacionesConfig();
    const report = await publicacionesCacheadas(JSON.stringify(params), { forzar });
    return NextResponse.json({ report, config: { params } });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message || "No se pudo generar el reporte." },
      { status: 502 },
    );
  }
}
