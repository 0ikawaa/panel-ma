import { NextResponse } from "next/server";
import { runAndDeliverVentasAceleradas } from "@/lib/reportes.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

// GET /api/cron/reportes
// Disparo automático diario (Vercel Cron, 12:00 UTC = 09:00 Uruguay).
// Corre el reporte de ventas aceleradas, lo persiste y lo manda por WhatsApp.
//
// El reporte de experiencia de compra NO va acá: su dato sale del panel de
// vendedor de MercadoLibre (login de por medio) y no de la API, así que no hay
// nada que un cron pueda ir a buscar. Ese reporte avisa por mail cuando se
// importa una captura nueva y se compara con la anterior — ver
// `lib/experiencia.server.ts`.
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
    const aceleradas = await runAndDeliverVentasAceleradas("cron");
    return NextResponse.json({
      ok: true,
      ventasAceleradas: {
        enRiesgo: aceleradas.report.summary.total,
        whatsapp: aceleradas.whatsapp.status,
        runId: aceleradas.run.id,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, ventasAceleradas: { error: (e as Error).message || "falló" } },
      { status: 500 },
    );
  }
}
