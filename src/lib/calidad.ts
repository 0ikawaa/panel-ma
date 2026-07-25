// Reporte "Calidad de las publicaciones".
//
// Toma las publicaciones ACTIVAS de MercadoLibre (detalle live /ml-item/:id) y,
// para cada una, arma la lista de objetivos concretos a mejorar. Los objetivos se
// dividen en dos categorías:
//   • CALIDAD     → mueven el health de ML o son penalizaciones (foto principal,
//                   resto de fotos, ficha técnica, carrito, infracciones,
//                   visibilidad).
//   • OPORTUNIDAD → mejoran conversión y posicionamiento aunque no siempre suban
//                   el health (envío gratis, catálogo, video, descuento fidelidad).
//
// Se prioriza por VISITAS de los últimos 30 días: una publicación floja pero muy
// visitada está perdiendo ventas y va primero.
//
// Módulo PURO (sin red/DB) → testeable. El fetch live vive en `calidad.server.ts`.

import type { MlItemDetail } from "@/lib/mundoshop";

export const CALIDAD_KEY = "calidad";

// Umbral a partir del cual consideramos la calidad "al máximo".
export const CALIDAD_MAX = 0.99;

// Resolución recomendada por ML para permitir el zoom de las fotos.
export const RES_RECOMENDADA = 1200;

export type Severidad = "alta" | "media" | "baja";
export type Categoria = "calidad" | "oportunidad";

export type Objetivo = {
  code: string;
  label: string;
  severidad: Severidad;
  categoria: Categoria;
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
  originalPrice: number | null;
  disponibles: number | null; // available_quantity
  vendidas: number | null; // sold_quantity (histórico)
  visitas30d: number | null; // visitas últimos 30 días
  listingType: string | null;
  catalogo: boolean; // catalog_listing (está publicada en catálogo)
  tieneFichaCatalogo: boolean; // existe catalog_product_id para competir
  fotosCount: number | null;
  fotosMinRes: number | null;
  // Flags de estado (para KPIs y filtros)
  infracciones: boolean;
  visibilidadReducida: boolean;
  sinFotoPrincipal: boolean;
  fotosBajaCalidad: boolean;
  sinEnvioGratis: boolean;
  fueraCatalogo: boolean;
  sinVideo: boolean;
  sinFidelidad: boolean;
  issuesMl: string[]; // diagnóstico crudo de la API (informativo)
  objetivos: Objetivo[];
  prioridad: number; // score interno de orden (mayor = más urgente)
};

export type CalidadReport = {
  key: typeof CALIDAD_KEY;
  generadoEn: string;
  fallidos?: number; // detalles que no se pudieron traer (degradados)
  items: CalidadItem[]; // las que tienen al menos un objetivo (calidad u oportunidad)
  summary: {
    activas: number; // total de publicaciones activas evaluadas
    maxima: number; // con calidad (health) al máximo y sin objetivos de calidad
    aMejorar: number; // con al menos un objetivo de CALIDAD
    conInfracciones: number;
    visibilidadReducida: number;
    sinFotoPrincipal: number;
    fotosBajaCalidad: number;
    sinEnvioGratis: number;
    fueraCatalogo: number;
    sinVideo: number;
    sinFidelidad: number;
    healthPromedio: number | null; // promedio de calidad de las activas
    visitasEnRiesgo: number; // suma de visitas 30d de las que tienen objetivos de calidad
  };
};

const has = (tags: string[], t: string) => tags.includes(t);

/**
 * Objetivos a cumplir para una publicación, según sus tags, su health y los
 * campos del detalle. Ordenados por categoría (calidad → oportunidad) y severidad.
 */
export function objetivosDe(item: MlItemDetail): Objetivo[] {
  const tags = item.tags ?? [];
  const out: Objetivo[] = [];

  // ---- CALIDAD (mueven el health / penalizaciones) ----
  if (has(tags, "under_infractions")) {
    out.push({ code: "infracciones", categoria: "calidad", severidad: "alta", label: "Resolver las infracciones pendientes (bajan la calidad y la visibilidad)" });
  }
  if (!has(tags, "good_quality_thumbnail")) {
    out.push({ code: "foto_principal", categoria: "calidad", severidad: "alta", label: "Subir una foto principal de mejor calidad (fondo blanco, alta resolución)" });
  }
  if (has(tags, "dragged_bids_and_visits")) {
    out.push({ code: "visibilidad", categoria: "calidad", severidad: "alta", label: "ML redujo la visibilidad: revisar precio, competencia y reputación" });
  }
  // La ficha técnica / atributos es el principal motor del health y no viene en tags.
  if (item.health !== null && item.health < CALIDAD_MAX) {
    out.push({ code: "ficha", categoria: "calidad", severidad: "media", label: "Completar la ficha técnica y la descripción (atributos, medidas, características)" });
  }
  if (!has(tags, "good_quality_picture")) {
    const res = item.photos_min_resolution;
    const detalle = res !== null ? ` (la más chica es de ${res}px; subir a ${RES_RECOMENDADA}×${RES_RECOMENDADA}+)` : ` (subir a ${RES_RECOMENDADA}×${RES_RECOMENDADA}+)`;
    out.push({ code: "fotos", categoria: "calidad", severidad: "media", label: `Reemplazar fotos de baja resolución${detalle}` });
  }
  if (!has(tags, "cart_eligible")) {
    out.push({ code: "carrito", categoria: "calidad", severidad: "media", label: "Habilitar el carrito de compras" });
  }

  // ---- OPORTUNIDADES (conversión / posicionamiento) ----
  if (!item.free_shipping) {
    out.push({ code: "envio_gratis", categoria: "oportunidad", severidad: "media", label: "Ofrecer envío gratis (mejora la conversión y el posicionamiento)" });
  }
  if (item.catalog_listing !== true) {
    if (item.catalog_product_id) {
      out.push({ code: "catalogo", categoria: "oportunidad", severidad: "media", label: "Publicar en catálogo: existe ficha de catálogo para competir por la Buy Box" });
    } else {
      out.push({ code: "catalogo", categoria: "oportunidad", severidad: "baja", label: "Sumar la publicación al catálogo de ML si hay ficha disponible" });
    }
  }
  if (!item.has_video) {
    out.push({ code: "video", categoria: "oportunidad", severidad: "baja", label: "Agregar un video corto mostrando el producto" });
  }
  if (!has(tags, "loyalty_discount_eligible")) {
    out.push({ code: "fidelidad", categoria: "oportunidad", severidad: "baja", label: "Sumar descuento de fidelidad (Mercado Puntos / Nivel)" });
  }

  const ordenCat: Record<Categoria, number> = { calidad: 0, oportunidad: 1 };
  const ordenSev: Record<Severidad, number> = { alta: 0, media: 1, baja: 2 };
  return out.sort((a, b) => ordenCat[a.categoria] - ordenCat[b.categoria] || ordenSev[a.severidad] - ordenSev[b.severidad]);
}

// Peso por severidad y categoría. La calidad pesa mucho más que la oportunidad.
const peso: Record<Categoria, Record<Severidad, number>> = {
  calidad: { alta: 1000, media: 100, baja: 10 },
  oportunidad: { alta: 30, media: 30, baja: 3 },
};

/** Score de prioridad: peso de los objetivos amplificado por las visitas 30d. */
function prioridadDe(objetivos: Objetivo[], visitas30d: number | null): number {
  const base = objetivos.reduce((s, o) => s + peso[o.categoria][o.severidad], 0);
  const factorVisitas = 1 + Math.log10((visitas30d ?? 0) + 1);
  return Math.round(base * factorVisitas);
}

function toCalidadItem(item: MlItemDetail): CalidadItem {
  const tags = item.tags ?? [];
  const objetivos = objetivosDe(item);
  return {
    id: item.id,
    titulo: item.title,
    sku: item.seller_sku || null,
    permalink: item.permalink,
    thumbnail: item.thumbnail,
    health: item.health,
    calidadPct: item.health === null ? null : Math.round(item.health * 100),
    price: item.price,
    originalPrice: item.original_price,
    disponibles: item.available_quantity,
    vendidas: item.sold_quantity,
    visitas30d: item.visits_30d,
    listingType: item.listing_type,
    catalogo: item.catalog_listing === true,
    tieneFichaCatalogo: !!item.catalog_product_id,
    fotosCount: item.photos_count,
    fotosMinRes: item.photos_min_resolution,
    infracciones: has(tags, "under_infractions"),
    visibilidadReducida: has(tags, "dragged_bids_and_visits"),
    sinFotoPrincipal: !has(tags, "good_quality_thumbnail"),
    fotosBajaCalidad: !has(tags, "good_quality_picture"),
    sinEnvioGratis: !item.free_shipping,
    fueraCatalogo: item.catalog_listing !== true,
    sinVideo: !item.has_video,
    sinFidelidad: !has(tags, "loyalty_discount_eligible"),
    issuesMl: item.issues ?? [],
    objetivos,
    prioridad: prioridadDe(objetivos, item.visits_30d),
  };
}

/** Cantidad de objetivos de categoría "calidad" (gaps reales de health). */
function objetivosCalidad(it: CalidadItem): number {
  return it.objetivos.filter((o) => o.categoria === "calidad").length;
}

/** Está al máximo = health >= umbral y sin objetivos de CALIDAD pendientes. */
function esMaxima(it: CalidadItem): boolean {
  const healthOk = it.health === null ? false : it.health >= CALIDAD_MAX;
  return healthOk && objetivosCalidad(it) === 0;
}

/** Núcleo del reporte: evalúa las publicaciones y arma la lista a mejorar. Puro → testeable. */
export function evaluarCalidad(items: MlItemDetail[], generadoEn: string, fallidos = 0): CalidadReport {
  const evaluadas = items.map(toCalidadItem);

  let maxima = 0;
  let conInfracciones = 0;
  let visibilidadReducida = 0;
  let sinFotoPrincipal = 0;
  let fotosBajaCalidad = 0;
  let sinEnvioGratis = 0;
  let fueraCatalogo = 0;
  let sinVideo = 0;
  let sinFidelidad = 0;
  let sumHealth = 0;
  let nHealth = 0;
  let visitasEnRiesgo = 0;

  for (const it of evaluadas) {
    if (esMaxima(it)) maxima += 1;
    if (it.infracciones) conInfracciones += 1;
    if (it.visibilidadReducida) visibilidadReducida += 1;
    if (it.sinFotoPrincipal) sinFotoPrincipal += 1;
    if (it.fotosBajaCalidad) fotosBajaCalidad += 1;
    if (it.sinEnvioGratis) sinEnvioGratis += 1;
    if (it.fueraCatalogo) fueraCatalogo += 1;
    if (it.sinVideo) sinVideo += 1;
    if (it.sinFidelidad) sinFidelidad += 1;
    if (it.health !== null) {
      sumHealth += it.health;
      nHealth += 1;
    }
    if (objetivosCalidad(it) > 0) visitasEnRiesgo += it.visitas30d ?? 0;
  }

  // Listamos todo lo que tiene al menos un objetivo (calidad u oportunidad).
  const aMejorar = evaluadas.filter((it) => it.objetivos.length > 0);

  // Peor primero: infracciones, luego mayor prioridad (peso × visitas), luego menor health.
  aMejorar.sort((a, b) => {
    if (a.infracciones !== b.infracciones) return a.infracciones ? -1 : 1;
    if (a.prioridad !== b.prioridad) return b.prioridad - a.prioridad;
    return (a.health ?? 1) - (b.health ?? 1);
  });

  return {
    key: CALIDAD_KEY,
    generadoEn,
    fallidos: fallidos || undefined,
    items: aMejorar,
    summary: {
      activas: evaluadas.length,
      maxima,
      aMejorar: evaluadas.filter((it) => objetivosCalidad(it) > 0).length,
      conInfracciones,
      visibilidadReducida,
      sinFotoPrincipal,
      fotosBajaCalidad,
      sinEnvioGratis,
      fueraCatalogo,
      sinVideo,
      sinFidelidad,
      healthPromedio: nHealth > 0 ? sumHealth / nHealth : null,
      visitasEnRiesgo,
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
