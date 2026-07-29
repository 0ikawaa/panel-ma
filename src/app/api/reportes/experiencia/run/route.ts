import { NextResponse } from "next/server";
import { runAndDeliverExperiencia } from "@/lib/experiencia.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

// POST /api/reportes/experiencia/run
// Corre el chequeo de experiencia: compara con la corrida anterior, marca en el
// panel las publicaciones que bajaron y manda el mail (disparo manual).
// Body opcional: { send?: boolean } — send:false solo detecta y marca, sin mail.
export async function POST(req: Request) {
  let send = true;
  const body = (await req.json().catch(() => null)) as { send?: unknown } | null;
  if (body && typeof body.send === "boolean") send = body.send;

  try {
    const { report, caidas, nuevas, recuperadas, email, primeraCorrida, runId } =
      await runAndDeliverExperiencia("manual", { send });
    return NextResponse.json({
      report,
      caidas,
      nuevas,
      recuperadas,
      email,
      primeraCorrida,
      runId,
    });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message || "No se pudo correr el chequeo." },
      { status: 502 },
    );
  }
}
