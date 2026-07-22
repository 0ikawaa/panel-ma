import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// PATCH /api/reposicion/:id  -> editar nombre / meses de cobertura
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  const data: Record<string, unknown> = {};
  if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
  if ("meses" in body) {
    const n = Number(body.meses);
    if (isFinite(n) && n > 0) data.meses = Math.round(n);
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nada para actualizar" }, { status: 400 });
  }

  try {
    const repo = await prisma.reposicion.update({ where: { id }, data });
    return NextResponse.json(repo);
  } catch {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }
}

// DELETE /api/reposicion/:id
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  await prisma.reposicion.delete({ where: { id } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
