import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PUBLICACIONES_KEY, normalizePublicacionesParams } from "@/lib/publicaciones";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// POST /api/reportes/publicaciones/config → guarda la ventana del análisis "sin ventas".
// Body: { params: { ventanaUnidad, ventanaCantidad } }
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { params?: Record<string, unknown> } | null;
  if (!body?.params) return NextResponse.json({ error: "Faltan los parámetros." }, { status: 400 });

  const params = normalizePublicacionesParams(body.params) as unknown as object;
  try {
    const saved = await prisma.reportConfig.upsert({
      where: { key: PUBLICACIONES_KEY },
      create: { key: PUBLICACIONES_KEY, params },
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
