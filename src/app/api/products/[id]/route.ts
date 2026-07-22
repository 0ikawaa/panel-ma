import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AUTH_COOKIE, verifySessionToken } from "@/lib/auth";

interface DetalleLinea {
  codigos: string[];
  unidades: number | null;
  monto: number | null;
  cbmTotal: number | null;
  precioChina: number | null;
  remark: string | null;
}

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

function sanitizeDetalle(input: unknown): DetalleLinea[] {
  if (!Array.isArray(input)) return [];
  return input.map((l) => {
    const line = (l ?? {}) as Record<string, unknown>;
    return {
      codigos: Array.isArray(line.codigos)
        ? line.codigos.map((c) => String(c).trim()).filter(Boolean)
        : [],
      unidades: intOrNull(line.unidades),
      monto: numOrNull(line.monto),
      cbmTotal: numOrNull(line.cbmTotal),
      precioChina: numOrNull(line.precioChina),
      remark: strOrNull(line.remark),
    };
  });
}

/** Suma un campo numérico de las líneas: null si ninguna lo tiene. */
function sumField(lines: DetalleLinea[], key: "unidades" | "monto" | "cbmTotal"): number | null {
  let acc = 0;
  let any = false;
  for (const l of lines) {
    const v = l[key];
    if (typeof v === "number" && isFinite(v)) {
      acc += v;
      any = true;
    }
  }
  return any ? +acc.toFixed(6) : null;
}

// PATCH /api/products/:id  -> editar código, observaciones y detalle (solo Matias)
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

  const data: Prisma.ProductUpdateInput = {};

  if ("codigo" in body) data.codigo = strOrNull(body.codigo);
  if ("remark" in body) data.remark = strOrNull(body.remark);

  if ("detalle" in body) {
    const det = sanitizeDetalle(body.detalle);
    data.detalle = det as unknown as Prisma.InputJsonValue;
    // Recalcular los agregados desde las líneas para mantener la tabla consistente.
    // No se tocan precioChina / cbmUnitario / cantidadPorCaja: el costo final no cambia.
    data.unidades = sumField(det, "unidades");
    data.montoTotal = sumField(det, "monto");
    data.cbmTotal = sumField(det, "cbmTotal");
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nada para actualizar" }, { status: 400 });
  }

  try {
    const product = await prisma.product.update({ where: { id }, data });
    return NextResponse.json(product);
  } catch {
    return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
  }
}
