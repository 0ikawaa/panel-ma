import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { AUTH_COOKIE, verifySessionToken } from "@/lib/auth";
import { marcarCaidasVistas, marcarTodasVistas } from "@/lib/experiencia.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// POST /api/reportes/experiencia/visto
// Limpia la marca de «bajó» del panel. Body: { itemIds: string[] } o { todas: true }.
// Se guarda quién la marcó, así se sabe que alguien ya la revisó.
export async function POST(req: Request) {
  const session = await verifySessionToken((await cookies()).get(AUTH_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    itemIds?: unknown;
    todas?: unknown;
  } | null;

  try {
    if (body?.todas === true) {
      const count = await marcarTodasVistas(session.user);
      return NextResponse.json({ ok: true, marcadas: count });
    }
    const itemIds = Array.isArray(body?.itemIds)
      ? body.itemIds.filter((v): v is string => typeof v === "string" && v.length > 0)
      : [];
    if (itemIds.length === 0) {
      return NextResponse.json({ error: "Faltan las publicaciones a marcar." }, { status: 400 });
    }
    const count = await marcarCaidasVistas(itemIds, session.user);
    return NextResponse.json({ ok: true, marcadas: count });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message || "No se pudo marcar como visto." },
      { status: 500 },
    );
  }
}
