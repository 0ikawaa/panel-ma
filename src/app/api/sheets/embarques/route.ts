import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildSheetPayload } from "@/lib/sheets";
import { mlPhotoMap } from "@/lib/mundoshop";
import { fotoParaSheets, mapasVacios } from "@/lib/fotoProducto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Armar el mapa de fotos de MercadoLibre puede tardar en un arranque en frío
// (después queda cacheado 20 minutos en memoria).
export const maxDuration = 60;

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
    // Se seleccionan sólo las columnas que la planilla muestra. Nada de
    // precios, CBM, flete ni montos: no viajan hasta acá, así no hay forma de
    // que se filtren por descuido a un payload que se comparte.
    const containers = await prisma.container.findMany({
      select: {
        id: true,
        name: true,
        eta: true,
        notes: true,
        status: true,
        receivedAt: true,
        origin: true,
        products: {
          orderBy: { rowIndex: "asc" },
          select: {
            codigo: true,
            photo: true,
            fotoManual: true,
            unidades: true,
            remark: true,
          },
        },
      },
    });

    // La planilla tiene que mostrar la MISMA foto que la tabla del panel: foto
    // manual > MercadoLibre (por código) > la del Excel, salteando las que
    // =IMAGE() no renderiza. Antes mandaba sólo la guardada, así que los ítems
    // que en pantalla se ven con la foto de ML salían con la celda vacía. Si el
    // mapa de ML falla, se sigue con la propia.
    const ml = await mlPhotoMap(12000).catch(mapasVacios);
    const conFotos = containers.map((c) => ({
      ...c,
      products: c.products.map((p) => ({ ...p, photo: fotoParaSheets(p, ml) })),
    }));

    return NextResponse.json(buildSheetPayload(conFotos), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message || "No se pudo armar el feed." },
      { status: 500 },
    );
  }
}
