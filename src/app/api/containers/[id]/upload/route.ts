import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseExcel } from "@/lib/excel";

export const runtime = "nodejs";
export const maxDuration = 60;

// POST /api/containers/:id/upload  (multipart/form-data, campo "file")
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const container = await prisma.container.findUnique({ where: { id } });
  if (!container) {
    return NextResponse.json({ error: "Contenedor no encontrado" }, { status: 404 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "No se pudo leer el archivo" }, { status: 400 });
  }

  const file = form.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "Falta el archivo Excel" }, { status: 400 });
  }

  const name = file.name.toLowerCase();
  if (!name.endsWith(".xlsx") && !name.endsWith(".xlsm") && !name.endsWith(".xls")) {
    return NextResponse.json(
      { error: "El archivo debe ser un Excel (.xlsx)" },
      { status: 400 },
    );
  }

  let result;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    result = await parseExcel(buffer);
  } catch (e) {
    console.error("Error al parsear Excel:", e);
    return NextResponse.json(
      { error: "No se pudo procesar el Excel. Verificá el formato." },
      { status: 500 },
    );
  }

  if (result.rows.length === 0) {
    return NextResponse.json(
      { error: "No se detectaron filas con datos en el Excel." },
      { status: 422 },
    );
  }

  // Reemplaza los productos existentes del contenedor
  await prisma.$transaction([
    prisma.product.deleteMany({ where: { containerId: id } }),
    prisma.product.createMany({
      data: result.rows.map((r) => ({
        containerId: id,
        rowIndex: r.rowIndex,
        photo: r.photo,
        codigo: r.codigo,
        precioChina: r.precioChina,
        cantidadPorCaja: r.cantidadPorCaja,
        cbmUnitario: r.cbmUnitario,
        cbmTotal: r.cbmTotal,
      })),
    }),
    prisma.container.update({
      where: { id },
      data: { updatedAt: new Date() },
    }),
  ]);

  return NextResponse.json({
    ok: true,
    totalRows: result.totalRows,
    photosFound: result.photosFound,
    columnsDetected: result.columnsDetected,
    fileName: file.name,
  });
}
