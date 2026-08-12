import { NextResponse } from "next/server";
import { parseEmails } from "@/lib/mail";
import { runAndDeliverSemanal } from "@/lib/semanal.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

// POST /api/reportes/semanal/run
// Corre el reporte, lo guarda y lo manda por mail con el Excel adjunto.
// Body opcional: { send?: boolean, to?: string } — `to` sirve para probar el
// envío contra otra casilla sin tocar la config.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { send?: boolean; to?: string } | null;
  const send = typeof body?.send === "boolean" ? body.send : true;
  const to = body?.to ? parseEmails(body.to) : undefined;

  try {
    const { report, run, mail, fotos } = await runAndDeliverSemanal("manual", { send, to });
    return NextResponse.json({
      ok: true,
      summary: report.summary,
      ventana: report.ventana,
      mail,
      fotos,
      runId: run.id,
      runAt: run.createdAt,
    });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message || "No se pudo correr el reporte." },
      { status: 502 },
    );
  }
}
