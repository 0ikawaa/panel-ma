// Cliente de la API externa MUNDO SHOP (solo lectura: Odoo + MercadoLibre).
// La clave vive en el .env (server-only) y nunca se expone al navegador.

const BASE = process.env.MUNDOSHOP_BASE_URL || "http://68.183.134.24:3001/api/ext";
const KEY = process.env.MUNDOSHOP_API_KEY || "";

type Row = Record<string, unknown>;

/** Ejecuta un SELECT libre contra la API MUNDO SHOP y devuelve las filas. */
export async function msQuery(sql: string, timeoutMs = 30000): Promise<Row[]> {
  if (!KEY) throw new Error("Falta MUNDOSHOP_API_KEY en el .env");
  let res: Response;
  try {
    res = await fetch(`${BASE}/query?sql=${encodeURIComponent(sql)}`, {
      headers: { "x-api-key": KEY },
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    const err = e as Error;
    if (err.name === "TimeoutError" || err.name === "AbortError") {
      throw new Error(`La API MUNDO SHOP tardó más de ${timeoutMs / 1000}s (timeout). Probá un rango más chico.`);
    }
    // ECONNREFUSED / ENOTFOUND / red caída, etc.
    throw new Error(`No hay conexión con la API MUNDO SHOP (${err.message}).`);
  }
  if (!res.ok) throw new Error(`MUNDO SHOP respondió HTTP ${res.status}`);
  const json = (await res.json()) as { rows?: Row[]; error?: string };
  if (json?.error) throw new Error(String(json.error));
  return json?.rows ?? [];
}
