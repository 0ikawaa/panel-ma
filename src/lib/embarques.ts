// Etapas del embarque (tablero kanban) y documentación exigida en cada una.

export const ESTADOS = [
  { key: "produccion", label: "En producción", hint: "El proveedor está fabricando" },
  { key: "embarcado", label: "Embarcado", hint: "Cargado y salió del puerto de origen" },
  { key: "transito", label: "En tránsito", hint: "Navegando hacia Montevideo" },
  { key: "aduana", label: "En aduana", hint: "Llegó al puerto, en despacho" },
  { key: "deposito", label: "En depósito", hint: "Ingresó y está disponible" },
] as const;

export type Estado = (typeof ESTADOS)[number]["key"];

export const ESTADO_KEYS = ESTADOS.map((e) => e.key) as Estado[];

export function isEstado(v: unknown): v is Estado {
  return typeof v === "string" && (ESTADO_KEYS as string[]).includes(v);
}

export function estadoLabel(e: Estado): string {
  return ESTADOS.find((x) => x.key === e)?.label ?? e;
}

/**
 * Estado que se muestra. `receivedAt` tiene prioridad sobre la columna `status`:
 * los contenedores creados antes del tablero solo tienen `receivedAt`, así que
 * de esta forma aparecen en la columna correcta sin migrar datos.
 */
export function estadoEfectivo(c: {
  status?: string | null;
  receivedAt?: Date | string | null;
}): Estado {
  if (c.receivedAt) return "deposito";
  return isEstado(c.status) ? c.status : "produccion";
}

/** Estado inmediatamente anterior (para cuando se saca de "en depósito"). */
export function estadoAnterior(e: Estado): Estado {
  const i = ESTADO_KEYS.indexOf(e);
  return i > 0 ? ESTADO_KEYS[i - 1] : ESTADO_KEYS[0];
}

// ---------- Documentos ----------

export const DOC_TYPES = [
  { key: "factura", label: "Factura comercial" },
  { key: "packing", label: "Packing list" },
  { key: "bl", label: "BL / Conocimiento de embarque" },
  { key: "dua", label: "DUA" },
  { key: "seguro", label: "Póliza de seguro" },
  { key: "otro", label: "Otro" },
] as const;

export type DocType = (typeof DOC_TYPES)[number]["key"];

export const DOC_KEYS = DOC_TYPES.map((d) => d.key) as DocType[];

export function isDocType(v: unknown): v is DocType {
  return typeof v === "string" && (DOC_KEYS as string[]).includes(v);
}

export function docLabel(t: string): string {
  return DOC_TYPES.find((d) => d.key === t)?.label ?? t;
}

/**
 * Documentación que ya debería estar cargada al llegar a cada etapa. Es
 * acumulativa: lo exigido en "en tránsito" sigue exigiéndose en "aduana".
 * "otro" y "seguro" nunca son obligatorios.
 */
export const REQUERIDOS: Record<Estado, DocType[]> = {
  produccion: [],
  embarcado: ["factura", "packing"],
  transito: ["factura", "packing", "bl"],
  aduana: ["factura", "packing", "bl"],
  deposito: ["factura", "packing", "bl", "dua"],
};

/** Documentos obligatorios que faltan para el estado dado. */
export function faltantes(estado: Estado, tiposCargados: string[]): DocType[] {
  const tengo = new Set(tiposCargados);
  return REQUERIDOS[estado].filter((t) => !tengo.has(t));
}

/** ¿Es una URL de Vercel Blob? Solo aceptamos archivos subidos por nosotros. */
export function isBlobUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname.endsWith(".blob.vercel-storage.com");
  } catch {
    return false;
  }
}
