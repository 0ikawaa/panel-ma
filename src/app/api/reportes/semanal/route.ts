import { NextResponse } from "next/server";
import { cachearConTtl } from "@/lib/cache";
import { computeSemanal, getSemanalConfig, ultimaCorridaSemanal } from "@/lib/semanal.server";
import { normalizeParams } from "@/lib/semanal";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

// El reporte son tres consultas grandes a MUNDO SHOP (ventas de 90 días, stock
// y en camino) y encima cambia una vez por semana: no tiene sentido rehacerlo
// en cada visita. El botón «Actualizar» manda forzar=1 y lo recalcula igual.
const TTL_MS = 30 * 60 * 1000;

const semanalCacheado = cachearConTtl(
  async () => computeSemanal((await getSemanalConfig()).params),
  { ttlMs: TTL_MS },
);

// GET /api/reportes/semanal[?forzar=1]
// Reporte de la última semana cerrada + config guardada + última corrida.
export async function GET(req: Request) {
  const forzar = new URL(req.url).searchParams.get("forzar") === "1";
  try {
    const [report, cfg, ultima] = await Promise.all([
      semanalCacheado({ forzar }),
      getSemanalConfig(),
      ultimaCorridaSemanal().catch(() => null),
    ]);
    return NextResponse.json({
      report,
      config: { enabled: cfg.enabled, emailTo: cfg.emailTo, params: normalizeParams(cfg.params) },
      ultimaCorrida: ultima
        ? { id: ultima.id, at: ultima.createdAt, trigger: ultima.trigger, emailStatus: ultima.emailStatus, emailTo: ultima.emailTo }
        : null,
      generadoHaceMs: semanalCacheado.edadMs(),
    });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message || "No se pudo generar el reporte." },
      { status: 502 },
    );
  }
}
