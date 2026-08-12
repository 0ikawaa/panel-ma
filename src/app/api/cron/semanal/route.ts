import { NextResponse } from "next/server";
import { runAndDeliverSemanal } from "@/lib/semanal.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

// GET /api/cron/semanal
// Disparo automático de los lunes (Vercel Cron, 12:00 UTC = 09:00 Uruguay).
// Arma el reporte de la semana que cerró (lunes a domingo) y lo manda por mail
// con el Excel adjunto.
//
// Va en su propio endpoint y no dentro de /api/cron/reportes porque tarda mucho
// más (baja las fotos de cada variante y arma el .xlsx) y no tiene sentido que
// un reporte pesado semanal ponga en riesgo el aviso diario.
//
// Protección: Vercel Cron manda "Authorization: Bearer $CRON_SECRET". Sin
// CRON_SECRET definido se rechaza, para que no quede abierto por accidente.
export async function GET(req: Request) {
  const secret = (process.env.CRON_SECRET || "").trim();
  const auth = req.headers.get("authorization") || "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const { report, run, mail, fotos } = await runAndDeliverSemanal("cron");
    return NextResponse.json({
      ok: true,
      ventana: report.ventana,
      summary: report.summary,
      fotos,
      mail: mail.status,
      runId: run.id,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message || "falló" },
      { status: 500 },
    );
  }
}
