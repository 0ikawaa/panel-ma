import { NextResponse } from "next/server";
import {
  experienciaCacheada,
  getExperienciaConfig,
  historialCapturas,
} from "@/lib/experiencia.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

// GET /api/reportes/experiencia[?forzar=1]
// Devuelve el reporte armado con la última captura del panel que se importó.
// `report` viene en null cuando todavía no hay ninguna captura: la pantalla
// muestra ahí cómo cargar la primera.
export async function GET(req: Request) {
  const forzar = new URL(req.url).searchParams.get("forzar") === "1";
  try {
    const [report, cfg, historial] = await Promise.all([
      experienciaCacheada({ forzar }),
      getExperienciaConfig(),
      historialCapturas(10).catch(() => []),
    ]);
    return NextResponse.json({
      report,
      config: { enabled: cfg.enabled, emailTo: cfg.emailTo, params: cfg.params },
      historial,
      generadoHaceMs: experienciaCacheada.edadMs(),
    });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message || "No se pudo armar el reporte." },
      { status: 502 },
    );
  }
}
