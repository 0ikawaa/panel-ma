import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/containers/:id  -> detalle con productos
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const container = await prisma.container.findUnique({
    where: { id },
    include: { products: { orderBy: { rowIndex: "asc" } } },
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
  if ("received" in body) data.receivedAt = body.received ? new Date() : null;
  if ("freightCost" in body) {
    const f = body.freightCost;
    data.freightCost =
      f === null || f === "" || isNaN(Number(f)) ? null : Number(f);
  }

  const container = await prisma.container.update({ where: { id }, data });
  return NextResponse.json(container);
}

// DELETE /api/containers/:id
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  await prisma.container.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
