import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { AUTH_COOKIE, verifySessionToken } from "@/lib/auth";
import { deleteBlobUrls } from "@/lib/photos";
import { isBlobUrl, isDocType } from "@/lib/embarques";

export const dynamic = "force-dynamic";

async function requireSession() {
  const token = (await cookies()).get(AUTH_COOKIE)?.value;
  return verifySessionToken(token);
}

/** GET /api/containers/:id/docs — documentos del embarque. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const docs = await prisma.containerDoc.findMany({
    where: { containerId: id },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(docs);
}

/**
 * POST /api/containers/:id/docs — registra un archivo ya subido a Vercel Blob.
 * El navegador sube directo a Blob (evita el límite de 4.5 MB del body) y acá
 * solo guardamos la URL con su tipo.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  const type = body.type;
  if (!isDocType(type)) {
    return NextResponse.json({ error: "Tipo de documento inválido" }, { status: 400 });
  }
  const url = typeof body.url === "string" ? body.url.trim() : "";
  if (!isBlobUrl(url)) {
    return NextResponse.json({ error: "URL de archivo inválida" }, { status: 400 });
  }
  const name = (typeof body.name === "string" ? body.name.trim() : "") || "documento";
  const sizeRaw = Number(body.size);
  const size = Number.isFinite(sizeRaw) && sizeRaw > 0 ? Math.round(sizeRaw) : null;

  const container = await prisma.container.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!container) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }

  const doc = await prisma.containerDoc.create({
    data: { containerId: id, type, name, url, size, uploadedBy: session.user },
  });
  return NextResponse.json(doc, { status: 201 });
}

/** DELETE /api/containers/:id/docs?docId=... — borra el registro y el archivo. */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const docId = new URL(req.url).searchParams.get("docId") || "";
  if (!docId) return NextResponse.json({ error: "Falta docId" }, { status: 400 });

  // Se acota al contenedor de la URL para que un id de otro embarque no borre nada.
  const doc = await prisma.containerDoc.findFirst({
    where: { id: docId, containerId: id },
  });
  if (!doc) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  await prisma.containerDoc.delete({ where: { id: doc.id } });
  await deleteBlobUrls([doc.url]);
  return NextResponse.json({ ok: true });
}
