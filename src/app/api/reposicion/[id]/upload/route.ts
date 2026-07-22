import { NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseVentas, parseStock } from "@/lib/reposicion";

export const runtime = "nodejs";
export const maxDuration = 60;

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

// POST /api/reposicion/:id/upload  (JSON: { blobUrl, tipo: "ventas" | "stock" })
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const repo = await prisma.reposicion.findUnique({ where: { id } });
  if (!repo) {
    return NextResponse.json({ error: "Análisis no encontrado" }, { status: 404 });
  }

  let blobUrl: string | undefined;
  let tipo: string | undefined;
  try {
    const body = (await req.json()) as { blobUrl?: string; tipo?: string };
    blobUrl = body.blobUrl;
    tipo = body.tipo;
  } catch {
    return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });
  }

  if (tipo !== "ventas" && tipo !== "stock") {
    return NextResponse.json({ error: "Tipo inválido" }, { status: 400 });
  }
  if (!blobUrl || typeof blobUrl !== "string") {
    return NextResponse.json({ error: "Falta el archivo" }, { status: 400 });
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

  let buffer: Buffer;
  try {
    buffer = await downloadBlob(blobUrl);
  } catch (e) {
    console.error("Error al descargar el blob:", e);
    return NextResponse.json({ error: "No se pudo descargar el archivo." }, { status: 502 });
  }

  const fileName = blobUrl.split("/").pop() ?? "excel";

  try {
    if (tipo === "ventas") {
      const { items, periodo } = parseVentas(buffer);
      if (items.length === 0) {
        return NextResponse.json(
          { error: "No se detectaron ventas con código entre corchetes." },
          { status: 422 },
        );
      }
      await prisma.reposicion.update({
        where: { id },
        data: {
          ventas: items as unknown as Prisma.InputJsonValue,
          ventasFile: fileName,
          ...(periodo ? { periodo } : {}),
        },
      });
      return NextResponse.json({ ok: true, tipo, count: items.length, periodo });
    } else {
      const { items } = parseStock(buffer);
      if (items.length === 0) {
        return NextResponse.json(
          { error: "No se detectó stock con código entre corchetes." },
          { status: 422 },
        );
      }
      await prisma.reposicion.update({
        where: { id },
        data: {
          stock: items as unknown as Prisma.InputJsonValue,
          stockFile: fileName,
        },
      });
      return NextResponse.json({ ok: true, tipo, count: items.length });
    }
  } catch (e) {
    console.error("Error al procesar el Excel:", e);
    return NextResponse.json(
      { error: "No se pudo procesar el Excel. Verificá el formato." },
      { status: 500 },
    );
  } finally {
    del(blobUrl).catch(() => {});
  }
}
