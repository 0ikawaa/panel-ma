import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { landedCost, cbmPorUnidad, type Origin } from "@/lib/cost";

export const runtime = "nodejs";

// GET /api/containers/:id/export -> descarga el contenedor como Excel (.xlsx).
// Una fila por producto con sus datos y el costo final nacionalizado calculado.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const container = await prisma.container.findUnique({
    where: { id },
    include: { products: { orderBy: { rowIndex: "asc" } } },
  });
  if (!container) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }

  const origin = container.origin as Origin;
  const freight = container.freightCost;

  const header = [
    "#",
    "Código",
    "Unidades",
    "Unidad",
    "Precio unit. FOB (USD)",
    "CBM x unidad",
    "CBM total",
    "Precio lote (USD)",
    "Costo final /u (USD, IVA inc.)",
    "Observaciones",
    "Foto (URL)",
  ];

  const rows = container.products.map((p) => {
    const cbmU = cbmPorUnidad(p.cbmUnitario, p.cantidadPorCaja);
    const lc = landedCost(origin, p.precioChina, cbmU, freight);
    return [
      p.rowIndex,
      p.codigo ?? "",
      p.unidades ?? "",
      p.unidad ?? "",
      p.precioChina ?? "",
      cbmU ?? "",
      p.cbmTotal ?? "",
      p.montoTotal ?? "",
      lc ? +lc.final.toFixed(4) : "",
      p.remark ?? "",
      // Solo exportamos URLs de foto; los base64 se omiten (demasiado grandes).
      p.photo && p.photo.startsWith("http") ? p.photo : "",
    ];
  });

  const totalUnidades = container.products.reduce((a, p) => a + (p.unidades ?? 0), 0);
  const totalCbm = container.products.reduce((a, p) => a + (p.cbmTotal ?? 0), 0);
  const totalMonto = container.products.reduce((a, p) => a + (p.montoTotal ?? 0), 0);
  const totalRow = [
    "",
    "TOTAL",
    totalUnidades,
    "",
    "",
    "",
    +totalCbm.toFixed(4),
    +totalMonto.toFixed(2),
    "",
    "",
    "",
  ];

  const aoa = [header, ...rows, [], totalRow];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [
    { wch: 4 }, { wch: 16 }, { wch: 10 }, { wch: 8 }, { wch: 18 },
    { wch: 12 }, { wch: 12 }, { wch: 16 }, { wch: 22 }, { wch: 40 }, { wch: 50 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Productos");

  const buf: Buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const safeName = container.name.replace(/[^\w\d\-. ]+/g, "_").slice(0, 60).trim() || "contenedor";

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${safeName}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
