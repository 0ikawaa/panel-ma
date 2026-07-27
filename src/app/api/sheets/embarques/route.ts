import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildSheetPayload } from "@/lib/sheets";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

// GET /api/sheets/embarques
// Feed que consume el Apps Script de la planilla de Google Sheets.
//
// Protección: header "Authorization: Bearer $SHEETS_TOKEN". Google Sheets no
// puede mandar la cookie de sesión, así que esta ruta está en PUBLIC_PATHS del
// middleware y se protege sola con el token, igual que /api/cron. Sin
// SHEETS_TOKEN definido se rechaza todo (para que no quede abierta por
// accidente en un deploy donde falte la variable).
export async function GET(req: Request) {
  const token = (process.env.SHEETS_TOKEN || "").trim();
  const auth = req.headers.get("authorization") || "";
  if (!token || auth !== `Bearer ${token}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const containers = await prisma.container.findMany({
      include: { products: { orderBy: { rowIndex: "asc" } } },
    });
    return NextResponse.json(buildSheetPayload(containers), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message || "No se pudo armar el feed." },
      { status: 500 },
    );
  }
}
