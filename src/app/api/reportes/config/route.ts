import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { VENTAS_ACELERADAS_KEY, normalizeParams } from "@/lib/reportes";
import { parseRecipients } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// POST /api/reportes/config
// Guarda la config de un reporte: número(s) de WhatsApp, umbrales y si el
// envío automático (cron) está activo. Body: { key?, whatsappTo?, params?, enabled? }
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    key?: string;
    whatsappTo?: string | null;
    params?: Record<string, unknown> | null;
    enabled?: boolean;
  } | null;
  if (!body) return NextResponse.json({ error: "JSON inválido" }, { status: 400 });

  const key = body.key || VENTAS_ACELERADAS_KEY;

  // Guardamos los números ya normalizados (solo dígitos, E.164 sin "+").
  const whatsappTo =
    body.whatsappTo === undefined ? undefined : parseRecipients(body.whatsappTo).join(",") || null;
  const params = body.params === undefined ? undefined : (normalizeParams(body.params) as unknown as object);

  try {
    const saved = await prisma.reportConfig.upsert({
      where: { key },
      create: {
        key,
        whatsappTo: whatsappTo ?? null,
        params: params ?? undefined,
        enabled: body.enabled ?? true,
      },
      update: {
        ...(whatsappTo !== undefined ? { whatsappTo } : {}),
        ...(params !== undefined ? { params } : {}),
        ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
      },
    });
    return NextResponse.json({
      ok: true,
      config: { enabled: saved.enabled, whatsappTo: saved.whatsappTo, params: saved.params },
    });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message || "No se pudo guardar la config." },
      { status: 500 },
    );
  }
}
