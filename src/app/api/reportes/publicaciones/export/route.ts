import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { computePublicaciones, getPublicacionesConfig } from "@/lib/publicaciones.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// GET /api/reportes/publicaciones/export → descarga el reporte como Excel (2 hojas).
export async function GET() {
  let report;
  try {
    const { params } = await getPublicacionesConfig();
    report = await computePublicaciones(params);
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message || "No se pudo generar el reporte." },
      { status: 502 },
    );
  }

  const wb = XLSX.utils.book_new();

  // Hoja A: inactivas con stock.
  const headA = ["Publicación", "SKU(s)", "MLU", "Estado", "Motivo", "Stock Odoo", "En camino", "Stock ML", "Por qué / qué hacer", "Link"];
  const rowsA = report.inactivas.map((it) => [
    it.titulo,
    it.skus.join(", "),
    it.id,
    it.status,
    it.motivoLabel,
    it.stockOdoo ?? "",
    it.enCamino,
    it.mlDisponible ?? "",
    it.explicacion,
    it.permalink ?? "",
  ]);
  const wsA = XLSX.utils.aoa_to_sheet([
    ["Inactivas en ML con stock en Odoo"],
    [`${report.inactivas.length} publicaciones · de ${report.summary.inactivasTotal} inactivas · ${report.summary.inactivasSinMapa} sin SKU mapeable`],
    [],
    headA,
    ...rowsA,
  ]);
  wsA["!cols"] = [{ wch: 46 }, { wch: 18 }, { wch: 14 }, { wch: 10 }, { wch: 26 }, { wch: 11 }, { wch: 10 }, { wch: 9 }, { wch: 70 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(wb, wsA, "Inactivas con stock");

  // Hoja B: sin ventas.
  const headB = ["Publicación", "SKU", "MLU", "Stock", "Origen stock", "Vendidas (histórico)", "Última venta", "Días sin vender", "Link"];
  const rowsB = report.sinVentas.map((it) => [
    it.titulo,
    it.sku ?? "",
    it.id,
    it.stock ?? "",
    it.stockOrigen ?? "",
    it.vendidas ?? "",
    it.ultimaVenta ?? "nunca",
    it.diasSinVenta ?? "",
    it.permalink ?? "",
  ]);
  const wsB = XLSX.utils.aoa_to_sheet([
    [`Activas sin ventas en ${report.ventana.label}`],
    [`${report.sinVentas.length} publicaciones · ${report.summary.sinVentasConStock} con stock · desde ${report.ventana.desde}`],
    [],
    headB,
    ...rowsB,
  ]);
  wsB["!cols"] = [{ wch: 46 }, { wch: 16 }, { wch: 14 }, { wch: 9 }, { wch: 12 }, { wch: 18 }, { wch: 13 }, { wch: 14 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(wb, wsB, "Sin ventas");

  const buf: Buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="publicaciones-revisar.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
