import { NextResponse } from "next/server";
import { experienciaCacheada } from "@/lib/experiencia.server";
import { experienciaXlsxBuffer } from "@/lib/experiencia.xlsx";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

// GET /api/reportes/experiencia/export → descarga el reporte como Excel.
// Dos hojas: una fila por SKU (lo que se reparte para trabajar) y un resumen con
// el ranking de problemas, que es por dónde conviene empezar. El armado del
// workbook está en `lib/experiencia.xlsx.ts` para poder testearlo.
export async function GET() {
  let report;
  try {
    report = await experienciaCacheada();
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message || "No se pudo armar el reporte." },
      { status: 502 },
    );
  }
  if (!report) {
    return NextResponse.json(
      { error: "Todavía no hay ninguna captura del panel importada." },
      { status: 409 },
    );
  }

  const buf = experienciaXlsxBuffer(report);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="Experiencia-por-SKU.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
