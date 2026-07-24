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

/** Fuerza https en las URLs de imágenes de ML (evita el bloqueo de contenido mixto en producción). */
export function httpsUrl(u: string | null | undefined): string | null {
  if (!u) return null;
  return u.replace(/^http:\/\//i, "https://");
}

const baseOf = (sku: string) => sku.split(/[-\s/]/)[0].trim();

export type MlPhotoMaps = { bySku: Map<string, string>; byBase: Map<string, string> };

/**
 * Mapa SKU → foto principal de MercadoLibre (thumbnail). La foto vive por
 * `item_id` en `ml_item_sales`; se la asocia al SKU con el puente item_id→item_sku
 * de `ml_order_items`. Cubre las publicaciones que alguna vez vendieron (~580 SKUs).
 * Si falla, devuelve mapas vacíos (las fotos son opcionales, no deben romper nada).
 */
export async function mlPhotoMap(timeoutMs = 20000): Promise<MlPhotoMaps> {
  const sql = `
    SELECT oi.item_sku AS sku, MAX(s.thumbnail) AS thumb
    FROM ml_order_items oi
    JOIN ml_item_sales s ON s.item_id = oi.item_id
    WHERE oi.item_sku IS NOT NULL AND oi.item_sku <> ''
      AND s.thumbnail IS NOT NULL AND s.thumbnail <> ''
    GROUP BY oi.item_sku`;
  const bySku = new Map<string, string>();
  const byBase = new Map<string, string>();
  let rows: Row[];
  try {
    rows = await msQuery(sql, timeoutMs);
  } catch {
    return { bySku, byBase };
  }
  for (const r of rows) {
    const sku = String(r.sku);
    const thumb = httpsUrl(String(r.thumb));
    if (!thumb) continue;
    bySku.set(sku, thumb);
    const b = baseOf(sku);
    if (!byBase.has(b)) byBase.set(b, thumb);
  }
  return { bySku, byBase };
}

/** Foto de ML para un SKU: match exacto y, si no, por código base. */
export function resolveMlPhoto(maps: MlPhotoMaps, sku: string | null | undefined): string | null {
  if (!sku) return null;
  return maps.bySku.get(sku) ?? maps.byBase.get(baseOf(sku)) ?? null;
}

/** GET genérico a un endpoint de MUNDO SHOP (ej. "ml-items?status=active"). */
export async function msGet<T = unknown>(path: string, timeoutMs = 30000): Promise<T> {
  if (!KEY) throw new Error("Falta MUNDOSHOP_API_KEY en el .env");
  let res: Response;
  try {
    res = await fetch(`${BASE}/${path}`, {
      headers: { "x-api-key": KEY },
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    const err = e as Error;
    if (err.name === "TimeoutError" || err.name === "AbortError") {
      throw new Error(`La API MUNDO SHOP tardó más de ${timeoutMs / 1000}s (timeout).`);
    }
    throw new Error(`No hay conexión con la API MUNDO SHOP (${err.message}).`);
  }
  if (!res.ok) throw new Error(`MUNDO SHOP respondió HTTP ${res.status}`);
  const json = (await res.json()) as T & { error?: string };
  if (json && typeof json === "object" && "error" in json && json.error) {
    throw new Error(String(json.error));
  }
  return json as T;
}

// Publicación de MercadoLibre tal como la devuelve /ml-items y /ml-item/:id (live).
export type MlItem = {
  id: string;
  title: string;
  status: string; // active | paused | closed
  sub_status: string[];
  health: number | null; // 0..1 (calidad); null si ML no la informa
  price: number | null;
  available_quantity: number | null;
  sold_quantity: number | null;
  listing_type: string | null;
  catalog_listing: boolean | null;
  permalink: string | null;
  thumbnail: string | null;
  seller_sku: string | null;
  tags: string[];
};

type MlItemsPage = { paging?: { total?: number }; items?: MlItem[] };

/**
 * Trae TODAS las publicaciones de un estado (active/paused/closed) paginando el
 * endpoint live /ml-items (máx. 100 por página). La primera página revela el
 * total y el resto se pide en paralelo.
 *
 * OJO: la API de búsqueda de MercadoLibre tiene un tope duro de offset 1000, así
 * que si un estado tiene más de 1000 publicaciones sólo se pueden leer las
 * primeras 1000. `total` devuelve el total real informado por ML para poder
 * avisar del truncamiento.
 */
export async function msListAllItems(
  status: "active" | "paused" | "closed",
  opts: { max?: number; timeoutMs?: number } = {},
): Promise<{ items: MlItem[]; total: number }> {
  const OFFSET_CAP = 1000; // límite duro de la API de ML
  const max = Math.min(opts.max ?? 5000, OFFSET_CAP);
  const timeoutMs = opts.timeoutMs ?? 30000;
  const first = await msGet<MlItemsPage>(`ml-items?status=${status}&limit=100&offset=0`, timeoutMs);
  const items: MlItem[] = [...(first.items ?? [])];
  const total = first.paging?.total ?? items.length;
  const fetchTo = Math.min(total, max);

  const offsets: number[] = [];
  for (let o = 100; o < fetchTo; o += 100) offsets.push(o);
  const pages = await Promise.all(
    offsets.map((o) =>
      msGet<MlItemsPage>(`ml-items?status=${status}&limit=100&offset=${o}`, timeoutMs)
        .then((p) => p.items ?? [])
        .catch(() => [] as MlItem[]),
    ),
  );
  for (const p of pages) items.push(...p);
  return { items, total };
}
