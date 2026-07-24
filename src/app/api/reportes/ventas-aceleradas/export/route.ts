import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { computeVentasAceleradas, getVentasAceleradasConfig } from "@/lib/reportes.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/reportes/ventas-aceleradas/export -> descarga el reporte como Excel.
// Recalcula en vivo con la config guardada para exportar los datos del momento.
export async function GET() {
  let report;
  try {
    const cfg = await getVentasAceleradasConfig();
    report = await computeVentasAceleradas(cfg.params);
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message || "No se pudo generar el reporte." },
      { status: 502 },
    );
  }

  const { params, ventana, items, summary } = report;

  const header = [
    "Código",
    "Título",
    `u/día (últimos ${params.ventanaDias}d)`,
    `u/día (histórico ${params.baseDias}d)`,
    "Aceleración",
    `Vendidas (${params.ventanaDias}d)`,
    "Vendidas (histórico)",
    "Stock",
    "En camino",
    "Días de cobertura",
    "Pedir (u)",
  ];

  const round = (n: number, d = 2) => +n.toFixed(d);
  const rows = items.map((r) => [
    r.sku,
    r.titulo ?? "",
    round(r.velReciente),
    round(r.velBase),
    r.sinHistorial ? "nuevo" : `${round(r.aceleracion ?? 0, 1)}x`,
    r.unidadesRecientes,
    r.unidadesBase,
    r.stock ?? "",
    r.enCamino,
    r.diasCobertura === null ? "" : Math.round(r.diasCobertura),
    r.sugerido,
  ]);

  // Encabezado informativo arriba de la tabla.
  const info = [
    ["Reporte: Ventas aceleradas / riesgo de quiebre"],
    [`Ventana reciente: ${ventana.recienteDesde} a ${ventana.recienteHasta}`],
    [`Histórico previo: ${ventana.baseDesde} a ${ventana.baseHasta}`],
    [`SKUs en riesgo: ${summary.total} · sin reposición: ${summary.sinReposicion} · unidades sugeridas: ${summary.unidadesSugeridas}`],
    [],
  ];

  const aoa = [...info, header, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [
    { wch: 14 }, { wch: 42 }, { wch: 16 }, { wch: 18 }, { wch: 12 },
    { wch: 16 }, { wch: 18 }, { wch: 10 }, { wch: 11 }, { wch: 16 }, { wch: 10 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Ventas aceleradas");

  const buf: Buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const filename = `ventas-aceleradas_${ventana.recienteHasta}.xlsx`;

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
