import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { AUTH_COOKIE, verifySessionToken } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 60;

// GET /api/admin/backup -> respaldo JSON completo de la base (descargable).
// Incluye contenedores con sus productos, análisis de reposición y usuarios
// (sin los hashes de contraseña). Pensado como copia de seguridad manual.
export async function GET() {
  const session = await verifySessionToken((await cookies()).get(AUTH_COOKIE)?.value);
  if (!session?.isAdmin) {
    return NextResponse.json({ error: "Solo el administrador" }, { status: 403 });
  }

  const [containers, reposiciones, users] = await Promise.all([
    prisma.container.findMany({
      orderBy: { createdAt: "asc" },
      include: { products: { orderBy: { rowIndex: "asc" } } },
    }),
    prisma.reposicion.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        username: true,
        name: true,
        modules: true,
        lastLoginAt: true,
        createdAt: true,
      },
    }),
  ]);

  const backup = {
    version: 1,
    exportedAt: new Date().toISOString(),
    exportedBy: session.user,
    counts: {
      containers: containers.length,
      products: containers.reduce((a, c) => a + c.products.length, 0),
      reposiciones: reposiciones.length,
      users: users.length,
    },
    containers,
    reposiciones,
    users,
  };

  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(backup, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="backup-ma-${stamp}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
