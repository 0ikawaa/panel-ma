import { NextResponse } from "next/server";
import { computeVentasAceleradas, getVentasAceleradasConfig } from "@/lib/reportes.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/reportes/ventas-aceleradas
// Genera el reporte en vivo (sin persistir ni enviar) usando la config guardada.
export async function GET() {
  try {
    const cfg = await getVentasAceleradasConfig();
    const report = await computeVentasAceleradas(cfg.params);
    return NextResponse.json({
      report,
      config: { enabled: cfg.enabled, whatsappTo: cfg.whatsappTo, params: cfg.params },
    });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message || "No se pudo generar el reporte." },
      { status: 502 },
    );
  }
}
