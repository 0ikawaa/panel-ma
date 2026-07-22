import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST /api/reposicion  -> crear un análisis de reposición
export async function POST(req: Request) {
  let body: { name?: string; meses?: number | string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });
  }

  const name = (body.name ?? "").trim();
  if (!name) {
    return NextResponse.json({ error: "El nombre es obligatorio" }, { status: 400 });
  }

  const mesesNum = Number(body.meses);
  const meses = isFinite(mesesNum) && mesesNum > 0 ? Math.round(mesesNum) : 4;

  const repo = await prisma.reposicion.create({ data: { name, meses } });
  return NextResponse.json(repo, { status: 201 });
}
