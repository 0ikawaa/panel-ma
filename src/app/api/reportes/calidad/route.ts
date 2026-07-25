import { NextResponse } from "next/server";
import { computeCalidad } from "@/lib/calidad.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

// GET /api/reportes/calidad → evalúa la calidad de las publicaciones activas en vivo.
export async function GET() {
  try {
    const report = await computeCalidad();
    return NextResponse.json({ report });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message || "No se pudo generar el reporte." },
      { status: 502 },
    );
  }
}
