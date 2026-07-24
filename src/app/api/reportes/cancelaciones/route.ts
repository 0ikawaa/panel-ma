import { NextResponse } from "next/server";
import { computeCancelaciones } from "@/lib/cancelaciones.server";
import { DEFAULT_N, type Granularidad } from "@/lib/cancelaciones";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// GET /api/reportes/cancelaciones?granularidad=semana|mes&n=12
export async function GET(req: Request) {
  const url = new URL(req.url);
  const granularidad: Granularidad = url.searchParams.get("granularidad") === "mes" ? "mes" : "semana";
  const nParam = Number(url.searchParams.get("n"));
  const n = Number.isFinite(nParam) && nParam >= 2 && nParam <= 52 ? Math.floor(nParam) : DEFAULT_N[granularidad];
  try {
    const report = await computeCancelaciones(granularidad, n);
    return NextResponse.json({ report });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message || "No se pudo generar el reporte." },
      { status: 502 },
    );
  }
}
