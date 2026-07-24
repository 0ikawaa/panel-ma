import { NextResponse } from "next/server";
import { computeSinRotacion, getSinRotacionConfig } from "@/lib/rotacion.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// GET /api/reportes/sin-rotacion → genera el reporte en vivo con la config guardada.
export async function GET() {
  try {
    const { params } = await getSinRotacionConfig();
    const report = await computeSinRotacion(params);
    return NextResponse.json({ report, config: { params } });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message || "No se pudo generar el reporte." },
      { status: 502 },
    );
  }
}
