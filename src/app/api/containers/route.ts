import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/containers  -> lista con estadísticas
export async function GET() {
  const containers = await prisma.container.findMany({
    orderBy: { createdAt: "desc" },
  });

  const stats = await prisma.product.groupBy({
    by: ["containerId"],
    _count: { _all: true },
    _sum: { cbmTotal: true },
  });

  const statMap = new Map(
    stats.map((s) => [
      s.containerId,
      { count: s._count._all, cbmTotal: s._sum.cbmTotal ?? 0 },
    ]),
  );

  const data = containers.map((c) => ({
    ...c,
    productCount: statMap.get(c.id)?.count ?? 0,
    cbmTotal: statMap.get(c.id)?.cbmTotal ?? 0,
  }));

  return NextResponse.json(data);
}

// POST /api/containers  -> crear
export async function POST(req: Request) {
  let body: { name?: string; supplier?: string; eta?: string; notes?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });
  }

  const name = (body.name ?? "").trim();
  if (!name) {
    return NextResponse.json(
      { error: "El nombre del contenedor es obligatorio" },
      { status: 400 },
    );
  }

  const container = await prisma.container.create({
    data: {
      name,
      supplier: body.supplier?.trim() || null,
      eta: body.eta ? new Date(body.eta) : null,
      notes: body.notes?.trim() || null,
    },
  });

  return NextResponse.json(container, { status: 201 });
}
