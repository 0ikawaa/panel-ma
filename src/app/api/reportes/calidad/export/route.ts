import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { computeCalidad } from "@/lib/calidad.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

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
  const header = ["Publicación", "SKU", "MLU", "Calidad %", "Infracciones", "Visibilidad reducida", "Objetivos a cumplir", "Link"];
  const rows = items.map((it) => [
    it.titulo,
    it.sku ?? "",
    it.id,
    it.calidadPct ?? "",
    it.infracciones ? "Sí" : "",
    it.visibilidadReducida ? "Sí" : "",
    it.objetivos.map((o) => `• ${o.label}`).join("\n"),
    it.permalink ?? "",
  ]);

  const info = [
    ["Reporte: Calidad de las publicaciones (activas)"],
    [`Activas: ${summary.activas} · Al máximo: ${summary.maxima} · A mejorar: ${summary.aMejorar} · Con infracciones: ${summary.conInfracciones}`],
    [],
  ];

  const aoa = [...info, header, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 48 }, { wch: 14 }, { wch: 14 }, { wch: 10 }, { wch: 12 }, { wch: 18 }, { wch: 70 }, { wch: 40 }];
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
