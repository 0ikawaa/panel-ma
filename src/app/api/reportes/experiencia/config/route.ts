import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { EXPERIENCIA_KEY, normalizeExperienciaParams } from "@/lib/experiencia";
import { parseEmails } from "@/lib/mail";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// POST /api/reportes/experiencia/config
// Guarda a qué mail(es) se avisan las caídas, si el aviso automático está
// activo, y los umbrales del reporte.
// Body: { emailTo?: string, enabled?: boolean, params?: { umbral, minCaida } }
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    emailTo?: unknown;
    enabled?: unknown;
    params?: Record<string, unknown>;
  } | null;
  if (!body) return NextResponse.json({ error: "Falta el body." }, { status: 400 });

  const data: { emailTo?: string | null; enabled?: boolean; params?: object } = {};

  if (body.emailTo !== undefined) {
    const raw = typeof body.emailTo === "string" ? body.emailTo : "";
    const mails = parseEmails(raw);
    // Un texto que no deja ni un mail válido es un error de tipeo, no un "borrar".
    if (raw.trim() !== "" && mails.length === 0) {
      return NextResponse.json(
        { error: "Ninguna de las direcciones parece un mail válido." },
        { status: 400 },
      );
    }
    data.emailTo = mails.length > 0 ? mails.join(",") : null;
  }
  if (typeof body.enabled === "boolean") data.enabled = body.enabled;
  if (body.params) data.params = normalizeExperienciaParams(body.params) as unknown as object;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No hay nada que guardar." }, { status: 400 });
  }

  try {
    const saved = await prisma.reportConfig.upsert({
      where: { key: EXPERIENCIA_KEY },
      create: { key: EXPERIENCIA_KEY, ...data },
      update: data,
    });
    return NextResponse.json({
      ok: true,
      config: { enabled: saved.enabled, emailTo: saved.emailTo, params: saved.params },
    });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message || "No se pudo guardar la config." },
      { status: 500 },
    );
  }
}
