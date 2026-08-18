import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { AUTH_COOKIE, verifySessionToken } from "@/lib/auth";
import { recalcularPrecioContenedor } from "@/lib/containerTotals";
import { reindexarAlFinal, sanitizarIds } from "@/lib/moverProductos";

// POST /api/products/move
//
// Mueve varios ítems a otro embarque. Body: { ids: string[], containerId }.
//
// Reemplaza al "borrar de un embarque y volver a cargarlo en el otro": moviendo
// la fila se conservan la foto manual, el detalle por línea y el CBM cargado.
// Como el alta, la edición y el borrado, sólo el superadmin (Matías).
export async function POST(req: Request) {
  const token = (await cookies()).get(AUTH_COOKIE)?.value;
  const session = await verifySessionToken(token);
  if (!session?.isAdmin) {
    return NextResponse.json(
      { error: "Solo el administrador puede mover los productos." },
      { status: 403 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const ids = sanitizarIds(body.ids);
  const destinoId = typeof body.containerId === "string" ? body.containerId.trim() : "";

  if (ids.length === 0) {
    return NextResponse.json({ error: "Elegí al menos un ítem para mover." }, { status: 400 });
  }
  if (!destinoId) {
    return NextResponse.json({ error: "Elegí el embarque de destino." }, { status: 400 });
  }

  const destino = await prisma.container.findUnique({
    where: { id: destinoId },
    select: { id: true, name: true },
  });
  if (!destino) {
    return NextResponse.json({ error: "El embarque de destino no existe." }, { status: 404 });
  }

  const productos = await prisma.product.findMany({
    where: { id: { in: ids } },
    select: { id: true, rowIndex: true, containerId: true },
  });
  if (productos.length !== ids.length) {
    return NextResponse.json(
      { error: "Alguno de los ítems ya no está en el embarque. Recargá la página." },
      { status: 404 },
    );
  }

  // Los que ya viven en el destino se dejan como están: mover no tiene que
  // reordenarlos ni contarlos como movidos.
  const aMover = productos.filter((p) => p.containerId !== destinoId);
  if (aMover.length === 0) {
    return NextResponse.json({ movidos: 0, destino: destino.name });
  }

  // Van al final del destino, en el orden que traían del origen.
  const ultimo = await prisma.product.aggregate({
    where: { containerId: destinoId },
    _max: { rowIndex: true },
  });
  const nuevos = reindexarAlFinal(aMover, ultimo._max.rowIndex ?? 0);

  try {
    await prisma.$transaction(
      nuevos.map((n) =>
        prisma.product.update({
          where: { id: n.id },
          data: { containerId: destinoId, rowIndex: n.rowIndex },
        }),
      ),
    );
  } catch {
    return NextResponse.json({ error: "No se pudieron mover los ítems." }, { status: 500 });
  }

  // El precio del contenedor es la suma del lote de sus ítems: cambian los dos
  // lados (ver lib/containerTotals.ts).
  const origenes = new Set(aMover.map((p) => p.containerId));
  for (const id of [...origenes, destinoId]) {
    await recalcularPrecioContenedor(id);
  }

  return NextResponse.json({ movidos: aMover.length, destino: destino.name });
}
