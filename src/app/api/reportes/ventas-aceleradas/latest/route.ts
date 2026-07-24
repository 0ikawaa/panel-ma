import { NextResponse } from "next/server";
import { getLatestVentasAceleradasRun, getVentasAceleradasConfig } from "@/lib/reportes.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/reportes/ventas-aceleradas/latest
// Devuelve la última corrida persistida + la config (carga rápida de la página,
// sin golpear la API externa).
export async function GET() {
  try {
    const [run, cfg] = await Promise.all([getLatestVentasAceleradasRun(), getVentasAceleradasConfig()]);
    return NextResponse.json({
      run: run
        ? {
            id: run.id,
            trigger: run.trigger,
            items: run.items,
            summary: run.summary,
            whatsappStatus: run.whatsappStatus,
            whatsappTo: run.whatsappTo,
            createdAt: run.createdAt,
          }
        : null,
      config: { enabled: cfg.enabled, whatsappTo: cfg.whatsappTo, params: cfg.params },
    });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message || "No se pudo leer el último reporte." },
      { status: 500 },
    );
  }
}
