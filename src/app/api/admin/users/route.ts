import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/users";
import { ALL_MODULES } from "@/lib/modules";

export const runtime = "nodejs";

// GET /api/admin/users -> lista (sin hash)
export async function GET() {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, username: true, name: true, modules: true, createdAt: true },
  });
  return NextResponse.json(users);
}

// POST /api/admin/users -> crear
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const username = String(body.username ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const name = String(body.name ?? "").trim() || null;
  const modules: string[] = Array.isArray(body.modules)
    ? body.modules.filter((m: unknown) => ALL_MODULES.includes(String(m)))
    : [];

  if (!username || username.length < 3) {
    return NextResponse.json({ error: "Usuario inválido (mínimo 3 caracteres)" }, { status: 400 });
  }
  if (password.length < 4) {
    return NextResponse.json({ error: "La contraseña debe tener al menos 4 caracteres" }, { status: 400 });
  }
  if (modules.length === 0) {
    return NextResponse.json({ error: "Elegí al menos un módulo" }, { status: 400 });
  }

  const exists = await prisma.user.findUnique({ where: { username } });
  if (exists) {
    return NextResponse.json({ error: "Ese usuario ya existe" }, { status: 409 });
  }

  const user = await prisma.user.create({
    data: { username, passwordHash: await hashPassword(password), name, modules },
    select: { id: true, username: true, name: true, modules: true, createdAt: true },
  });
  return NextResponse.json(user, { status: 201 });
}
