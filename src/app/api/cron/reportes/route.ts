import { NextResponse } from "next/server";
import { runAndDeliverVentasAceleradas } from "@/lib/reportes.server";
import { runAndDeliverExperiencia } from "@/lib/experiencia.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// El chequeo de experiencia barre las ~800 publicaciones activas contra ML, así
// que necesita bastante más que los 60s que alcanzaban para ventas aceleradas.
export const maxDuration = 300;

// GET /api/cron/reportes
// Disparo automático diario (Vercel Cron, 12:00 UTC = 09:00 Uruguay).
// Corre los reportes, los persiste y los envía: ventas aceleradas por WhatsApp y
// las caídas de experiencia de compra por mail.
//
// Protección: Vercel Cron manda "Authorization: Bearer $CRON_SECRET". Si no hay
// CRON_SECRET definido, se rechaza (evita que quede abierto por accidente).
export async function GET(req: Request) {
  const secret = (process.env.CRON_SECRET || "").trim();
  const auth = req.headers.get("authorization") || "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  // Los dos reportes son independientes: si uno falla, el otro tiene que salir
  // igual. Por eso van con allSettled y cada uno informa su propio error.
  const [aceleradas, experiencia] = await Promise.allSettled([
    runAndDeliverVentasAceleradas("cron"),
    runAndDeliverExperiencia("cron"),
  ]);

  const body = {
    ok: aceleradas.status === "fulfilled" || experiencia.status === "fulfilled",
    ventasAceleradas:
      aceleradas.status === "fulfilled"
        ? {
            enRiesgo: aceleradas.value.report.summary.total,
            whatsapp: aceleradas.value.whatsapp.status,
            runId: aceleradas.value.run.id,
          }
        : { error: (aceleradas.reason as Error)?.message || "falló" },
    experiencia:
      experiencia.status === "fulfilled"
        ? {
            aMejorar: experiencia.value.report.summary.aMejorar,
            caidas: experiencia.value.caidas.length,
            nuevasAConfirmar: experiencia.value.nuevas,
            recuperadas: experiencia.value.recuperadas,
            cruzaron100: experiencia.value.caidas.filter((c) => c.cruzo100).length,
            primeraCorrida: experiencia.value.primeraCorrida,
            email: experiencia.value.email.status,
            runId: experiencia.value.runId,
          }
        : { error: (experiencia.reason as Error)?.message || "falló" },
  };

  // 500 solo si fallaron los dos: así el cron de Vercel marca el intento como
  // fallido cuando no salió nada, pero no cuando uno de los dos sí salió.
  return NextResponse.json(body, { status: body.ok ? 200 : 500 });
}
