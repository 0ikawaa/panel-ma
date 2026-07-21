import { NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { parseExcel } from "@/lib/excel";

export const runtime = "nodejs";
export const maxDuration = 60;

// POST /api/containers/:id/upload  (JSON: { blobUrl })
// El navegador ya subió el Excel a Vercel Blob; acá lo descargamos y procesamos.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const container = await prisma.container.findUnique({ where: { id } });
  if (!container) {
    return NextResponse.json({ error: "Contenedor no encontrado" }, { status: 404 });
  }

  let blobUrl: string | undefined;
  try {
    const body = (await req.json()) as { blobUrl?: string };
    blobUrl = body.blobUrl;
  } catch {
    return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });
  }

  if (!blobUrl || typeof blobUrl !== "string") {
    return NextResponse.json({ error: "Falta el archivo Excel" }, { status: 400 });
  }

  // Seguridad: solo aceptamos URLs de nuestro almacenamiento de Blob.
  let host: string;
  try {
    host = new URL(blobUrl).hostname;
  } catch {
    return NextResponse.json({ error: "URL de archivo inválida" }, { status: 400 });
  }
  if (!host.endsWith(".public.blob.vercel-storage.com")) {
    return NextResponse.json({ error: "Origen de archivo no permitido" }, { status: 400 });
  }

  // Descargar el Excel desde Blob
  let buffer: Buffer;
  try {
    const res = await fetch(blobUrl);
    if (!res.ok) throw new Error(`Blob respondió ${res.status}`);
    buffer = Buffer.from(await res.arrayBuffer());
  } catch (e) {
    console.error("Error al descargar el blob:", e);
    return NextResponse.json(
      { error: "No se pudo descargar el archivo subido." },
      { status: 502 },
    );
  }

  let result;
  try {
    result = await parseExcel(buffer);
  } catch (e) {
    console.error("Error al parsear Excel:", e);
    return NextResponse.json(
      { error: "No se pudo procesar el Excel. Verificá el formato." },
      { status: 500 },
    );
  } finally {
    // Borrar el archivo temporal del Blob (no bloqueamos si falla).
    del(blobUrl).catch(() => {});
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
    fileName: blobUrl.split("/").pop() ?? "excel",
  });
}
