import { NextResponse } from "next/server";
import { runAndDeliverVentasAceleradas } from "@/lib/reportes.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// GET /api/cron/reportes
// Disparo automático diario (Vercel Cron, 12:00 UTC = 09:00 Uruguay).
// Corre el/los reporte(s), los persiste y los envía por WhatsApp.
//
// Protección: Vercel Cron manda "Authorization: Bearer $CRON_SECRET". Si no hay
// CRON_SECRET definido, se rechaza (evita que quede abierto por accidente).
export async function GET(req: Request) {
  const secret = (process.env.CRON_SECRET || "").trim();
  const auth = req.headers.get("authorization") || "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const { report, run, whatsapp } = await runAndDeliverVentasAceleradas("cron");
    return NextResponse.json({
      ok: true,
      reporte: report.key,
      enRiesgo: report.summary.total,
      whatsapp: whatsapp.status,
      runId: run.id,
    });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message || "Falló la corrida automática." },
      { status: 500 },
    );
  }
}
