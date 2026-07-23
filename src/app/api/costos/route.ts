import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { AUTH_COOKIE, verifySessionToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

async function requireSession() {
  const token = (await cookies()).get(AUTH_COOKIE)?.value;
  return verifySessionToken(token);
}

/** GET /api/costos — lista todos los overrides de costo. */
export async function GET() {
  if (!(await requireSession())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const list = await prisma.costOverride.findMany();
  return NextResponse.json(list);
}

/** POST /api/costos — crea o actualiza el costo unitario de un SKU. */
export async function POST(req: Request) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const sku = typeof body.sku === "string" ? body.sku.trim() : "";
  const cost = Number(body.cost);
  if (!sku) return NextResponse.json({ error: "SKU requerido" }, { status: 400 });
  if (!Number.isFinite(cost) || cost < 0) {
    return NextResponse.json({ error: "Costo inválido" }, { status: 400 });
  }

  const saved = await prisma.costOverride.upsert({
    where: { sku },
    update: { cost, updatedBy: session.user },
    create: { sku, cost, updatedBy: session.user },
  });
  return NextResponse.json(saved);
}

/** DELETE /api/costos?sku=... — borra el override y vuelve al costo de Odoo. */
export async function DELETE(req: Request) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const sku = new URL(req.url).searchParams.get("sku") || "";
  if (!sku) return NextResponse.json({ error: "SKU requerido" }, { status: 400 });
  await prisma.costOverride.deleteMany({ where: { sku } });
  return NextResponse.json({ ok: true });
}
