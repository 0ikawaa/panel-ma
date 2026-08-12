// Cliente de la API externa MUNDO SHOP (solo lectura: Odoo + MercadoLibre).
// La clave vive en el .env (server-only) y nunca se expone al navegador.

const BASE = process.env.MUNDOSHOP_BASE_URL || "http://68.183.134.24:3001/api/ext";
const KEY = process.env.MUNDOSHOP_API_KEY || "";

type Row = Record<string, unknown>;

/**
 * Filas de una respuesta de MUNDO SHOP, sea cual sea la forma en que vengan.
 *
 * OJO: la API v3 (29/07/2026) devuelve el array de filas PELADO (`[{...}]`),
 * mientras que la v1/v2 lo envolvía en `{ rows: [...] }`. Leer sólo `.rows`
 * hacía que todo panel viera cero filas sin ningún error visible — la causa de
 * que "no anduviera nada". Se aceptan las dos formas (y `data`) para no volver
 * a romperse si el envoltorio cambia de nuevo.
 */
function asRows(json: unknown): Row[] {
  if (Array.isArray(json)) return json as Row[];
  if (json && typeof json === "object") {
    const o = json as { rows?: unknown; data?: unknown };
    if (Array.isArray(o.rows)) return o.rows as Row[];
    if (Array.isArray(o.data)) return o.data as Row[];
  }
  return [];
}

/** Mensaje de error de una respuesta fallida, con el cuerpo si lo trae. */
async function httpError(res: Response, what: string): Promise<Error> {
  let detalle = "";
  try {
    detalle = (await res.text()).trim().slice(0, 200);
  } catch {
    /* sin cuerpo */
  }
  // Los endpoints /ml-* consultan MercadoLibre en vivo desde el servidor de la
  // API. Cuando ahí se cae el token de ML, la API contesta 500 (con un 401 de ML
  // adentro) y no hay nada que arreglar de este lado: hay que avisarle a quien
  // mantiene MUNDO SHOP. El mensaje lo dice para no perder tiempo buscando acá.
  const esLive = what.startsWith("/ml-");
  const pista = esLive
    ? " — la API no está pudiendo consultar MercadoLibre en vivo (token de ML vencido del lado de MUNDO SHOP)."
    : "";
  return new Error(
    `MUNDO SHOP respondió HTTP ${res.status} en ${what}${detalle ? `: ${detalle}` : ""}${pista}`,
  );
}

/** Traduce un fallo de red/timeout de fetch al mensaje que ve el usuario. */
function networkError(e: unknown, timeoutMs: number, extra = ""): Error {
  const err = e as Error;
  if (err.name === "TimeoutError" || err.name === "AbortError") {
    return new Error(`La API MUNDO SHOP tardó más de ${timeoutMs / 1000}s (timeout).${extra}`);
  }
  // ECONNREFUSED / ENOTFOUND / red caída, etc.
  return new Error(`No hay conexión con la API MUNDO SHOP (${err.message}).`);
}

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
    throw networkError(e, timeoutMs, " Probá un rango más chico.");
  }
  if (!res.ok) throw await httpError(res, "/query");
  const json = (await res.json()) as unknown;
  if (json && !Array.isArray(json) && typeof json === "object") {
    const err = (json as { error?: unknown }).error;
    if (err) throw new Error(String(err));
  }
  return asRows(json);
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

  // Todo desde la BD (rápido y sin depender de que ML live responda): el puente
  // item_id→SKU, el respaldo de fotos de ml_item_sales y las publicaciones
  // sincronizadas de ml_items (que ya traen thumbnail para todas las activas).
  let bridgeRows: Row[];
  let salesRows: Row[];
  let itemRows: Row[];
  try {
    [bridgeRows, salesRows, itemRows] = await Promise.all([
      msQuery(`SELECT DISTINCT item_id, item_sku FROM ml_order_items WHERE item_sku IS NOT NULL AND item_sku <> ''`, timeoutMs),
      msQuery(`SELECT item_id, MAX(thumbnail) AS thumb FROM ml_item_sales WHERE thumbnail IS NOT NULL AND thumbnail <> '' GROUP BY item_id`, timeoutMs),
      msQuery(`SELECT id, seller_sku, thumbnail FROM ml_items WHERE thumbnail IS NOT NULL AND thumbnail <> ''`, timeoutMs),
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
  // …y encima las publicaciones sincronizadas (ml_items), que son las vigentes.
  // `liveIds` marca las que vienen de una publicación viva para preferir su foto
  // cuando un SKU tiene varias publicaciones.
  const liveIds = new Set<string>();
  const addLive = (id: string, thumb: string | null | undefined) => {
    const t = httpsUrl(thumb);
    if (!t) return;
    thumbByItem.set(id, t);
    liveIds.add(id);
  };
  for (const r of itemRows) addLive(String(r.id), r.thumbnail as string | null);

  // `ml_items.seller_sku` ata la foto al SKU sin pasar por el puente de ventas,
  // así que cubre también publicaciones que todavía no vendieron.
  const skuDirecto = new Map<string, string>();
  for (const r of itemRows) {
    const sku = parseSellerSku(r.seller_sku as string | null);
    const t = httpsUrl(r.thumbnail as string | null);
    if (sku && t && !skuDirecto.has(sku)) skuDirecto.set(sku, t);
  }

  // Las publicaciones live de ML, cuando la API las devuelve, son lo más fresco y
  // suman las pausadas/cerradas que no están en ml_items. Es una mejora opcional:
  // si el live falla (hoy responde 500), se sigue con lo de la BD.
  try {
    const [act, pau, clo] = await Promise.all([
      msListAllItems("active", { timeoutMs }),
      msListAllItems("paused", { timeoutMs }),
      msListAllItems("closed", { timeoutMs }),
    ]);
    for (const it of [...act.items, ...pau.items, ...clo.items]) addLive(it.id, it.thumbnail);
  } catch {
    /* sin live: cobertura reducida, no rompe */
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
  // El puente sólo cubre SKUs que alguna vez vendieron; para el resto vale el
  // seller_sku de la publicación.
  for (const [sku, t] of skuDirecto) {
    if (!bySku.has(sku)) bySku.set(sku, t);
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
    throw networkError(e, timeoutMs);
  }
  if (!res.ok) throw await httpError(res, `/${path.split("?")[0]}`);
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

// Detalle enriquecido de una publicación (endpoint live /ml-item/:id). Superset
// de MlItem: agrega los campos que sólo devuelve el detalle (fotos, video, envío,
// catálogo, visitas, atributos…) y el array `issues` que la propia API pre-calcula.
export type MlItemDetail = MlItem & {
  original_price: number | null; // precio de lista si hay promo/descuento
  currency: string | null;
  condition: string | null; // new | used
  catalog_product_id: string | null; // ficha de catálogo con la que se podría competir
  visits_30d: number | null; // visitas de los últimos 30 días (para priorizar)
  photos_count: number | null;
  photos_min_resolution: number | null; // lado más corto de la foto más chica (px)
  has_video: boolean;
  free_shipping: boolean;
  warranty: string | null;
  attributes_count: number | null;
  description_length: number | null;
  date_created: string | null;
  issues: string[]; // diagnóstico ya armado por la API (texto libre, informativo)
};

/** Normaliza el JSON crudo del detalle a MlItemDetail (rellena nulos y arrays). */
function toItemDetail(raw: Record<string, unknown>): MlItemDetail {
  const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
  return {
    id: String(raw.id),
    title: String(raw.title ?? ""),
    status: String(raw.status ?? ""),
    sub_status: Array.isArray(raw.sub_status) ? (raw.sub_status as string[]) : [],
    health: num(raw.health),
    price: num(raw.price),
    available_quantity: num(raw.available_quantity),
    sold_quantity: num(raw.sold_quantity),
    listing_type: str(raw.listing_type),
    catalog_listing: typeof raw.catalog_listing === "boolean" ? raw.catalog_listing : null,
    permalink: str(raw.permalink),
    thumbnail: httpsUrl(str(raw.thumbnail)),
    seller_sku: str(raw.seller_sku),
    tags: Array.isArray(raw.tags) ? (raw.tags as string[]) : [],
    original_price: num(raw.original_price),
    currency: str(raw.currency),
    condition: str(raw.condition),
    catalog_product_id: str(raw.catalog_product_id),
    visits_30d: num(raw.visits_30d),
    photos_count: num(raw.photos_count),
    photos_min_resolution: num(raw.photos_min_resolution),
    has_video: raw.has_video === true,
    free_shipping: raw.free_shipping === true,
    warranty: str(raw.warranty),
    attributes_count: num(raw.attributes_count),
    description_length: num(raw.description_length),
    date_created: str(raw.date_created),
    issues: Array.isArray(raw.issues) ? (raw.issues as string[]) : [],
  };
}

/** Detalle live de una publicación por id (/ml-item/:id). */
export async function msGetItemDetail(id: string, timeoutMs = 20000): Promise<MlItemDetail> {
  const raw = await msGet<Record<string, unknown>>(`ml-item/${id}`, timeoutMs);
  return toItemDetail(raw);
}

/** Corre `fn` sobre `items` con un límite de concurrencia (pool de workers). */
async function mapPool<T, R>(items: T[], limit: number, fn: (t: T, i: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let idx = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = idx++;
      if (i >= items.length) break;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

/**
 * Trae TODAS las publicaciones activas con su detalle enriquecido: primero
 * enumera los ids con /ml-items y luego pide /ml-item/:id de cada uno en paralelo
 * (pool acotado). Si el detalle de alguna falla, se degrada al item de la lista
 * (con los campos de detalle en null) para no romper el reporte. `fallidos` cuenta
 * cuántos detalles no se pudieron traer.
 */
export async function msListActiveDetailed(
  opts: { timeoutMs?: number; concurrency?: number } = {},
): Promise<{ items: MlItemDetail[]; total: number; fallidos: number }> {
  const timeoutMs = opts.timeoutMs ?? 20000;
  const { items: base, total } = await msListAllItems("active", { timeoutMs });
  const details = await mapPool(base, opts.concurrency ?? 24, (it) =>
    msGetItemDetail(it.id, timeoutMs).catch(() => null),
  );
  let fallidos = 0;
  const items: MlItemDetail[] = base.map((b, i) => {
    const d = details[i];
    if (d) return d;
    fallidos += 1;
    return {
      ...b,
      original_price: null,
      currency: null,
      condition: null,
      catalog_product_id: null,
      visits_30d: null,
      photos_count: null,
      photos_min_resolution: null,
      has_video: false,
      free_shipping: false,
      warranty: null,
      attributes_count: null,
      description_length: null,
      date_created: null,
      issues: [],
    };
  });
  return { items, total, fallidos };
}

// ---------------------------------------------------------------- experiencia

// Un aspecto evaluado por /ml-experiencia/:id. Los nueve `item` que devuelve hoy
// son: Health ML, Fotos, Descripcion, Video, Reviews, Envio gratis, Catalogo ML,
// Carrito e Infracciones (sin tildes, tal cual los manda la API).
export type MlCheck = {
  item: string;
  status: "ok" | "warn" | "bad";
  detail: string; // texto libre, ej. "3 fotos", "187 chars — ampliar"
};

export type MlReview = {
  rate: number; // 1..5
  title: string;
  content: string;
  date: string | null; // ISO
};

// Respuesta de /ml-experiencia/:id: el puntaje 0–100 de experiencia de compra
// con el detalle de los nueve aspectos que lo componen.
export type MlExperiencia = {
  id: string;
  title: string;
  status: string;
  price: number | null;
  permalink: string | null;
  experience_score: number; // 0..100
  experience_level: string; // EXCELENTE | BUENA | REGULAR | MALA
  checks: MlCheck[];
  reviews_summary: { total: number; avg: number | null; last_reviews: MlReview[] };
  visits_30d: number | null;
  sold_quantity: number | null;
  available_quantity: number | null;
};

const CHECK_STATUS = new Set(["ok", "warn", "bad"]);

/** Normaliza el JSON crudo de /ml-experiencia/:id (rellena nulos y arrays). */
function toExperiencia(raw: Record<string, unknown>): MlExperiencia {
  const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
  const rawChecks = Array.isArray(raw.checks) ? (raw.checks as Record<string, unknown>[]) : [];
  const rs = (raw.reviews_summary ?? {}) as Record<string, unknown>;
  const rawReviews = Array.isArray(rs.last_reviews) ? (rs.last_reviews as Record<string, unknown>[]) : [];
  return {
    id: String(raw.id),
    title: String(raw.title ?? ""),
    status: String(raw.status ?? ""),
    price: num(raw.price),
    permalink: str(raw.permalink),
    // Si la API no manda puntaje, 0 sería mentir; se toma -1 como "sin dato" y
    // el reporte lo descarta. En la práctica siempre viene.
    experience_score: num(raw.experience_score) ?? -1,
    experience_level: String(raw.experience_level ?? ""),
    checks: rawChecks.map((c) => ({
      item: String(c.item ?? ""),
      status: (CHECK_STATUS.has(String(c.status)) ? String(c.status) : "warn") as MlCheck["status"],
      detail: String(c.detail ?? ""),
    })),
    reviews_summary: {
      total: num(rs.total) ?? 0,
      avg: num(rs.avg),
      last_reviews: rawReviews.map((r) => ({
        rate: num(r.rate) ?? 0,
        title: String(r.title ?? "").trim(),
        content: String(r.content ?? "").trim(),
        date: str(r.date),
      })),
    },
    visits_30d: num(raw.visits_30d),
    sold_quantity: num(raw.sold_quantity),
    available_quantity: num(raw.available_quantity),
  };
}

/** Experiencia de compra de una publicación (/ml-experiencia/:id, live). */
export async function msGetExperiencia(id: string, timeoutMs = 20000): Promise<MlExperiencia> {
  const raw = await msGet<Record<string, unknown>>(`ml-experiencia/${id}`, timeoutMs);
  return toExperiencia(raw);
}

// Reputación global del vendedor (/ml-reputacion). Los reclamos son del SELLER
// completo (últimos 120 días): la API de ML no expone reclamos por publicación.
export type MlMetrica = { cantidad: number; tasa: number | null; tasa_pct: string | null };

export type MlReputacion = {
  nivel: string | null; // ej. "5_green"
  power_seller: string | null; // ej. "platinum"
  ventas_totales: number | null;
  ventas_completadas: number | null;
  ventas_canceladas: number | null;
  ratings: { positive: number | null; neutral: number | null; negative: number | null };
  metricas_120d: {
    ventas_completadas: number | null;
    reclamos: MlMetrica;
    demoras_despacho: MlMetrica;
    cancelaciones: MlMetrica;
  };
};

function toMetrica(raw: unknown): MlMetrica {
  const o = (raw ?? {}) as Record<string, unknown>;
  const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return {
    cantidad: num(o.cantidad) ?? 0,
    tasa: num(o.tasa),
    tasa_pct: typeof o.tasa_pct === "string" ? o.tasa_pct : null,
  };
}

/** Reputación global del vendedor (/ml-reputacion). */
export async function msGetReputacion(timeoutMs = 20000): Promise<MlReputacion> {
  const raw = await msGet<Record<string, unknown>>("ml-reputacion", timeoutMs);
  const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
  const ratings = (raw.ratings ?? {}) as Record<string, unknown>;
  const m = (raw.metricas_120d ?? {}) as Record<string, unknown>;
  return {
    nivel: str(raw.nivel),
    power_seller: str(raw.power_seller),
    ventas_totales: num(raw.ventas_totales),
    ventas_completadas: num(raw.ventas_completadas),
    ventas_canceladas: num(raw.ventas_canceladas),
    ratings: {
      positive: num(ratings.positive),
      neutral: num(ratings.neutral),
      negative: num(ratings.negative),
    },
    metricas_120d: {
      ventas_completadas: num(m.ventas_completadas),
      reclamos: toMetrica(m.reclamos),
      demoras_despacho: toMetrica(m.demoras_despacho),
      cancelaciones: toMetrica(m.cancelaciones),
    },
  };
}

/**
 * El `seller_sku` que devuelve ML no siempre es un SKU: en las publicaciones
 * sincronizadas con el ERP viene un JSON como
 * `{"PrId":"257","PrMPC":"1","SKU":"831-0"}`. Devuelve el SKU de adentro cuando
 * es así, el string tal cual cuando ya es un SKU, y null cuando está vacío.
 */
export function parseSellerSku(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  if (s.startsWith("{")) {
    try {
      const o = JSON.parse(s) as Record<string, unknown>;
      const inner = o.SKU ?? o.sku;
      const v = typeof inner === "string" ? inner.trim() : "";
      return v || null;
    } catch {
      return null; // JSON roto: mejor sin SKU que con basura
    }
  }
  return s;
}

/**
 * Trae TODAS las publicaciones activas con su experiencia de compra: enumera
 * los ids con /ml-items (que además aporta thumbnail, seller_sku y tags, que la
 * experiencia no devuelve) y pide /ml-experiencia/:id de cada una en paralelo
 * (pool acotado). Las que fallan quedan con `exp: null` y se cuentan en
 * `fallidos` para poder avisar que el reporte salió incompleto.
 */
export async function msListActiveExperiencia(
  opts: { timeoutMs?: number; concurrency?: number } = {},
): Promise<{ rows: { item: MlItem; exp: MlExperiencia | null }[]; total: number; fallidos: number }> {
  const timeoutMs = opts.timeoutMs ?? 20000;
  const { items, total } = await msListAllItems("active", { timeoutMs });
  const exps = await mapPool(items, opts.concurrency ?? 24, (it) =>
    msGetExperiencia(it.id, timeoutMs).catch(() => null),
  );
  let fallidos = 0;
  const rows = items.map((item, i) => {
    const exp = exps[i];
    if (!exp || exp.experience_score < 0) {
      fallidos += 1;
      return { item, exp: null };
    }
    return { item, exp };
  });
  return { rows, total, fallidos };
}

type MlItemsPage = { paging?: { total?: number }; items?: MlItem[] };

/**
 * Normaliza una página de /ml-items. Igual que en `/query`, la respuesta puede
 * venir envuelta (`{paging, items}`) o como array pelado; en ese caso no hay
 * total y se usa el largo de la página.
 */
function toItemsPage(json: unknown): { items: MlItem[]; total: number | null } {
  if (Array.isArray(json)) return { items: json as MlItem[], total: null };
  const p = (json ?? {}) as MlItemsPage;
  const items = Array.isArray(p.items) ? p.items : [];
  const total = typeof p.paging?.total === "number" ? p.paging.total : null;
  return { items, total };
}

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
  const first = toItemsPage(await msGet<unknown>(`ml-items?status=${status}&limit=100&offset=0`, timeoutMs));
  const items: MlItem[] = [...first.items];
  const total = first.total ?? items.length;
  const fetchTo = Math.min(total, max);

  const offsets: number[] = [];
  for (let o = 100; o < fetchTo; o += 100) offsets.push(o);
  const pages = await Promise.all(
    offsets.map((o) =>
      msGet<unknown>(`ml-items?status=${status}&limit=100&offset=${o}`, timeoutMs)
        .then((p) => toItemsPage(p).items)
        .catch(() => [] as MlItem[]),
    ),
  );
  for (const p of pages) items.push(...p);
  return { items, total };
}
