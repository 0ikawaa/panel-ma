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

// El mapa de fotos es caro de armar (pagina el live de ML), así que se cachea en
// memoria: las fotos casi no cambian y ML sincroniza cada 2 min. Un guard "in
// flight" evita que varios endpoints lo reconstruyan a la vez en un cold start.
let _photoCache: { at: number; maps: MlPhotoMaps } | null = null;
let _photoInFlight: Promise<MlPhotoMaps> | null = null;
const PHOTO_TTL_MS = 20 * 60 * 1000; // 20 min

/**
 * Mapa SKU → foto principal de MercadoLibre (thumbnail), asociando la foto al SKU
 * con el puente item_id→item_sku de `ml_order_items`. La foto por `item_id` sale
 * de las publicaciones LIVE (activas + pausadas, mejor cobertura) y, como respaldo
 * para publicaciones cerradas, de `ml_item_sales`. Cacheado en memoria; nunca
 * lanza (si algo falla devuelve lo que haya, o mapas vacíos).
 */
export async function mlPhotoMap(timeoutMs = 25000): Promise<MlPhotoMaps> {
  if (_photoCache && Date.now() - _photoCache.at < PHOTO_TTL_MS) return _photoCache.maps;
  if (_photoInFlight) return _photoInFlight;
  _photoInFlight = buildPhotoMap(timeoutMs)
    .then((maps) => {
      _photoCache = { at: Date.now(), maps };
      return maps;
    })
    .catch(() => _photoCache?.maps ?? { bySku: new Map<string, string>(), byBase: new Map<string, string>() })
    .finally(() => {
      _photoInFlight = null;
    });
  return _photoInFlight;
}

async function buildPhotoMap(timeoutMs: number): Promise<MlPhotoMaps> {
  const bySku = new Map<string, string>();
  const byBase = new Map<string, string>();

  // Puente item_id→SKU + respaldo de fotos de ml_item_sales (BD, rápido).
  let bridgeRows: Row[];
  let salesRows: Row[];
  try {
    [bridgeRows, salesRows] = await Promise.all([
      msQuery(`SELECT DISTINCT item_id, item_sku FROM ml_order_items WHERE item_sku IS NOT NULL AND item_sku <> ''`, timeoutMs),
      msQuery(`SELECT item_id, MAX(thumbnail) AS thumb FROM ml_item_sales WHERE thumbnail IS NOT NULL AND thumbnail <> '' GROUP BY item_id`, timeoutMs),
    ]);
  } catch {
    return { bySku, byBase }; // sin puente no hay forma de asociar fotos a SKU
  }

  // Foto por item_id: primero el respaldo de ml_item_sales…
  const thumbByItem = new Map<string, string>();
  for (const r of salesRows) {
    const t = httpsUrl(String(r.thumb));
    if (t) thumbByItem.set(String(r.item_id), t);
  }
  // …y luego las publicaciones live (activas + pausadas), que pisan al respaldo y
  // cubren casi todo lo que se vende. Si el live falla, se sigue con ml_item_sales.
  const liveIds = new Set<string>();
  try {
    const [act, pau, clo] = await Promise.all([
      msListAllItems("active", { timeoutMs }),
      msListAllItems("paused", { timeoutMs }),
      msListAllItems("closed", { timeoutMs }),
    ]);
    for (const it of [...act.items, ...pau.items, ...clo.items]) {
      const t = httpsUrl(it.thumbnail);
      if (t) {
        thumbByItem.set(it.id, t);
        liveIds.add(it.id);
      }
    }
  } catch {
    /* sin live: coberura reducida, no rompe */
  }

  // SKU → foto, prefiriendo la de una publicación live (activa/pausada) por sobre
  // la del respaldo cuando un SKU tiene varias publicaciones.
  const isLiveSku = new Map<string, boolean>();
  for (const r of bridgeRows) {
    const sku = String(r.item_sku);
    const t = thumbByItem.get(String(r.item_id));
    if (!t) continue;
    const live = liveIds.has(String(r.item_id));
    if (!bySku.has(sku) || (live && !isLiveSku.get(sku))) {
      bySku.set(sku, t);
      isLiveSku.set(sku, live);
    }
  }
  for (const [sku, t] of bySku) {
    const b = baseOf(sku);
    if (!byBase.has(b)) byBase.set(b, t);
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
