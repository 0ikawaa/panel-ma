import { NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseExcel } from "@/lib/excel";
import { buildPreviewReport, validateParse } from "@/lib/validateParse";
import { uploadDataUrlPhotos, deleteBlobPhotos } from "@/lib/photos";

export const runtime = "nodejs";
export const maxDuration = 60;

type Action = "preview" | "commit" | "cancel";

// Descarga el blob reintentando: recién subido, el CDN puede tardar un
// instante en servirlo y devolver 404/403 momentáneamente.
async function downloadBlob(url: string, attempts = 7): Promise<Buffer> {
  let lastStatus = 0;
  for (let i = 0; i < attempts; i++) {
    const res = await fetch(url, { cache: "no-store" });
    if (res.ok) return Buffer.from(await res.arrayBuffer());
    lastStatus = res.status;
    if (res.status !== 404 && res.status !== 403) break;
    await new Promise((r) => setTimeout(r, 500 * (i + 1)));
  }
  throw new Error(`Blob respondió ${lastStatus}`);
}

// POST /api/containers/:id/upload
//   body: { blobUrl, action }
//   - "preview": lee y valida el Excel SIN guardar; devuelve el informe.
//   - "commit":  re-valida y, si está OK, guarda los productos.
//   - "cancel":  descarta el Excel temporal del Blob.
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
  let action: Action = "commit";
  try {
    const body = (await req.json()) as { blobUrl?: string; action?: Action };
    blobUrl = body.blobUrl;
    if (body.action === "preview" || body.action === "commit" || body.action === "cancel") {
      action = body.action;
    }
  } catch {
    return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });
  }

  if (!blobUrl || typeof blobUrl !== "string") {
    return NextResponse.json({ error: "Falta el archivo Excel" }, { status: 400 });
  }

  let host: string;
  try {
    host = new URL(blobUrl).hostname;
  } catch {
    return NextResponse.json({ error: "URL de archivo inválida" }, { status: 400 });
  }
  if (!host.endsWith(".public.blob.vercel-storage.com")) {
    return NextResponse.json({ error: "Origen de archivo no permitido" }, { status: 400 });
  }

  // Cancelar: solo borrar el archivo temporal.
  if (action === "cancel") {
    await del(blobUrl).catch(() => {});
    return NextResponse.json({ ok: true });
  }

  const fileName = decodeURIComponent(blobUrl.split("/").pop() ?? "excel");

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
    // Archivo ilegible: descartamos el temporal en cualquier acción.
    del(blobUrl).catch(() => {});
    return NextResponse.json(
      {
        error:
          "No se pudo leer el Excel. Puede estar dañado, protegido con contraseña o no ser un .xlsx válido.",
      },
      { status: 422 },
    );
  }

  const report = buildPreviewReport(result);

  // --- PREVIEW: no guardamos ni borramos (el blob se reusa al confirmar). ---
  if (action === "preview") {
    return NextResponse.json({ preview: true, fileName, ...report });
  }

  // --- COMMIT: re-validar siempre antes de tocar la base. ---
  const validation = validateParse(result);
  if (!validation.ok) {
    // Bloqueado: no escribimos nada y descartamos el temporal.
    del(blobUrl).catch(() => {});
    return NextResponse.json(
      {
        error: "El embarque no se guardó porque la lectura tiene problemas.",
        blocking: validation.blocking,
        warnings: validation.warnings,
      },
      { status: 422 },
    );
  }

  // Fotos que este contenedor tenía antes (para borrarlas de Blob al reemplazar).
  const oldPhotos = (
    await prisma.product.findMany({
      where: { containerId: id },
      select: { photo: true },
    })
  ).map((p) => p.photo);

  // Subir las fotos nuevas a Blob y reemplazar el data URL por su URL pública.
  // Si no hay token de Blob (dev local), el mapa viene vacío y se conserva el base64.
  const photoMap = await uploadDataUrlPhotos(
    result.items.map((it) => it.photo),
    `containers/${id}`,
  );
  const newBlobUrls = Array.from(photoMap.values());

  try {
    await prisma.$transaction([
      prisma.product.deleteMany({ where: { containerId: id } }),
      prisma.product.createMany({
        data: result.items.map((it) => ({
          containerId: id,
          rowIndex: it.rowIndex,
          photo: it.photo ? photoMap.get(it.photo) ?? it.photo : null,
          codigo: it.codigo,
          precioChina: it.precioChina,
          cantidadPorCaja: it.cantidadPorCaja,
          unidades: it.unidades,
          montoTotal: it.montoTotal,
          unidad: it.unidad,
          remark: it.remark,
          cbmUnitario: it.cbmUnitario,
          cbmTotal: it.cbmTotal,
          detalle: it.detalle as unknown as Prisma.InputJsonValue,
        })),
      }),
      prisma.container.update({
        where: { id },
        data: { updatedAt: new Date(), totalPrice: result.containerTotal },
      }),
    ]);
  } catch (e) {
    // Si falló la escritura, borrar las fotos recién subidas para no dejar huérfanas.
    await deleteBlobPhotos(newBlobUrls);
    console.error("Error al guardar los productos:", e);
    return NextResponse.json(
      { error: "No se pudieron guardar los productos." },
      { status: 500 },
    );
  }

  // Guardado OK: borrar el Excel temporal y las fotos del Excel anterior.
  del(blobUrl).catch(() => {});
  await deleteBlobPhotos(oldPhotos);

  return NextResponse.json({
    ok: true,
    totalRows: result.totalItems,
    photosFound: result.photosFound,
    columnsDetected: result.columnsDetected,
    warnings: validation.warnings,
    fileName,
  });
}
