import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/users";
import { ALL_MODULES } from "@/lib/modules";

export const runtime = "nodejs";

// PATCH /api/admin/users/:id -> editar nombre, módulos y/o contraseña
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};

  if ("name" in body) data.name = String(body.name ?? "").trim() || null;
  if (Array.isArray(body.modules)) {
    const modules = body.modules.filter((m: unknown) => ALL_MODULES.includes(String(m)));
    if (modules.length === 0) {
      return NextResponse.json({ error: "Elegí al menos un módulo" }, { status: 400 });
    }
    data.modules = modules;
  }
  if (body.password) {
    const pw = String(body.password);
    if (pw.length < 4) {
      return NextResponse.json({ error: "La contraseña debe tener al menos 4 caracteres" }, { status: 400 });
    }
    data.passwordHash = await hashPassword(pw);
  }

  const user = await prisma.user.update({
    where: { id },
    data,
    select: { id: true, username: true, name: true, modules: true, createdAt: true },
  });
  return NextResponse.json(user);
}

// DELETE /api/admin/users/:id
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  await prisma.user.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
