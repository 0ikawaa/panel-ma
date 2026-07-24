import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

// Código base/padre: "16000-BLA/MAR" → "16000".
function baseCode(v: unknown): string {
  return String(v ?? "").split(/[-\s/]/)[0].trim();
}

// GET /api/reportes/origen-brasil → lista actual de códigos padre de Brasil.
export async function GET() {
  const rows = await prisma.productOrigin.findMany({
    where: { origin: "brasil" },
    select: { codigo: true },
    orderBy: { codigo: "asc" },
  });
  return NextResponse.json({ count: rows.length, codigos: rows.map((r) => r.codigo) });
}

// POST /api/reportes/origen-brasil  (multipart: file=<xlsx>)
// Reemplaza toda la lista de Brasil con los códigos padre de la primera columna.
export async function POST(req: Request) {
  let file: File | null = null;
  try {
    const form = await req.formData();
    const f = form.get("file");
    if (f instanceof File) file = f;
  } catch {
    return NextResponse.json({ error: "Se esperaba un archivo (multipart/form-data)." }, { status: 400 });
  }
  if (!file) return NextResponse.json({ error: "Falta el archivo Excel." }, { status: 400 });

  let codigos: string[];
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buf, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null });
    const set = new Set<string>();
    for (const row of aoa) {
      const v = row?.[0];
      if (v === null || v === undefined || v === "") continue;
      const b = baseCode(v);
      // Ignora un posible encabezado no numérico; los códigos son numéricos.
      if (b && /^\d+$/.test(b)) set.add(b);
    }
    codigos = [...set];
  } catch (e) {
    return NextResponse.json({ error: "No se pudo leer el Excel: " + (e as Error).message }, { status: 400 });
  }

  if (codigos.length === 0) {
    return NextResponse.json(
      { error: "El Excel no tiene códigos válidos en la primera columna." },
      { status: 400 },
    );
  }

  await prisma.$transaction([
    prisma.productOrigin.deleteMany({ where: { origin: "brasil" } }),
    prisma.productOrigin.createMany({
      data: codigos.map((codigo) => ({ codigo, origin: "brasil" })),
      skipDuplicates: true,
    }),
  ]);

  return NextResponse.json({ ok: true, count: codigos.length });
}
