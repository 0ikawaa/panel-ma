import { NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { parseExcel } from "@/lib/excel";

export const runtime = "nodejs";
export const maxDuration = 60;

// Descarga el blob reintentando: recién subido, el CDN puede tardar un
// instante en servirlo y devolver 404/403 momentáneamente.
async function downloadBlob(url: string, attempts = 7): Promise<Buffer> {
  let lastStatus = 0;
  for (let i = 0; i < attempts; i++) {
    const res = await fetch(url, { cache: "no-store" });
    if (res.ok) return Buffer.from(await res.arrayBuffer());
    lastStatus = res.status;
    // Solo reintentamos ante "todavía no disponible" (404/403).
    if (res.status !== 404 && res.status !== 403) break;
    await new Promise((r) => setTimeout(r, 500 * (i + 1)));
  }
  throw new Error(`Blob respondió ${lastStatus}`);
}

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

  // Descargar el Excel desde Blob (con reintentos por la propagación del CDN)
  let buffer: Buffer;
  try {
    buffer = await downloadBlob(blobUrl);
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
    // TEMPORAL: desactivado para poder inspeccionar el archivo mientras
    // desarrollamos las nuevas funciones (cantidades, códigos, agrupado).
    void del;
    // del(blobUrl).catch(() => {});
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
