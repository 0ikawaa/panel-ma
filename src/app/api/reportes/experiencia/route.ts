import { NextResponse } from "next/server";
import {
  computeExperiencia,
  conMarcasDelPanel,
  getExperienciaConfig,
} from "@/lib/experiencia.server";
import { cachearConTtl } from "@/lib/cache";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

// Armar este reporte es un barrido completo de MercadoLibre: la lista de
// publicaciones activas más /ml-experiencia de cada una (más de 800 llamadas).
// El resultado se reusa un rato; el botón «Actualizar» manda `forzar=1` y lo
// rehace igual.
const TTL_MS = 15 * 60 * 1000;

const experienciaCacheada = cachearConTtl(() => computeExperiencia(), { ttlMs: TTL_MS });

// GET /api/reportes/experiencia[?forzar=1]
// Devuelve el reporte de experiencia de compra. NO manda mails ni escribe
// marcas: eso pasa en la corrida (/run y el cron). Abrir la pantalla es solo leer.
export async function GET(req: Request) {
  const forzar = new URL(req.url).searchParams.get("forzar") === "1";
  try {
    const [base, cfg] = await Promise.all([
      experienciaCacheada({ forzar }),
      getExperienciaConfig(),
    ]);
    // Las marcas se leen SIEMPRE frescas, por fuera del cache: si viajaran
    // adentro, después de una corrida la pantalla mostraría las de hace 15 min.
    const report = await conMarcasDelPanel(base);
    return NextResponse.json({
      report,
      config: { enabled: cfg.enabled, emailTo: cfg.emailTo, params: cfg.params },
      generadoHaceMs: experienciaCacheada.edadMs(),
    });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message || "No se pudo generar el reporte." },
      { status: 502 },
    );
  }
}
