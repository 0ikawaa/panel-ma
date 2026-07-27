import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AUTH_COOKIE, verifySessionToken } from "@/lib/auth";
import { deleteBlobUrls, isBlobPhoto } from "@/lib/photos";
import {
  agregarLineas,
  calcularLineas,
  cbmCajaDesdeUnidad,
  type LineaEditable,
} from "@/lib/productEdit";

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return isFinite(n) ? n : null;
}

function intOrNull(v: unknown): number | null {
  const n = numOrNull(v);
  return n === null ? null : Math.round(n);
}

function strOrNull(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

function sanitizeDetalle(input: unknown): LineaEditable[] {
  if (!Array.isArray(input)) return [];
  return input.map((l) => {
    const line = (l ?? {}) as Record<string, unknown>;
    return {
      codigos: Array.isArray(line.codigos)
        ? line.codigos.map((c) => String(c).trim()).filter(Boolean)
        : [],
      unidades: intOrNull(line.unidades),
      precioChina: numOrNull(line.precioChina),
      cbmTotal: numOrNull(line.cbmTotal),
      remark: strOrNull(line.remark),
    };
  });
}

// PATCH /api/products/:id
//
// Edición de un producto del embarque. Solo el superadmin (Matías): los demás
// usuarios, incluso los que tienen el módulo "admin", reciben 403.
//
// Se puede editar: foto, código, observaciones, CBM por unidad y el detalle por
// línea (códigos, unidades, precio de origen y observación de cada una).
//
// NO se editan a mano el precio del lote ni el costo final. El primero se
// calcula por línea (unidades × precio) y se suma; el segundo sale de
// landedCost() al mostrarlo. En lib/productEdit.ts está por qué el cálculo va
// por línea y no a nivel ítem.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const token = (await cookies()).get(AUTH_COOKIE)?.value;
  const session = await verifySessionToken(token);
  if (!session?.isAdmin) {
    return NextResponse.json(
      { error: "Solo el administrador puede editar los productos." },
      { status: 403 },
    );
  }

  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  const actual = await prisma.product.findUnique({
    where: { id },
    select: { photo: true, cantidadPorCaja: true },
  });
  if (!actual) {
    return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
  }

  const data: Prisma.ProductUpdateInput = {};
  let fotoAnterior: string | null = null;

  if ("codigo" in body) data.codigo = strOrNull(body.codigo);
  if ("remark" in body) data.remark = strOrNull(body.remark);

  if ("photo" in body) {
    const nueva = strOrNull(body.photo);
    // Solo aceptamos URLs de nuestro propio Blob: el navegador sube ahí primero
    // y recién después manda la URL. Así la foto no puede quedar apuntando a un
    // dominio ajeno que después se caiga o sirva otra cosa.
    if (nueva !== null && !isBlobPhoto(nueva)) {
      return NextResponse.json(
        { error: "La foto tiene que subirse desde el panel." },
        { status: 400 },
      );
    }
    if (nueva !== actual.photo) {
      data.photo = nueva;
      // La anterior se borra recién si el guardado sale bien.
      if (isBlobPhoto(actual.photo)) fotoAnterior = actual.photo;
    }
  }

  // La pantalla edita el CBM por unidad (lo que se ve en la tabla y lo que
  // entra al costo final); la base guarda el CBM por caja.
  if ("cbmPorUnidad" in body) {
    const { cbmUnitario, cantidadPorCaja } = cbmCajaDesdeUnidad(
      numOrNull(body.cbmPorUnidad),
      actual.cantidadPorCaja,
    );
    data.cbmUnitario = cbmUnitario;
    data.cantidadPorCaja = cantidadPorCaja;
  }

  if ("detalle" in body) {
    const lineas = calcularLineas(sanitizeDetalle(body.detalle));
    data.detalle = lineas as unknown as Prisma.InputJsonValue;
    // Los agregados del ítem se derivan de las líneas; no llegan del cliente.
    const ag = agregarLineas(lineas);
    data.unidades = ag.unidades;
    data.montoTotal = ag.montoTotal;
    data.cbmTotal = ag.cbmTotal;
    data.precioChina = ag.precioChina;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nada para actualizar" }, { status: 400 });
  }

  try {
    const product = await prisma.product.update({ where: { id }, data });
    if (fotoAnterior) {
      // Si falla el borrado queda un archivo huérfano en Blob y nada más; no
      // tiene sentido voltear una edición ya guardada por eso.
      await deleteBlobUrls([fotoAnterior]).catch(() => {});
    }
    return NextResponse.json(product);
  } catch {
    return NextResponse.json({ error: "No se pudo guardar el producto." }, { status: 500 });
  }
}
