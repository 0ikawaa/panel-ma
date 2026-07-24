import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { SIN_ROTACION_KEY, normalizeRotacionParams } from "@/lib/rotacion";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// POST /api/reportes/sin-rotacion/config → guarda los umbrales del reporte.
// Body: { params: { ventanaDias, minUnidadesRef, caidaMin } }
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { params?: Record<string, unknown> } | null;
  if (!body?.params) return NextResponse.json({ error: "Faltan los parámetros." }, { status: 400 });

  const params = normalizeRotacionParams(body.params) as unknown as object;
  try {
    const saved = await prisma.reportConfig.upsert({
      where: { key: SIN_ROTACION_KEY },
      create: { key: SIN_ROTACION_KEY, params },
      update: { params },
    });
    return NextResponse.json({ ok: true, config: { params: saved.params } });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message || "No se pudo guardar la config." },
      { status: 500 },
    );
  }
}
