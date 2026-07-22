import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { AUTH_COOKIE, verifySessionToken } from "@/lib/auth";
import { blobAvailable, uploadDataUrl, isDataUrlPhoto } from "@/lib/photos";

export const runtime = "nodejs";
export const maxDuration = 60;

// Cuántas fotos migrar por llamada. El cliente vuelve a llamar hasta terminar,
// así ninguna petición supera el límite de tiempo del serverless.
const BATCH = 15;

/** Cuenta cuántas fotos quedan en base64 sin migrar. */
async function pendingCount(): Promise<number> {
  return prisma.product.count({ where: { photo: { startsWith: "data:" } } });
}

// GET /api/admin/migrate-photos -> estado (cuántas quedan)
export async function GET() {
  const session = await verifySessionToken((await cookies()).get(AUTH_COOKIE)?.value);
  if (!session?.isAdmin) {
    return NextResponse.json({ error: "Solo el administrador" }, { status: 403 });
  }
  return NextResponse.json({
    remaining: await pendingCount(),
    blobAvailable: blobAvailable(),
  });
}

// POST /api/admin/migrate-photos -> migra un lote de fotos base64 a Vercel Blob
export async function POST() {
  const session = await verifySessionToken((await cookies()).get(AUTH_COOKIE)?.value);
  if (!session?.isAdmin) {
    return NextResponse.json({ error: "Solo el administrador" }, { status: 403 });
  }
  if (!blobAvailable()) {
    return NextResponse.json(
      { error: "Falta BLOB_READ_WRITE_TOKEN en el entorno." },
      { status: 500 },
    );
  }

  const batch = await prisma.product.findMany({
    where: { photo: { startsWith: "data:" } },
    select: { id: true, containerId: true, photo: true },
    take: BATCH,
  });

  let migrated = 0;
  const errors: string[] = [];

  for (const p of batch) {
    if (!isDataUrlPhoto(p.photo)) continue;
    try {
      const url = await uploadDataUrl(p.photo, `containers/${p.containerId}`);
      await prisma.product.update({ where: { id: p.id }, data: { photo: url } });
      migrated += 1;
    } catch (e) {
      errors.push(`${p.id}: ${(e as Error).message}`);
    }
  }

  const remaining = await pendingCount();
  return NextResponse.json({
    migrated,
    remaining,
    done: remaining === 0,
    errors: errors.slice(0, 5),
  });
}
