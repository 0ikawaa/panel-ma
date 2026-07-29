// Reporte "Publicaciones con mala experiencia de compra".
//
// MercadoLibre le pone a cada publicación un puntaje de EXPERIENCIA DE COMPRA de
// 0 a 100 que sale de nueve aspectos con distinto peso (ver ASPECTOS). No es lo
// mismo que el *health* del reporte "Calidad de las publicaciones": el health es
// uno de los nueve aspectos y pesa 25 de los 100 puntos. Este reporte lista todo
// lo que no llega a 100 y dice qué hay que arreglar primero.
//
// Las filas son SKU UNIFICADOS: un mismo producto suele tener varias
// publicaciones (colores, talles, duplicados viejos) y arreglarlas de a una es
// perder el tiempo. Se agrupan por código base ("48000-NEG-40" → "48000"), que
// es el mismo criterio de Reposición y de las fotos por código. Las
// publicaciones sin SKU quedan como grupo propio (no hay con qué unificarlas).
//
// Módulo PURO (sin red/DB) → testeable. El fetch live vive en
// `experiencia.server.ts`.

import { parseSellerSku, type MlCheck, type MlExperiencia, type MlItem } from "@/lib/mundoshop";

export const EXPERIENCIA_KEY = "experiencia";

/** Puntaje perfecto. Todo lo que esté por debajo entra al reporte. */
export const EXPERIENCIA_MAX = 100;

// ------------------------------------------------------------------- aspectos

/**
 * Los nueve aspectos que componen el puntaje, con el peso que les da ML y la
 * recomendación concreta de MercadoLibre para cada uno.
 *
 * `apiItem` es el nombre EXACTO que manda la API en `checks[].item` (sin
 * tildes). Si algún día ML agrega o renombra un aspecto, `aspectoDe` lo deja
 * pasar como aspecto desconocido en vez de perderlo.
 */
export type AspectoDef = {
  code: string;
  apiItem: string;
  label: string;
  peso: number; // puntos que aporta sobre 100
  comoMejorar: string; // qué pide MercadoLibre
};

export const ASPECTOS: AspectoDef[] = [
  {
    code: "health",
    apiItem: "Health ML",
    label: "Calidad de la ficha (health)",
    peso: 25,
    comoMejorar:
      "Completá la ficha técnica: todos los atributos obligatorios y los recomendados (marca, modelo, medidas, material, color). Es lo que más mueve el puntaje y ML lo usa para mostrarte en las búsquedas.",
  },
  {
    code: "fotos",
    apiItem: "Fotos",
    label: "Fotos",
    peso: 15,
    comoMejorar:
      "Subí al menos 6 fotos de 1200×1200 px o más, fondo blanco en la principal, sin textos ni logos ni marcas de agua. Con esa resolución se habilita el zoom, que es lo que ML premia.",
  },
  {
    code: "reviews",
    apiItem: "Reviews",
    label: "Opiniones",
    peso: 15,
    comoMejorar:
      "Las opiniones no se pueden pedir ni comprar: se ganan despachando rápido, describiendo bien el producto y respondiendo las preguntas. Publicar el producto en catálogo hace que hereden las opiniones de la ficha.",
  },
  {
    code: "envio_gratis",
    apiItem: "Envio gratis",
    label: "Envío gratis",
    peso: 10,
    comoMejorar:
      "Activá envío gratis. ML lo usa como filtro de búsqueda y le da más visibilidad; en productos de más de $ 500 lo bonifica en parte.",
  },
  {
    code: "catalogo",
    apiItem: "Catalogo ML",
    label: "Catálogo",
    peso: 10,
    comoMejorar:
      "Sumá la publicación al catálogo de ML para competir por la Buy Box: hereda las opiniones de la ficha y aparece primero cuando ganás el mejor precio.",
  },
  {
    code: "descripcion",
    apiItem: "Descripcion",
    label: "Descripción",
    peso: 10,
    comoMejorar:
      "Escribí al menos 500 caracteres: qué es, medidas, materiales, qué incluye la caja, cómo se usa y garantía. Sin datos de contacto ni links, que ML los penaliza.",
  },
  {
    code: "carrito",
    apiItem: "Carrito",
    label: "Carrito",
    peso: 5,
    comoMejorar:
      "Habilitá la compra con carrito para que te compren varios productos juntos. Pide stock disponible y envío por Mercado Envíos.",
  },
  {
    code: "video",
    apiItem: "Video",
    label: "Video",
    peso: 5,
    comoMejorar:
      "Agregá un video corto (hasta 60 s) mostrando el producto en uso. ML lo muestra junto a las fotos y mejora la conversión.",
  },
  {
    code: "infracciones",
    apiItem: "Infracciones",
    label: "Infracciones",
    peso: 5,
    comoMejorar:
      "Resolvé las infracciones pendientes desde «Mis publicaciones → Infracciones». Además de restar puntos, ML te baja la visibilidad hasta que las cierres.",
  },
];

const PESO_TOTAL = ASPECTOS.reduce((s, a) => s + a.peso, 0); // 100

const porApiItem = new Map(ASPECTOS.map((a) => [a.apiItem.toLowerCase(), a]));

/** Definición del aspecto según el nombre que manda la API (o uno genérico). */
export function aspectoDe(apiItem: string): AspectoDef {
  const found = porApiItem.get(apiItem.trim().toLowerCase());
  if (found) return found;
  // Aspecto nuevo que ML/MUNDO SHOP agregó y todavía no está catalogado: se
  // muestra igual, sin peso conocido, para no esconderlo.
  return {
    code: `otro:${apiItem.trim().toLowerCase().replace(/\s+/g, "_")}`,
    apiItem,
    label: apiItem,
    peso: 0,
    comoMejorar: "Revisá este aspecto en la publicación: MercadoLibre lo está evaluando.",
  };
}

// -------------------------------------------------------------------- semáforo

export type Semaforo = "verde" | "amarillo" | "naranja" | "rojo";

/**
 * Color del semáforo según los niveles que usa ML (EXCELENTE / BUENA / REGULAR /
 * MALA). El 100 exacto también es verde, pero se distingue con `esPerfecta`.
 */
export function semaforoDe(score: number): Semaforo {
  if (score >= 80) return "verde";
  if (score >= 60) return "amarillo";
  if (score >= 40) return "naranja";
  return "rojo";
}

/** Etiqueta del nivel tal como la nombra MercadoLibre. */
export function nivelDe(score: number): string {
  if (score >= 80) return "EXCELENTE";
  if (score >= 60) return "BUENA";
  if (score >= 40) return "REGULAR";
  return "MALA";
}

// ------------------------------------------------------------------ problemas

/**
 * Un aspecto que no está en verde, con lo que hay que hacer.
 *
 * `puntosEnJuego` es una ESTIMACIÓN de cuántos puntos recuperás si lo arreglás:
 * un aspecto en `bad` no suma nada (está en juego todo su peso) y uno en `warn`
 * suma a medias (la mitad). Sirve para ordenar por dónde conviene empezar; el
 * puntaje real lo calcula ML y el faltante exacto es `100 − score`.
 */
export type Problema = {
  code: string;
  label: string;
  status: "warn" | "bad";
  detalle: string; // lo que informa ML, ej. "3 fotos", "187 chars — ampliar"
  peso: number;
  puntosEnJuego: number;
  comoMejorar: string;
};

const EN_JUEGO: Record<"warn" | "bad", number> = { bad: 1, warn: 0.5 };

/** Los aspectos que no están en verde de una publicación, peor primero. */
export function problemasDe(checks: MlCheck[]): Problema[] {
  const out: Problema[] = [];
  for (const c of checks) {
    if (c.status === "ok") continue;
    const def = aspectoDe(c.item);
    out.push({
      code: def.code,
      label: def.label,
      status: c.status,
      detalle: c.detail,
      peso: def.peso,
      puntosEnJuego: def.peso * EN_JUEGO[c.status],
      comoMejorar: def.comoMejorar,
    });
  }
  return out.sort(compararProblemas);
}

/**
 * Orden de los problemas: las infracciones primero (ML baja la visibilidad
 * mientras estén abiertas, así que importan más que los puntos que restan) y
 * después por puntos en juego.
 */
function compararProblemas(a: Problema, b: Problema): number {
  const infA = a.code === "infracciones" ? 0 : 1;
  const infB = b.code === "infracciones" ? 0 : 1;
  if (infA !== infB) return infA - infB;
  if (a.puntosEnJuego !== b.puntosEnJuego) return b.puntosEnJuego - a.puntosEnJuego;
  return b.peso - a.peso;
}

// -------------------------------------------------------------- publicaciones

/**
 * Código base / padre de un SKU: "48000-NEG-40" → "48000".
 *
 * El trim va ANTES de partir: con un espacio adelante, el split deja un primer
 * elemento vacío y el código se perdía entero.
 */
export function codigoBase(sku: string): string {
  return sku.trim().split(/[-\s/]/)[0].trim().toUpperCase();
}

export type PubExperiencia = {
  id: string; // MLU...
  titulo: string;
  sku: string | null;
  permalink: string | null;
  thumbnail: string | null;
  score: number; // 0..100
  nivel: string;
  semaforo: Semaforo;
  precio: number | null;
  disponibles: number | null;
  vendidasHistorico: number | null; // sold_quantity de ML (histórico de la publicación)
  visitas30d: number | null;
  reviews: { total: number; promedio: number | null };
  problemas: Problema[];
};

/**
 * Arma la publicación evaluada a partir del item de la lista y su experiencia.
 *
 * El SKU sale de `seller_sku` cuando está y, si no, de `skuPorItem`: el puente
 * item_id→SKU que se armó con las ventas históricas. Hace falta porque ML
 * devuelve `seller_sku` vacío en la enorme mayoría de las publicaciones (45 de
 * 817 al escribir esto), y sin SKU no hay nada que unificar.
 */
export function toPublicacion(
  item: MlItem,
  exp: MlExperiencia,
  skuPorItem?: Map<string, string>,
): PubExperiencia {
  const score = exp.experience_score;
  return {
    id: item.id,
    titulo: exp.title || item.title,
    sku: parseSellerSku(item.seller_sku) ?? skuPorItem?.get(item.id) ?? null,
    permalink: exp.permalink ?? item.permalink,
    thumbnail: item.thumbnail,
    score,
    // El nivel lo manda ML; si viniera vacío se deduce del puntaje.
    nivel: exp.experience_level || nivelDe(score),
    semaforo: semaforoDe(score),
    precio: exp.price ?? item.price,
    disponibles: exp.available_quantity ?? item.available_quantity,
    vendidasHistorico: exp.sold_quantity ?? item.sold_quantity,
    visitas30d: exp.visits_30d,
    reviews: { total: exp.reviews_summary.total, promedio: exp.reviews_summary.avg },
    problemas: problemasDe(exp.checks),
  };
}

// ------------------------------------------------------------ ventas/reclamos

/** Ventas y reclamos de un SKU unificado (vienen de la BD, no de ML live). */
export type VentasReclamos = {
  unidades30d: number;
  unidades90d: number;
  ordenes90d: number;
  canceladas90d: number; // unidades en órdenes canceladas
  reclamos90d: number; // 0 mientras ML no habilite el sync de reclamos
};

export const SIN_VENTAS: VentasReclamos = {
  unidades30d: 0,
  unidades90d: 0,
  ordenes90d: 0,
  canceladas90d: 0,
  reclamos90d: 0,
};

// ----------------------------------------------------------- SKU unificado

/** Un aspecto problemático a nivel grupo, con a cuántas publicaciones afecta. */
export type ProblemaGrupo = Problema & { publicaciones: number };

export type ExperienciaItem = {
  /** Código unificado: el código base del SKU, o el MLU si la publicación no tiene SKU. */
  codigo: string;
  sinSku: boolean;
  titulo: string;
  thumbnail: string | null;
  skus: string[]; // los SKU completos que caen en el grupo
  publicaciones: PubExperiencia[];
  scorePeor: number; // el de la publicación más floja (manda el semáforo)
  scorePromedio: number;
  semaforo: Semaforo;
  nivel: string;
  problemaPrincipal: ProblemaGrupo | null;
  problemas: ProblemaGrupo[];
  ventas: VentasReclamos;
  visitas30d: number;
  vendidasHistorico: number;
  reviews: { total: number; promedio: number | null };
  prioridad: number;
};

/**
 * Score de prioridad: cuántos puntos hay para recuperar, amplificado por lo que
 * ese producto mueve (visitas y ventas de los últimos 30 días). Una publicación
 * floja que nadie mira puede esperar; una floja que se vende todos los días no.
 */
function prioridadDe(faltan: number, visitas30d: number, unidades30d: number): number {
  const movimiento = 1 + Math.log10(visitas30d + unidades30d * 10 + 1);
  return Math.round(faltan * movimiento * 10);
}

/** Promedio de estrellas ponderado por cantidad de opiniones. */
function promedioReviews(pubs: PubExperiencia[]): { total: number; promedio: number | null } {
  let total = 0;
  let suma = 0;
  for (const p of pubs) {
    if (p.reviews.total > 0 && p.reviews.promedio !== null) {
      suma += p.reviews.promedio * p.reviews.total;
      total += p.reviews.total;
    }
  }
  return { total, promedio: total > 0 ? Math.round((suma / total) * 10) / 10 : null };
}

/** Junta los problemas de todas las publicaciones del grupo, sin repetir. */
function problemasDelGrupo(pubs: PubExperiencia[]): ProblemaGrupo[] {
  const porCode = new Map<string, ProblemaGrupo>();
  for (const p of pubs) {
    for (const pr of p.problemas) {
      const prev = porCode.get(pr.code);
      if (!prev) {
        porCode.set(pr.code, { ...pr, publicaciones: 1 });
        continue;
      }
      prev.publicaciones += 1;
      // Si en una publicación está peor, manda el peor caso.
      if (pr.status === "bad" && prev.status === "warn") {
        porCode.set(pr.code, { ...pr, publicaciones: prev.publicaciones });
      }
    }
  }
  // A igualdad de peso, primero lo que afecta a más publicaciones del grupo.
  return [...porCode.values()].sort(
    (a, b) => compararProblemas(a, b) || b.publicaciones - a.publicaciones,
  );
}

/** Agrupa las publicaciones evaluadas en filas por SKU unificado. */
export function agruparPorSku(
  pubs: PubExperiencia[],
  ventasPorCodigo: Map<string, VentasReclamos> = new Map(),
): ExperienciaItem[] {
  const grupos = new Map<string, PubExperiencia[]>();
  for (const p of pubs) {
    const clave = p.sku ? codigoBase(p.sku) : p.id;
    const g = grupos.get(clave);
    if (g) g.push(p);
    else grupos.set(clave, [p]);
  }

  const out: ExperienciaItem[] = [];
  for (const [codigo, lista] of grupos) {
    // Peor primero: la publicación más floja es la que hay que mirar.
    const ordenadas = [...lista].sort((a, b) => a.score - b.score);
    const scorePeor = ordenadas[0].score;
    const scorePromedio = Math.round(ordenadas.reduce((s, p) => s + p.score, 0) / ordenadas.length);
    const problemas = problemasDelGrupo(ordenadas);
    const ventas = ventasPorCodigo.get(codigo) ?? SIN_VENTAS;
    const visitas30d = ordenadas.reduce((s, p) => s + (p.visitas30d ?? 0), 0);
    const sinSku = !ordenadas.some((p) => p.sku);

    out.push({
      codigo,
      sinSku,
      // El título de la publicación más floja: es la que se va a abrir.
      titulo: ordenadas[0].titulo,
      thumbnail: ordenadas.find((p) => p.thumbnail)?.thumbnail ?? null,
      skus: [...new Set(ordenadas.map((p) => p.sku).filter((s): s is string => !!s))].sort(),
      publicaciones: ordenadas,
      scorePeor,
      scorePromedio,
      semaforo: semaforoDe(scorePeor),
      nivel: ordenadas[0].nivel,
      problemaPrincipal: problemas[0] ?? null,
      problemas,
      ventas,
      visitas30d,
      vendidasHistorico: ordenadas.reduce((s, p) => s + (p.vendidasHistorico ?? 0), 0),
      reviews: promedioReviews(ordenadas),
      prioridad: prioridadDe(EXPERIENCIA_MAX - scorePeor, visitas30d, ventas.unidades30d),
    });
  }

  // Lo más urgente primero; a igualdad, el peor puntaje.
  out.sort((a, b) => b.prioridad - a.prioridad || a.scorePeor - b.scorePeor);
  return out;
}

// -------------------------------------------------------------------- params

export type ExperienciaParams = {
  /** Se listan las publicaciones con puntaje por debajo de esto (100 = todas las imperfectas). */
  umbral: number;
  /** Puntos que tiene que caer un puntaje para que salga el mail. */
  minCaida: number;
};

/**
 * El mínimo de 14 puntos NO es un número al azar: está calibrado contra una
 * inconsistencia medida en la API.
 *
 * `/ml-experiencia` devuelve distinto puntaje para la MISMA publicación según
 * cómo se lo pida: leída dentro del barrido de las 817 activas da hasta 13
 * puntos menos que leída de a una, y lo hace de forma consistente (idéntico a
 * concurrencia 4, 8 y 24; la lectura individual es estable en 6 intentos
 * seguidos). Los saltos que produce son siempre de 13 o de 6 puntos.
 *
 * Con el mínimo en 14 esas diferencias no generan mails, y lo que sí se avisa es
 * la pérdida de un aspecto entero (fotos y opiniones valen 15, la ficha 25). Es
 * un parche del lado del panel: lo correcto sería que la API devuelva el mismo
 * puntaje siempre. Cuando eso se arregle, se puede bajar a 5 desde la pantalla.
 */
export const DEFAULT_EXPERIENCIA_PARAMS: ExperienciaParams = {
  umbral: EXPERIENCIA_MAX,
  minCaida: 14,
};

/** Normaliza params parciales (ej. los guardados en la config) con defaults. */
export function normalizeExperienciaParams(
  p?: Partial<ExperienciaParams> | null,
): ExperienciaParams {
  const src = p ?? {};
  const clamp = (v: unknown, def: number, min: number, max: number) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return def;
    return Math.min(max, Math.max(min, Math.round(n)));
  };
  return {
    umbral: clamp(src.umbral, DEFAULT_EXPERIENCIA_PARAMS.umbral, 1, EXPERIENCIA_MAX),
    minCaida: clamp(src.minCaida, DEFAULT_EXPERIENCIA_PARAMS.minCaida, 1, EXPERIENCIA_MAX),
  };
}

// -------------------------------------------------------------------- reporte

/** Reputación del vendedor: los reclamos que ML sí informa (globales, 120 días). */
export type ReputacionResumen = {
  nivel: string | null;
  powerSeller: string | null;
  reclamos120d: number;
  reclamosTasaPct: string | null;
  demoras120d: number;
  demorasTasaPct: string | null;
  cancelaciones120d: number;
  cancelacionesTasaPct: string | null;
  ventasCompletadas120d: number | null;
};

export type ExperienciaReport = {
  key: typeof EXPERIENCIA_KEY;
  generadoEn: string;
  params: ExperienciaParams;
  fallidos?: number; // publicaciones cuya experiencia no se pudo traer
  /**
   * false cuando la tabla `ml_claims` está vacía: ML todavía no habilitó el
   * permiso de reclamos, así que los reclamos POR PUBLICACIÓN no existen y solo
   * se puede mostrar el total del vendedor que viene en `reputacion`.
   */
  reclamosPorSkuDisponibles: boolean;
  reputacion: ReputacionResumen | null;
  items: ExperienciaItem[];
  summary: {
    activas: number; // publicaciones activas evaluadas
    perfectas: number; // con 100 de puntaje
    aMejorar: number; // por debajo del umbral
    codigos: number; // SKU unificados listados
    scorePromedio: number | null;
    rojo: number;
    naranja: number;
    amarillo: number;
    verde: number;
    conInfracciones: number;
    visitas30dEnRiesgo: number;
    unidades30dEnRiesgo: number;
    /** Puntos en juego sumados: cuánto hay para recuperar en total. */
    puntosEnJuego: number;
  };
};

/** Núcleo del reporte: evalúa, filtra por umbral y agrupa. Puro → testeable. */
export function evaluarExperiencia(
  rows: { item: MlItem; exp: MlExperiencia | null }[],
  opts: {
    generadoEn: string;
    params: ExperienciaParams;
    ventasPorCodigo?: Map<string, VentasReclamos>;
    /** Puente item_id→SKU para las publicaciones que no traen `seller_sku`. */
    skuPorItem?: Map<string, string>;
    reputacion?: ReputacionResumen | null;
    reclamosPorSkuDisponibles?: boolean;
    fallidos?: number;
  },
): ExperienciaReport {
  const { params } = opts;
  const evaluadas: PubExperiencia[] = [];
  for (const r of rows) {
    if (!r.exp) continue; // sin experiencia no hay nada que evaluar
    evaluadas.push(toPublicacion(r.item, r.exp, opts.skuPorItem));
  }

  const perfectas = evaluadas.filter((p) => p.score >= EXPERIENCIA_MAX).length;
  const aMejorar = evaluadas.filter((p) => p.score < params.umbral);
  const items = agruparPorSku(aMejorar, opts.ventasPorCodigo);

  const scorePromedio =
    evaluadas.length > 0
      ? Math.round(evaluadas.reduce((s, p) => s + p.score, 0) / evaluadas.length)
      : null;

  let rojo = 0;
  let naranja = 0;
  let amarillo = 0;
  let verde = 0;
  let conInfracciones = 0;
  let visitas30dEnRiesgo = 0;
  let unidades30dEnRiesgo = 0;
  let puntosEnJuego = 0;
  for (const it of items) {
    if (it.semaforo === "rojo") rojo += 1;
    else if (it.semaforo === "naranja") naranja += 1;
    else if (it.semaforo === "amarillo") amarillo += 1;
    else verde += 1;
    if (it.problemas.some((p) => p.code === "infracciones")) conInfracciones += 1;
    visitas30dEnRiesgo += it.visitas30d;
    unidades30dEnRiesgo += it.ventas.unidades30d;
    puntosEnJuego += EXPERIENCIA_MAX - it.scorePeor;
  }

  return {
    key: EXPERIENCIA_KEY,
    generadoEn: opts.generadoEn,
    params,
    fallidos: opts.fallidos || undefined,
    reclamosPorSkuDisponibles: opts.reclamosPorSkuDisponibles ?? false,
    reputacion: opts.reputacion ?? null,
    items,
    summary: {
      activas: evaluadas.length,
      perfectas,
      aMejorar: aMejorar.length,
      codigos: items.length,
      scorePromedio,
      rojo,
      naranja,
      amarillo,
      verde,
      conInfracciones,
      visitas30dEnRiesgo,
      unidades30dEnRiesgo,
      puntosEnJuego,
    },
  };
}

// ---------------------------------------------------------- caídas de puntaje

/**
 * Puntaje guardado de una publicación en la corrida anterior. Es lo que permite
 * saber si bajó: sin esto no hay con qué comparar.
 */
export type PuntajePrevio = { itemId: string; score: number };

/** Una publicación que empeoró: es lo que se avisa por mail y se marca en el panel. */
export type Caida = {
  itemId: string;
  codigo: string; // SKU unificado al que pertenece
  sku: string | null;
  titulo: string;
  permalink: string | null;
  scoreAnterior: number;
  score: number;
  delta: number; // puntos que bajó (positivo)
  nivelAnterior: string;
  nivel: string;
  /** true cuando venía en 100 y dejó de estar perfecta (el cruce del 100%). */
  cruzo100: boolean;
  problemaPrincipal: string | null;
};

/**
 * Compara el puntaje actual contra el de la corrida anterior y devuelve las
 * caídas CANDIDATAS a avisar.
 *
 * Se llaman candidatas porque todavía hay que confirmarlas: ver
 * `confirmarCaidas`. El barrido pide la experiencia de las ~800 publicaciones
 * en paralelo y, bajo esa carga, algunas respuestas de MercadoLibre vuelven
 * incompletas (un aspecto que llega sin datos hace caer el puntaje ~13 puntos
 * sin que la publicación haya cambiado en nada).
 *
 * Dos decisiones más:
 *
 * - **La primera corrida no avisa.** Si una publicación no tiene puntaje previo
 *   no hay caída: se guarda la foto inicial y listo. Sin esto, el primer envío
 *   serían ~800 mails de publicaciones que ya estaban flojas desde antes.
 * - **Umbral mínimo.** Los puntajes se mueven solos (una opinión nueva, un
 *   cambio de stock), así que una caída de menos de `minCaida` puntos no se
 *   avisa. El cruce del 100% sí se avisa siempre, aunque sea de un punto: dejar
 *   de estar perfecta es la señal que se pidió.
 */
export function detectarCaidas(
  items: ExperienciaItem[],
  previos: PuntajePrevio[],
  minCaida: number,
): Caida[] {
  const antes = new Map(previos.map((p) => [p.itemId, p.score]));
  const out: Caida[] = [];
  for (const grupo of items) {
    for (const pub of grupo.publicaciones) {
      const scoreAnterior = antes.get(pub.id);
      if (scoreAnterior === undefined) continue; // publicación nueva: solo se guarda
      const delta = scoreAnterior - pub.score;
      if (delta <= 0) continue; // igual o mejor
      const cruzo100 = scoreAnterior >= EXPERIENCIA_MAX && pub.score < EXPERIENCIA_MAX;
      if (delta < minCaida && !cruzo100) continue;
      out.push({
        itemId: pub.id,
        codigo: grupo.codigo,
        sku: pub.sku,
        titulo: pub.titulo,
        permalink: pub.permalink,
        scoreAnterior,
        score: pub.score,
        delta,
        nivelAnterior: nivelDe(scoreAnterior),
        nivel: pub.nivel,
        cruzo100,
        problemaPrincipal: pub.problemas[0]?.label ?? null,
      });
    }
  }
  // Lo que más bajó primero; el cruce del 100% siempre arriba.
  out.sort((a, b) => Number(b.cruzo100) - Number(a.cruzo100) || b.delta - a.delta);
  return out;
}

/** Una caída detectada en una corrida anterior, todavía sin confirmar. */
export type CaidaPendiente = {
  itemId: string;
  /** Puntaje que tenía antes de caer. */
  bajoDe: number;
  /** Puntaje con el que se detectó la caída. */
  score: number;
};

/**
 * Decide cuáles de las caídas pendientes se confirman con la corrida de hoy.
 *
 * **Por qué hace falta una segunda corrida.** El puntaje que devuelve
 * `/ml-experiencia` depende del camino por el que se lo pide: medido contra la
 * API real, el barrido de las 817 publicaciones lee 11 de cada 25 con unos 13
 * puntos menos que si se piden de a una, y lo hace de forma consistente (idéntico
 * a concurrencia 4, 8 y 24, con la lectura individual estable en 3 y 6 intentos
 * seguidos). O sea: releer al toque no sirve para arbitrar, porque devuelve el
 * otro valor siempre.
 *
 * Lo que sí distingue una caída real de un artefacto de lectura es el tiempo: el
 * artefacto desaparece en cuanto la referencia guardada pasa a venir del mismo
 * barrido, mientras que una caída de verdad sigue ahí mañana. Entonces:
 *
 *  1. la primera vez que se ve una caída se marca en el panel y NO se manda mail;
 *  2. si en la corrida siguiente el puntaje sigue caído, se confirma y sale el mail;
 *  3. si se recuperó, la marca se borra sola y nunca hubo mail.
 *
 * `actual` es el puntaje que leyó esta corrida, por publicación.
 */
export function confirmarPendientes(
  pendientes: CaidaPendiente[],
  actual: Map<string, PubExperiencia>,
  minCaida: number,
): Caida[] {
  const out: Caida[] = [];
  for (const p of pendientes) {
    const pub = actual.get(p.itemId);
    if (!pub) continue; // ya no está activa: no hay nada que avisar
    // ¿Se recuperó? Entonces la caída era un artefacto o ya se arregló.
    if (pub.score >= p.bajoDe) continue;
    const delta = p.bajoDe - pub.score;
    const cruzo100 = p.bajoDe >= EXPERIENCIA_MAX && pub.score < EXPERIENCIA_MAX;
    if (delta < minCaida && !cruzo100) continue;
    out.push({
      itemId: p.itemId,
      codigo: pub.sku ? codigoBase(pub.sku) : pub.id,
      sku: pub.sku,
      titulo: pub.titulo,
      permalink: pub.permalink,
      scoreAnterior: p.bajoDe,
      score: pub.score,
      delta,
      nivelAnterior: nivelDe(p.bajoDe),
      nivel: pub.nivel,
      cruzo100,
      problemaPrincipal: pub.problemas[0]?.label ?? null,
    });
  }
  out.sort((a, b) => Number(b.cruzo100) - Number(a.cruzo100) || b.delta - a.delta);
  return out;
}

// ------------------------------------------------------------------ el mail

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Asunto del mail de alerta. */
export function asuntoCaidas(caidas: Caida[]): string {
  const n = caidas.length;
  const cruces = caidas.filter((c) => c.cruzo100).length;
  if (cruces > 0 && n === cruces) {
    return `MA · ${n} publicación${n === 1 ? "" : "es"} dejó de estar en 100%`;
  }
  const peor = caidas[0];
  if (n === 1 && peor) {
    return `MA · bajó la experiencia de compra: ${peor.titulo.slice(0, 60)} (${peor.scoreAnterior}% → ${peor.score}%)`;
  }
  return `MA · bajó la experiencia de compra de ${n} publicaciones`;
}

/**
 * Cuerpo del mail de alerta, en texto y HTML. Va autocontenido (sin imágenes ni
 * CSS externo) para que se vea igual en Gmail, Outlook y el celular.
 * `panelUrl` es el link a la pantalla del reporte, si se sabe.
 */
export function cuerpoCaidas(
  caidas: Caida[],
  opts: { panelUrl?: string | null; max?: number } = {},
): { text: string; html: string } {
  const max = opts.max ?? 25;
  const muestra = caidas.slice(0, max);
  const resto = caidas.length - muestra.length;

  const lineas: string[] = [];
  lineas.push(
    `Bajó la experiencia de compra de ${caidas.length} publicación${caidas.length === 1 ? "" : "es"}.`,
  );
  lineas.push("");
  for (const c of muestra) {
    const marca = c.cruzo100 ? " [dejó de estar en 100%]" : "";
    lineas.push(`• ${c.titulo}${marca}`);
    lineas.push(
      `  ${c.sku ?? c.itemId} · ${c.scoreAnterior}% → ${c.score}% (−${c.delta} pts, ${c.nivel})`,
    );
    if (c.problemaPrincipal) lineas.push(`  Problema principal: ${c.problemaPrincipal}`);
    if (c.permalink) lineas.push(`  ${c.permalink}`);
    lineas.push("");
  }
  if (resto > 0) lineas.push(`… y ${resto} más.`);
  if (opts.panelUrl) {
    lineas.push("");
    lineas.push(`Ver el reporte completo: ${opts.panelUrl}`);
  }

  const filas = muestra
    .map((c) => {
      const color = c.score >= 60 ? "#f59e0b" : c.score >= 40 ? "#f97316" : "#ef4444";
      const marca = c.cruzo100
        ? ' <span style="background:#fee2e2;color:#991b1b;font-size:11px;padding:1px 5px;border-radius:4px">dejó el 100%</span>'
        : "";
      const titulo = c.permalink
        ? `<a href="${esc(c.permalink)}" style="color:#0f766e;text-decoration:none">${esc(c.titulo)}</a>`
        : esc(c.titulo);
      return `<tr>
  <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#111827">
    ${titulo}${marca}
    <div style="color:#6b7280;font-size:12px;margin-top:2px">${esc(c.sku ?? c.itemId)}${
      c.problemaPrincipal ? ` · ${esc(c.problemaPrincipal)}` : ""
    }</div>
  </td>
  <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;white-space:nowrap">
    <span style="color:#6b7280;font-size:13px">${c.scoreAnterior}%</span>
    <span style="color:#9ca3af;font-size:13px"> → </span>
    <span style="color:${color};font-size:15px;font-weight:700">${c.score}%</span>
    <div style="color:#ef4444;font-size:12px">−${c.delta} pts</div>
  </td>
</tr>`;
    })
    .join("\n");

  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f9fafb;padding:24px">
  <div style="max-width:640px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden">
    <div style="padding:18px 20px;background:#0f766e;color:#fff">
      <div style="font-size:17px;font-weight:700">Bajó la experiencia de compra</div>
      <div style="font-size:13px;opacity:.85;margin-top:2px">${caidas.length} publicación${
        caidas.length === 1 ? "" : "es"
      } por debajo de lo que venía</div>
    </div>
    <table style="width:100%;border-collapse:collapse">${filas}</table>
    ${
      resto > 0
        ? `<div style="padding:12px 20px;color:#6b7280;font-size:13px">… y ${resto} más.</div>`
        : ""
    }
    ${
      opts.panelUrl
        ? `<div style="padding:16px 20px;border-top:1px solid #e5e7eb">
      <a href="${esc(opts.panelUrl)}" style="display:inline-block;background:#0f766e;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-size:14px;font-weight:600">Ver el reporte</a>
    </div>`
        : ""
    }
    <div style="padding:12px 20px;background:#f9fafb;color:#9ca3af;font-size:11px;border-top:1px solid #e5e7eb">
      Plataforma MA Importaciones · Publicaciones con mala experiencia de compra
    </div>
  </div>
</div>`;

  return { text: lineas.join("\n"), html };
}

/** Resumen del reporte en texto plano (para logs y para el WhatsApp si algún día se suma). */
export function experienciaToText(report: ExperienciaReport, max = 12): string {
  const { summary, items } = report;
  const lineas: string[] = [];
  lineas.push("Publicaciones con mala experiencia de compra");
  lineas.push(
    `${summary.aMejorar} de ${summary.activas} activas por debajo de ${report.params.umbral}% ` +
      `· ${summary.codigos} SKU · promedio ${summary.scorePromedio ?? "—"}%`,
  );
  lineas.push("");
  for (const it of items.slice(0, max)) {
    lineas.push(`• ${it.codigo} ${it.titulo.slice(0, 45)} — ${it.scorePeor}% (${it.nivel})`);
    if (it.problemaPrincipal) lineas.push(`   ${it.problemaPrincipal.label}: ${it.problemaPrincipal.detalle}`);
  }
  if (items.length > max) lineas.push(`… y ${items.length - max} más (ver en la plataforma).`);
  return lineas.join("\n");
}

/** Etiqueta y color de un puntaje, para la UI. */
export function experienciaEstado(score: number): { label: string; tone: string; dot: string } {
  const s = semaforoDe(score);
  if (score >= EXPERIENCIA_MAX) return { label: "Perfecta", tone: "text-emerald-300", dot: "bg-emerald-400" };
  if (s === "verde") return { label: "Excelente", tone: "text-emerald-300", dot: "bg-emerald-400" };
  if (s === "amarillo") return { label: "Buena", tone: "text-amber-300", dot: "bg-amber-400" };
  if (s === "naranja") return { label: "Regular", tone: "text-orange-300", dot: "bg-orange-400" };
  return { label: "Mala", tone: "text-red-300", dot: "bg-red-400" };
}

/** Peso total del catálogo de aspectos (100). Expuesto para los tests. */
export const PESO_TOTAL_ASPECTOS = PESO_TOTAL;
