import { NextResponse } from "next/server";
import { runAndDeliverVentasAceleradas } from "@/lib/reportes.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// POST /api/reportes/ventas-aceleradas/run
// Corre el reporte, lo persiste y lo envía por WhatsApp (disparo manual).
// Body opcional: { send?: boolean } — send:false solo genera y guarda.
export async function POST(req: Request) {
  let send = true;
  try {
    const body = await req.json().catch(() => ({}));
    if (body && typeof body.send === "boolean") send = body.send;
  } catch {
    /* sin body */
  }
  try {
    const { report, run, whatsapp } = await runAndDeliverVentasAceleradas("manual", { send });
    return NextResponse.json({ report, whatsapp, runId: run.id, runAt: run.createdAt });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message || "No se pudo correr el reporte." },
      { status: 502 },
    );
  }
}
