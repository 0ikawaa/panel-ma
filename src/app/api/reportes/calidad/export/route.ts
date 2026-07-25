import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { computeCalidad } from "@/lib/calidad.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

// GET /api/reportes/calidad/export → descarga el reporte como Excel.
export async function GET() {
  let report;
  try {
    report = await computeCalidad();
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message || "No se pudo generar el reporte." },
      { status: 502 },
    );
  }

  const { items, summary } = report;
  const header = [
    "Publicación", "SKU", "MLU", "Calidad %", "Visitas 30d",
    "Infracción", "Visibilidad ↓", "Fotos baja res.", "Sin envío gratis", "Fuera de catálogo", "Sin video", "Sin fidelidad",
    "Fotos", "Res. mín (px)", "Objetivos a cumplir", "Link",
  ];
  const si = (b: boolean) => (b ? "Sí" : "");
  const rows = items.map((it) => [
    it.titulo,
    it.sku ?? "",
    it.id,
    it.calidadPct ?? "",
    it.visitas30d ?? "",
    si(it.infracciones),
    si(it.visibilidadReducida),
    si(it.fotosBajaCalidad),
    si(it.sinEnvioGratis),
    si(it.fueraCatalogo),
    si(it.sinVideo),
    si(it.sinFidelidad),
    it.fotosCount ?? "",
    it.fotosMinRes ?? "",
    it.objetivos.map((o) => `• [${o.categoria === "calidad" ? "Calidad" : "Oport."}] ${o.label}`).join("\n"),
    it.permalink ?? "",
  ]);

  const info = [
    ["Reporte: Calidad de las publicaciones (activas)"],
    [`Activas: ${summary.activas} · Al máximo: ${summary.maxima} · A mejorar (calidad): ${summary.aMejorar} · Con infracciones: ${summary.conInfracciones}`],
    [`Fotos baja res.: ${summary.fotosBajaCalidad} · Sin envío gratis: ${summary.sinEnvioGratis} · Fuera de catálogo: ${summary.fueraCatalogo} · Sin video: ${summary.sinVideo} · Sin fidelidad: ${summary.sinFidelidad}`],
    [`Visitas 30d en riesgo: ${summary.visitasEnRiesgo}`],
    [],
  ];

  const aoa = [...info, header, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [
    { wch: 48 }, { wch: 14 }, { wch: 14 }, { wch: 9 }, { wch: 10 },
    { wch: 9 }, { wch: 11 }, { wch: 12 }, { wch: 14 }, { wch: 15 }, { wch: 9 }, { wch: 12 },
    { wch: 7 }, { wch: 12 }, { wch: 70 }, { wch: 40 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Calidad");
  const buf: Buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="calidad-publicaciones.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
