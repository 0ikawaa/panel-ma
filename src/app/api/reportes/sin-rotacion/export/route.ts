import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { computeSinRotacion, getSinRotacionConfig } from "@/lib/rotacion.server";
import { motivoLabel } from "@/lib/rotacion";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// GET /api/reportes/sin-rotacion/export → descarga el reporte como Excel.
export async function GET() {
  let report;
  try {
    const { params } = await getSinRotacionConfig();
    report = await computeSinRotacion(params);
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message || "No se pudo generar el reporte." },
      { status: 502 },
    );
  }

  const { ventana, items, summary } = report;
  const pct = (v: number | null) => (v === null ? "" : `${Math.round(v * 100)}%`);

  const header = [
    "Código padre",
    "Título",
    "Venta actual",
    "Venta mes pasado",
    "Venta año pasado",
    "Caída vs mes",
    "Caída vs año",
    "Unidades perdidas",
    "Stock",
    "En camino",
    "Motivo probable",
  ];

  const rows = items.map((r) => [
    r.codigo,
    r.titulo ?? "",
    r.ventaActual,
    r.ventaMesPasado,
    r.ventaAnioPasado,
    pct(r.caidaMesPct),
    pct(r.caidaAnioPct),
    r.unidadesPerdidas,
    r.stock ?? "",
    r.enCamino,
    motivoLabel(r.motivo),
  ]);

  const info = [
    ["Reporte: Publicaciones sin rotación"],
    [`Actual: ${ventana.actualDesde} a ${ventana.actualHasta}`],
    [`Mes pasado: ${ventana.mesDesde} a ${ventana.mesHasta}`],
    [`Año pasado: ${ventana.anioDesde} a ${ventana.anioHasta}${report.hayDatosAnioPasado ? "" : " (sin datos)"}`],
    [`Total: ${summary.total} · sin stock: ${summary.sinStock} · con stock: ${summary.conStock} · unidades perdidas: ${summary.unidadesPerdidas}`],
    [],
  ];

  const aoa = [...info, header, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [
    { wch: 14 }, { wch: 42 }, { wch: 12 }, { wch: 15 }, { wch: 15 }, { wch: 12 },
    { wch: 12 }, { wch: 16 }, { wch: 10 }, { wch: 11 }, { wch: 26 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sin rotación");

  const buf: Buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const filename = `sin-rotacion_${ventana.actualHasta}.xlsx`;

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
