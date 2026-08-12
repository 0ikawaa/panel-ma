import { buildSemanalXlsx } from "@/lib/semanal.xlsx";
import { computeSemanal, descargarFotos, getSemanalConfig, nombreAdjunto } from "@/lib/semanal.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

// GET /api/reportes/semanal/export
// Descarga el Excel del reporte (con las fotos embebidas), el mismo archivo que
// viaja adjunto en el mail de los lunes.
export async function GET() {
  try {
    const cfg = await getSemanalConfig();
    const report = await computeSemanal(cfg.params);
    const fotos = await descargarFotos(report);
    const xlsx = await buildSemanalXlsx(report, fotos);

    return new Response(new Uint8Array(xlsx), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${nombreAdjunto(report)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return Response.json(
      { error: (e as Error).message || "No se pudo generar el Excel." },
      { status: 502 },
    );
  }
}
