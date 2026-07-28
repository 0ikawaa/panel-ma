import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AUTH_COOKIE, verifySessionToken } from "@/lib/auth";
import { isBlobPhoto } from "@/lib/photos";
import { fotoDeCodigo, recordarFotoDeCodigo } from "@/lib/fotoCodigo";
import { recalcularPrecioContenedor } from "@/lib/containerTotals";
import {
  agregarLineas,
  calcularLineas,
  cbmCajaDesdeUnidad,
  numOrNull,
  sanitizeDetalle,
  strOrNull,
} from "@/lib/productEdit";

// POST /api/containers/:id/products
//
// Agrega un ítem al embarque a mano, sin pasar por el Excel. Mismo criterio que
// la edición (PATCH /api/products/:id): sólo el superadmin (Matías), y los
// agregados del ítem —unidades, precio del lote, CBM— se derivan de las líneas
// en vez de llegar cargados desde el cliente.
//
// Si no se sube foto, se usa la que ya se haya fijado a mano para ese código en
// otro embarque (biblioteca de lib/fotoCodigo.ts).
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const token = (await cookies()).get(AUTH_COOKIE)?.value;
  const session = await verifySessionToken(token);
  if (!session?.isAdmin) {
    return NextResponse.json(
      { error: "Solo el administrador puede agregar productos." },
      { status: 403 },
    );
  }

  const { id: containerId } = await params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  const container = await prisma.container.findUnique({
    where: { id: containerId },
    select: { id: true },
  });
  if (!container) {
    return NextResponse.json({ error: "Embarque no encontrado" }, { status: 404 });
  }

  const photo = strOrNull(body.photo);
  // Igual que al editar: la foto tiene que ser una URL de nuestro propio Blob,
  // que es a donde el navegador sube antes de mandar el alta.
  if (photo !== null && !isBlobPhoto(photo)) {
    return NextResponse.json(
      { error: "La foto tiene que subirse desde el panel." },
      { status: 400 },
    );
  }

  const codigo = strOrNull(body.codigo);
  // Sin foto elegida, se hereda la que se haya fijado a mano para ese código en
  // un embarque anterior (lib/fotoCodigo.ts). Si la persona sí eligió una, esa
  // manda y pasa a ser la nueva foto guardada del código.
  const heredada = photo === null ? await fotoDeCodigo(codigo) : null;
  const fotoFinal = photo ?? heredada;

  // La pantalla carga el CBM por unidad; la base guarda el CBM por caja.
  const cbmU = numOrNull(body.cbmPorUnidad);
  const { cbmUnitario, cantidadPorCaja } = cbmCajaDesdeUnidad(cbmU, null);

  const lineas = calcularLineas(sanitizeDetalle(body.detalle), cbmU);
  const ag = agregarLineas(lineas);

  // El ítem nuevo va al final: `rowIndex` es el orden de aparición en el Excel
  // y la tabla ordena por él. Los borrados dejan huecos, así que se toma el
  // máximo y no la cantidad de filas.
  const ultimo = await prisma.product.aggregate({
    where: { containerId },
    _max: { rowIndex: true },
  });

  try {
    const product = await prisma.product.create({
      data: {
        containerId,
        rowIndex: (ultimo._max.rowIndex ?? 0) + 1,
        photo: fotoFinal,
        // Tanto la elegida como la heredada salieron de una decisión manual:
        // ganan sobre la foto de MercadoLibre.
        fotoManual: fotoFinal !== null,
        codigo,
        remark: strOrNull(body.remark),
        cbmUnitario,
        cantidadPorCaja,
        detalle: lineas as unknown as Prisma.InputJsonValue,
        unidades: ag.unidades,
        montoTotal: ag.montoTotal,
        cbmTotal: ag.cbmTotal,
        precioChina: ag.precioChina,
      },
    });

    await recalcularPrecioContenedor(containerId);
    if (photo) await recordarFotoDeCodigo(codigo, photo, session.user);
    return NextResponse.json(product, { status: 201 });
  } catch {
    return NextResponse.json({ error: "No se pudo agregar el producto." }, { status: 500 });
  }
}
