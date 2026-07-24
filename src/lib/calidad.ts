// Reporte "Calidad de las publicaciones".
//
// Toma las publicaciones ACTIVAS de MercadoLibre (endpoint live /ml-items) y,
// para cada una cuya calidad (health) no está al máximo, arma la lista de
// objetivos concretos a cumplir para subirla. Los objetivos salen de los `tags`
// que ML expone (foto principal, fotos, carrito, fidelidad, infracciones,
// visibilidad) más el propio health (ficha técnica / atributos).
//
// Módulo PURO (sin red/DB) → testeable. El fetch live vive en `calidad.server.ts`.

import type { MlItem } from "@/lib/mundoshop";

export const CALIDAD_KEY = "calidad";

// Umbral a partir del cual consideramos la calidad "al máximo".
export const CALIDAD_MAX = 0.99;

export type Severidad = "alta" | "media" | "baja";

export type Objetivo = {
  code: string;
  label: string;
  severidad: Severidad;
};

export type CalidadItem = {
  id: string;
  titulo: string;
  sku: string | null;
  permalink: string | null;
  thumbnail: string | null;
  health: number | null; // 0..1
  calidadPct: number | null; // health * 100 redondeado
  price: number | null;
  disponibles: number | null; // available_quantity
  vendidas: number | null; // sold_quantity (histórico)
  listingType: string | null;
  catalogo: boolean; // catalog_listing
  infracciones: boolean; // tiene under_infractions
  visibilidadReducida: boolean; // dragged_bids_and_visits
  objetivos: Objetivo[];
};

export type CalidadReport = {
  key: typeof CALIDAD_KEY;
  generadoEn: string;
  items: CalidadItem[]; // sólo las que NO están al máximo (con objetivos)
  summary: {
    activas: number; // total de publicaciones activas evaluadas
    maxima: number; // con calidad al máximo
    aMejorar: number; // items.length
    conInfracciones: number;
    visibilidadReducida: number;
    sinFotoPrincipal: number;
    healthPromedio: number | null; // promedio de calidad de las activas
  };
};

const has = (tags: string[], t: string) => tags.includes(t);

/**
 * Objetivos a cumplir para una publicación, según sus tags y su health.
 * Ordenados por severidad (alta → baja).
 */
export function objetivosDe(item: MlItem): Objetivo[] {
  const tags = item.tags ?? [];
  const out: Objetivo[] = [];

  if (has(tags, "under_infractions")) {
    out.push({ code: "infracciones", label: "Resolver las infracciones pendientes (bajan la calidad y la visibilidad)", severidad: "alta" });
  }
  if (!has(tags, "good_quality_thumbnail")) {
    out.push({ code: "foto_principal", label: "Subir una foto principal de mejor calidad (fondo blanco, alta resolución)", severidad: "alta" });
  }
  if (has(tags, "dragged_bids_and_visits")) {
    out.push({ code: "visibilidad", label: "ML redujo la visibilidad: revisar precio, competencia y reputación", severidad: "alta" });
  }
  // La ficha técnica / atributos es el principal motor del health y no viene en tags.
  if (item.health !== null && item.health < CALIDAD_MAX) {
    out.push({ code: "ficha", label: "Completar la ficha técnica y la descripción (atributos, medidas, características)", severidad: "media" });
  }
  if (!has(tags, "good_quality_picture")) {
    out.push({ code: "fotos", label: "Mejorar el resto de las fotos (más ángulos, mejor calidad)", severidad: "media" });
  }
  if (!has(tags, "cart_eligible")) {
    out.push({ code: "carrito", label: "Habilitar el carrito de compras", severidad: "media" });
  }
  if (!has(tags, "loyalty_discount_eligible")) {
    out.push({ code: "fidelidad", label: "Sumar descuento de fidelidad (Mercado Puntos / Nivel)", severidad: "baja" });
  }

  const orden: Record<Severidad, number> = { alta: 0, media: 1, baja: 2 };
  return out.sort((a, b) => orden[a.severidad] - orden[b.severidad]);
}

function toCalidadItem(item: MlItem): CalidadItem {
  const tags = item.tags ?? [];
  return {
    id: item.id,
    titulo: item.title,
    sku: item.seller_sku || null,
    permalink: item.permalink,
    thumbnail: item.thumbnail,
    health: item.health,
    calidadPct: item.health === null ? null : Math.round(item.health * 100),
    price: item.price,
    disponibles: item.available_quantity,
    vendidas: item.sold_quantity,
    listingType: item.listing_type,
    catalogo: item.catalog_listing === true,
    infracciones: has(tags, "under_infractions"),
    visibilidadReducida: has(tags, "dragged_bids_and_visits"),
    objetivos: objetivosDe(item),
  };
}

/** Está al máximo = health >= umbral y sin objetivos pendientes. */
function esMaxima(it: CalidadItem): boolean {
  const healthOk = it.health === null ? false : it.health >= CALIDAD_MAX;
  return healthOk && it.objetivos.length === 0;
}

const pesoSeveridad: Record<Severidad, number> = { alta: 100, media: 10, baja: 1 };

/** Núcleo del reporte: evalúa las publicaciones y arma la lista a mejorar. Puro → testeable. */
export function evaluarCalidad(items: MlItem[], generadoEn: string): CalidadReport {
  const evaluadas = items.map(toCalidadItem);

  let maxima = 0;
  let conInfracciones = 0;
  let visibilidadReducida = 0;
  let sinFotoPrincipal = 0;
  let sumHealth = 0;
  let nHealth = 0;

  for (const it of evaluadas) {
    if (esMaxima(it)) maxima += 1;
    if (it.infracciones) conInfracciones += 1;
    if (it.visibilidadReducida) visibilidadReducida += 1;
    if (it.objetivos.some((o) => o.code === "foto_principal")) sinFotoPrincipal += 1;
    if (it.health !== null) {
      sumHealth += it.health;
      nHealth += 1;
    }
  }

  const aMejorar = evaluadas.filter((it) => !esMaxima(it));

  // Peor primero: prioriza infracciones, luego menor calidad, luego peso de objetivos.
  aMejorar.sort((a, b) => {
    if (a.infracciones !== b.infracciones) return a.infracciones ? -1 : 1;
    const ha = a.health ?? 1;
    const hb = b.health ?? 1;
    if (ha !== hb) return ha - hb;
    const pa = a.objetivos.reduce((s, o) => s + pesoSeveridad[o.severidad], 0);
    const pb = b.objetivos.reduce((s, o) => s + pesoSeveridad[o.severidad], 0);
    return pb - pa;
  });

  return {
    key: CALIDAD_KEY,
    generadoEn,
    items: aMejorar,
    summary: {
      activas: evaluadas.length,
      maxima,
      aMejorar: aMejorar.length,
      conInfracciones,
      visibilidadReducida,
      sinFotoPrincipal,
      healthPromedio: nHealth > 0 ? sumHealth / nHealth : null,
    },
  };
}

/** Etiqueta legible del nivel de calidad. */
export function calidadEstado(pct: number | null): { label: string; tone: string } {
  if (pct === null) return { label: "Sin dato", tone: "text-zinc-400" };
  if (pct >= 99) return { label: "Máxima", tone: "text-emerald-300" };
  if (pct >= 85) return { label: "Muy buena", tone: "text-emerald-300" };
  if (pct >= 70) return { label: "Buena", tone: "text-teal-300" };
  if (pct >= 50) return { label: "Regular", tone: "text-amber-300" };
  return { label: "Baja", tone: "text-red-300" };
}
