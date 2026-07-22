// Manejo de fotos de productos en Vercel Blob.
//
// El parser del Excel (`lib/excel.ts`) devuelve cada foto como un data URL
// base64. Guardar ese base64 dentro de Postgres hincha la base y hace lentas
// las consultas, así que acá subimos cada imagen a Vercel Blob y guardamos solo
// la URL pública en la columna `Product.photo`.

import { put, del } from "@vercel/blob";

const DATA_URL_RE = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i;

const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/bmp": "bmp",
  "image/webp": "webp",
};

/** ¿La foto ya está guardada como URL de Vercel Blob (no un data URL)? */
export function isBlobPhoto(url: string | null | undefined): url is string {
  return (
    typeof url === "string" &&
    /^https?:\/\//i.test(url) &&
    url.includes(".public.blob.vercel-storage.com")
  );
}

/** ¿La foto es un data URL base64 (todavía sin migrar)? */
export function isDataUrlPhoto(url: string | null | undefined): url is string {
  return typeof url === "string" && DATA_URL_RE.test(url);
}

/** El token de escritura solo existe en Vercel (o si se define localmente). */
export function blobAvailable(): boolean {
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}

/** Ejecuta las tareas con un límite de concurrencia. */
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

/** Sube un único data URL base64 a Blob y devuelve la URL pública. */
export async function uploadDataUrl(dataUrl: string, keyPrefix: string): Promise<string> {
  const m = DATA_URL_RE.exec(dataUrl);
  if (!m) throw new Error("No es un data URL de imagen válido");
  const mime = m[1].toLowerCase();
  const ext = EXT_BY_MIME[mime] ?? "png";
  const bytes = Buffer.from(m[2], "base64");
  const { url } = await put(`${keyPrefix}/photo.${ext}`, bytes, {
    access: "public",
    contentType: mime,
    addRandomSuffix: true,
  });
  return url;
}

/**
 * Sube a Blob todas las fotos que vengan como data URL y devuelve un mapa
 * `dataUrl -> urlPública`. Deduplica: cada imagen idéntica se sube una sola vez
 * (el parser ya reutiliza el mismo string para fotos repetidas).
 *
 * Si no hay token de Blob (ej. desarrollo local sin configurar), devuelve un
 * mapa vacío para que el llamador conserve el base64 y nada se rompa.
 */
export async function uploadDataUrlPhotos(
  photos: (string | null | undefined)[],
  keyPrefix: string,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!blobAvailable()) return map;

  const unique = Array.from(
    new Set(photos.filter((p): p is string => isDataUrlPhoto(p))),
  );
  if (unique.length === 0) return map;

  const urls = await mapLimit(unique, 10, (dataUrl) => uploadDataUrl(dataUrl, keyPrefix));
  unique.forEach((dataUrl, i) => map.set(dataUrl, urls[i]));
  return map;
}

/** Borra de Blob las URLs que sean fotos alojadas ahí (best-effort). */
export async function deleteBlobPhotos(urls: (string | null | undefined)[]): Promise<void> {
  const toDelete = Array.from(new Set(urls.filter(isBlobPhoto)));
  if (toDelete.length === 0) return;
  await del(toDelete).catch(() => {});
}
