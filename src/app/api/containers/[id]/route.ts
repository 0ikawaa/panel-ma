import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deleteBlobUrls } from "@/lib/photos";
import { estadoAnterior, estadoEfectivo, isEstado } from "@/lib/embarques";

// GET /api/containers/:id  -> detalle con productos
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const container = await prisma.container.findUnique({
    where: { id },
    include: {
      products: { orderBy: { rowIndex: "asc" } },
      docs: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!container) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }
  return NextResponse.json(container);
}

// PATCH /api/containers/:id  -> editar datos
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
  if ("supplier" in body) data.supplier = body.supplier?.trim() || null;
  if ("eta" in body) data.eta = body.eta ? new Date(body.eta) : null;
  if ("notes" in body) data.notes = body.notes?.trim() || null;

  // Estado del tablero y "recibido" son la misma cosa vista de dos formas:
  // "deposito" ⟺ receivedAt con fecha. Se mantienen siempre sincronizados.
  if ("status" in body) {
    if (!isEstado(body.status)) {
      return NextResponse.json({ error: "Estado inválido" }, { status: 400 });
    }
    const actual = await prisma.container.findUnique({
      where: { id },
      select: { receivedAt: true },
    });
    if (!actual) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    data.status = body.status;
    data.receivedAt =
      body.status === "deposito" ? (actual.receivedAt ?? new Date()) : null;
  } else if ("received" in body) {
    if (body.received) {
      data.receivedAt = new Date();
      data.status = "deposito";
    } else {
      const actual = await prisma.container.findUnique({
        where: { id },
        select: { status: true, receivedAt: true },
      });
      data.receivedAt = null;
      // Solo se retrocede de etapa si de verdad estaba recibido; si ya estaba
      // en camino, desmarcar no debe moverlo hacia atrás en el tablero.
      if (actual?.receivedAt) data.status = estadoAnterior(estadoEfectivo(actual));
    }
  }

  if ("freightCost" in body) {
    const f = body.freightCost;
    data.freightCost =
      f === null || f === "" || isNaN(Number(f)) ? null : Number(f);
  }
  if ("origin" in body) data.origin = body.origin === "brasil" ? "brasil" : "china";

  const container = await prisma.container.update({ where: { id }, data });
  return NextResponse.json(container);
}

// DELETE /api/containers/:id
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  // Recolectar fotos y documentos para borrarlos de Blob después de eliminar
  // el contenedor (las filas se van solas por el onDelete: Cascade).
  const [photos, docs] = await Promise.all([
    prisma.product
      .findMany({ where: { containerId: id }, select: { photo: true } })
      .then((ps) => ps.map((p) => p.photo)),
    prisma.containerDoc
      .findMany({ where: { containerId: id }, select: { url: true } })
      .then((ds) => ds.map((d) => d.url)),
  ]);
  await prisma.container.delete({ where: { id } });
  await deleteBlobUrls([...photos, ...docs]);
  return NextResponse.json({ ok: true });
}
