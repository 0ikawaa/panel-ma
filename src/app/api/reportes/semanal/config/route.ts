import { NextResponse } from "next/server";
import { parseEmails } from "@/lib/mail";
import { saveSemanalConfig } from "@/lib/semanal.server";
import type { SemanalParams } from "@/lib/semanal";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// POST /api/reportes/semanal/config
// Guarda a qué mail se manda, si el envío de los lunes está activo y los
// parámetros (meses objetivo, días de ritmo). Body: { enabled?, emailTo?, params? }
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    enabled?: boolean;
    emailTo?: string | null;
    params?: Partial<SemanalParams> | null;
  } | null;
  if (!body) return NextResponse.json({ error: "JSON inválido" }, { status: 400 });

  // Se guardan ya normalizados: lo que no parece un mail no entra.
  const emailTo =
    body.emailTo === undefined ? undefined : parseEmails(body.emailTo).join(",") || null;

  try {
    const cfg = await saveSemanalConfig({
      ...(body.enabled === undefined ? {} : { enabled: body.enabled }),
      ...(emailTo === undefined ? {} : { emailTo }),
      ...(body.params ? { params: body.params } : {}),
    });
    return NextResponse.json({ ok: true, config: cfg });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message || "No se pudo guardar la config." },
      { status: 500 },
    );
  }
}
