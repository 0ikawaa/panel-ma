import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { computeCancelaciones } from "@/lib/cancelaciones.server";
import { DEFAULT_N, type Granularidad } from "@/lib/cancelaciones";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// GET /api/reportes/cancelaciones/export?granularidad=semana|mes&n=12
export async function GET(req: Request) {
  const url = new URL(req.url);
  const granularidad: Granularidad = url.searchParams.get("granularidad") === "mes" ? "mes" : "semana";
  const nParam = Number(url.searchParams.get("n"));
  const n = Number.isFinite(nParam) && nParam >= 2 && nParam <= 52 ? Math.floor(nParam) : DEFAULT_N[granularidad];

  let report;
  try {
    report = await computeCancelaciones(granularidad, n);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || "No se pudo generar." }, { status: 502 });
  }

  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
  const header = [
    granularidad === "mes" ? "Mes" : "Semana",
    "Órdenes",
    "Canceladas",
    "Tasa cancelación",
    "No pagadas",
    "Fraude",
    "Otras",
    "En curso",
  ];
  const rows = report.series.map((s) => [
    s.label,
    s.totalOrdenes,
    s.canceladas,
    pct(s.tasa),
    s.noPagada,
    s.fraude,
    s.otras,
    s.parcial ? "sí" : "",
  ]);

  const c = report.comparacion;
  const info = [
    ["Reporte: Cancelaciones de MercadoLibre"],
    [`Vista: por ${granularidad}`],
    c.actual && c.anterior
      ? [`Comparación: ${c.actual.label} (${c.actual.canceladas}) vs ${c.anterior.label} (${c.anterior.canceladas}) → ${c.deltaCanceladas! >= 0 ? "+" : ""}${c.deltaCanceladas}`]
      : ["Comparación: sin dos períodos cerrados"],
    [`Totales del rango: ${report.totales.canceladas} canceladas de ${report.totales.totalOrdenes} (${pct(report.totales.tasa)})`],
    [],
  ];

  const aoa = [...info, header, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 16 }, { wch: 10 }, { wch: 12 }, { wch: 15 }, { wch: 12 }, { wch: 9 }, { wch: 8 }, { wch: 9 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Cancelaciones");

  const buf: Buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="cancelaciones_${granularidad}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
