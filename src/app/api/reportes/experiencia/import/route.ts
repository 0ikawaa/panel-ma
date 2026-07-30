import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { AUTH_COOKIE, verifySessionToken } from "@/lib/auth";
import { importarCaptura } from "@/lib/experiencia.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * POST /api/reportes/experiencia/import
 *
 * Carga una captura del panel de vendedor (ver el README).
 * Acepta dos formas, porque la captura son dos archivos:
 *
 *  - `multipart/form-data` con uno o más archivos JSON (lo que usa la pantalla),
 *  - `application/json` con `{ listas: [ [...], [...] ] }`, o directamente el
 *    array de una sola captura.
 *
 * Las listas se mergean por id de publicación: la del listado aporta el % de
 * experiencia de todo el catálogo y la del diagnóstico el detalle de problemas.
 */
export async function POST(req: Request) {
  const session = await verifySessionToken((await cookies()).get(AUTH_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  let listas: unknown[] = [];
  let capturadoEn: Date | undefined;
  let enviarMail = true;

  const tipo = req.headers.get("content-type") || "";
  try {
    if (tipo.includes("multipart/form-data")) {
      const form = await req.formData();
      for (const [campo, valor] of form.entries()) {
        if (typeof valor === "string") {
          if (campo === "capturadoEn") capturadoEn = new Date(valor);
          if (campo === "enviarMail") enviarMail = valor !== "false";
          continue;
        }
        const texto = await valor.text();
        listas.push(JSON.parse(texto));
      }
    } else {
      const body = (await req.json()) as unknown;
      if (Array.isArray(body)) {
        listas = [body];
      } else if (body && typeof body === "object") {
        const o = body as Record<string, unknown>;
        if (Array.isArray(o.listas)) listas = o.listas;
        else listas = [o.listado, o.diagnostico].filter((x) => Array.isArray(x));
        if (typeof o.capturadoEn === "string") capturadoEn = new Date(o.capturadoEn);
        if (o.enviarMail === false) enviarMail = false;
      }
    }
  } catch (e) {
    return NextResponse.json(
      { error: `No se pudo leer la captura: ${(e as Error).message}` },
      { status: 400 },
    );
  }

  listas = listas.filter((l) => Array.isArray(l) && l.length > 0);
  if (listas.length === 0) {
    return NextResponse.json(
      { error: "La captura viene vacía: se esperaba el JSON que devuelve el script del panel." },
      { status: 400 },
    );
  }
  // Una fecha inválida arruinaría el orden de las capturas, que es lo que hace
  // que la comparación tenga sentido.
  if (capturadoEn && Number.isNaN(capturadoEn.getTime())) capturadoEn = undefined;

  try {
    const res = await importarCaptura({
      listas,
      capturadoEn,
      usuario: session.user,
      enviarMail,
    });
    return NextResponse.json({
      ok: true,
      snapshot: res.snapshot,
      report: res.report,
      empeoraron: res.empeoraron,
      primeraCaptura: res.primeraCaptura,
      email: res.email,
      runId: res.runId,
    });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message || "No se pudo importar la captura." },
      { status: 500 },
    );
  }
}
