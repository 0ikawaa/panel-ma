// Reporte "Publicaciones con mala experiencia de compra".
//
// La EXPERIENCIA DE COMPRA es el puntaje que MercadoLibre le pone a cada
// publicación mirando los PROBLEMAS que tuvieron los compradores en las ventas
// de los últimos 180 días ("hiciste 422 ventas y tuviste 17 problemas"), y lo
// compara contra productos parecidos de la competencia. Cada problema viene
// tipificado (faltaban partes, llegó dañado, era diferente a lo pedido…) y con
// el consejo textual de ML para arreglarlo.
//
// NO confundir con la CALIDAD de la publicación (el health de ML, que mira si la
// ficha está completa, si tiene fotos, video, catálogo…). Esa es otra métrica y
// tiene su propio reporte en `/reportes/calidad`. La versión anterior de este
// módulo mezclaba las dos: usaba `/ml-experiencia/:id` de MUNDO SHOP, que es un
// puntaje casero de 9 aspectos de la ficha y no tiene nada que ver con los
// reclamos de los compradores.
//
// DE DÓNDE SALE EL DATO. Del PANEL DE VENDEDOR, no de la API: la documentación
// de MUNDO SHOP lo dice en sus notas ("Reclamos: No disponible por API de ML,
// permiso no habilitado"). Por eso el módulo no puede refrescarse solo: la
// captura del panel se hace con el navegador y se importa (ver la sección
// "Experiencia de compra" del README), queda guardada como snapshot, y el
// reporte se arma leyendo el último snapshot.
//
// Las filas son SKU COMPLETOS ("16214-BLA" y "16214-NOG" van separados) porque
// ML calcula la experiencia a nivel producto: las publicaciones que comparten
// SKU traen exactamente los mismos reclamos y el mismo consejo. Por eso los
// números se toman UNA vez por SKU y no se suman entre publicaciones hermanas.
//
// Módulo PURO (sin red/DB) → testeable. Lo que toca la base vive en
// `experiencia.server.ts`.

export const EXPERIENCIA_KEY = "experiencia";

/** La ventana que usa MercadoLibre para calcular la experiencia. */
export const VENTANA_DIAS = 180;

/** Puntaje perfecto: por debajo de esto la publicación entra al reporte. */
export const EXPERIENCIA_MAX = 100;

// ------------------------------------------------------------------ situación

/**
 * En qué situación está una publicación según lo que informa el panel. No es lo
 * mismo "no tuvo problemas" que "no tuvo ventas": en el segundo caso ML todavía
 * no calculó nada, así que no hay puntaje que mejorar.
 */
export type Situacion = "con-problemas" | "sin-problemas" | "sin-ventas" | "sin-datos";

export const TEXTO_SITUACION: Record<Situacion, string> = {
  "con-problemas": "Con problemas",
  "sin-problemas": "Sin problemas registrados",
  "sin-ventas": `Sin ventas en ${VENTANA_DIAS} días`,
  "sin-datos": "No se pudo leer del panel",
};

// -------------------------------------------------------------------- semáforo

export type Semaforo = "rojo" | "amarillo" | "verde";

export const SEMAFORO_TEXTO: Record<Semaforo, string> = {
  rojo: "🔴 Rojo",
  amarillo: "🟡 Amarillo",
  verde: "🟢 Verde",
};

/**
 * Color de la fila. El corte en 30 no es arbitrario: es el piso que muestra el
 * panel cuando la experiencia ya es "Mala" y ML avisa que puede pausar o anular
 * la publicación. El nivel textual de ML (Mala / Media / Buena) va aparte, en su
 * propia columna, porque puede no acompañar al porcentaje del listado.
 */
export function semaforoDe(experiencia: number | null, rojoHasta = 30): Semaforo {
  if (experiencia === null) return "amarillo"; // sin dato: hay que mirarla igual
  if (experiencia <= rojoHasta) return "rojo";
  if (experiencia >= EXPERIENCIA_MAX) return "verde";
  return "amarillo";
}

// ------------------------------------------------------- parseo de la captura

/** Un tipo de problema informado por ML, con su consejo. */
export type ProblemaTipo = {
  /** Código interno de ML, ej. "good_packing_but_missing_accessories". */
  codigo: string | null;
  /** La categoría que se muestra arriba, ej. "Faltaban partes o accesorios del producto". */
  categoria: string;
  /** El detalle largo, ej. "El embalaje llegó bien pero faltaban partes…". */
  detalle: string | null;
  /** Cuántos problemas de este tipo hubo. */
  cantidad: number;
  reclamos: number;
  cancelaciones: number;
  /** ML marca uno como PROBLEMA PRINCIPAL. */
  principal: boolean;
  /** El "Cómo mejorar" textual de MercadoLibre. */
  comoMejorar: string | null;
  /** Lo que ML propone hacer: "Modificar publicación" | "Pausar desde el listado". */
  accion: string | null;
};

/** El detalle de la pantalla de experiencia de compra de una publicación. */
export type DetallePub = {
  /** El puntaje de la pantalla (0..100). ML manda -1 cuando no lo calculó. */
  score: number | null;
  /** Mala | Media | Buena, tal como lo nombra ML. */
  nivel: string | null;
  resumen: string | null;
  /** La advertencia de ML ("podríamos pausarla", "afecta tu exposición"…). */
  aviso: string | null;
  ventas180d: number | null;
  problemas180d: number | null;
  situacion: Situacion;
  /** Distribución por etapa, ej. "Con el producto entregado: 100%". */
  dist: string[];
  problemas: ProblemaTipo[];
};

/** Una publicación tal como queda después de normalizar la captura del panel. */
export type CapturaPub = {
  id: string; // MLU...
  titulo: string;
  sku: string | null;
  estadoMl: string | null; // active | paused | closed
  catalogo: boolean;
  stock: string | null; // texto tal cual lo muestra el panel
  precio: string | null; // ídem
  /** % de calidad de la publicación que muestra el listado (otra métrica). */
  calidad: number | null;
  /**
   * % de EXPERIENCIA que muestra el listado: es el que ordena el reporte.
   *
   * null cuando no hay puntaje. Son dos casos distintos, y `sinCalcular` los
   * separa: ML manda -1 en las publicaciones que no vendieron nada en la ventana
   * (683 de 2213 en la captura del 29/07) y no manda nada cuando la fila del
   * listado no se pudo leer (32 de 2213).
   */
  experiencia: number | null;
  /** true cuando ML no calculó el puntaje porque la publicación no tuvo ventas. */
  sinCalcular: boolean;
  url: string | null;
  detalle: DetallePub | null;
};

const asStr = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
};

/** Número tolerante: acepta "1.234", " 12 ", 12. Descarta lo que no es número. */
const asNum = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const t = v.replace(/[.\s]/g, "").replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

/** "un problema" / "una venta" también son cantidades. */
const PALABRA_NUM: Record<string, number> = { un: 1, una: 1, uno: 1 };

/** Cantidad de un texto tipo "8 problemas" o "un problema". */
export function parseCantidad(texto: string | null | undefined): number {
  if (!texto) return 0;
  const m = /(\d[\d.]*|un[ao]?)\b/i.exec(texto);
  if (!m) return 0;
  const bruto = m[1].toLowerCase();
  return PALABRA_NUM[bruto] ?? asNum(bruto) ?? 0;
}

/**
 * Saca ventas, problemas y situación del texto que muestra el panel. Las cuatro
 * formas que devuelve MercadoLibre (medidas sobre la captura de 249
 * publicaciones) son:
 *
 *  - "En los últimos 180 días hiciste 422 ventas y tuviste 17 problemas. …"
 *  - "No tuviste problemas con este producto."      → vendió, sin problemas
 *  - "Aún no la calculamos porque tu publicación no tuvo ventas en los últimos
 *    180 días."                                     → no hay nada que mejorar
 *  - ""                                             → no se pudo leer
 *
 * El texto de "sin problemas" NO trae la cantidad de ventas: ahí el reporte cae
 * en las ventas de nuestra propia base para no mostrar el SKU como si no
 * vendiera nada.
 */
export function parseResumen(resumen: string | null | undefined): {
  ventas180d: number | null;
  problemas180d: number | null;
  situacion: Situacion;
} {
  const t = (resumen ?? "").trim();
  if (t === "") return { ventas180d: null, problemas180d: null, situacion: "sin-datos" };

  if (/no tuv[oi]\w*\s+ventas/i.test(t)) {
    return { ventas180d: 0, problemas180d: 0, situacion: "sin-ventas" };
  }

  const mVentas = /hiciste\s+(\d[\d.]*|una?)\s+ventas?/i.exec(t);
  const ventas = mVentas
    ? (PALABRA_NUM[mVentas[1].toLowerCase()] ?? asNum(mVentas[1]))
    : null;

  if (/no tuviste\s+problemas/i.test(t)) {
    return { ventas180d: ventas, problemas180d: 0, situacion: "sin-problemas" };
  }

  const mProb = /tuviste\s+(\d[\d.]*|un[ao]?)\s+problemas?/i.exec(t);
  const problemas = mProb
    ? (PALABRA_NUM[mProb[1].toLowerCase()] ?? asNum(mProb[1]))
    : null;

  if (problemas === null) {
    // Texto que no reconocemos: mejor decir que no se pudo leer que inventar un 0.
    return { ventas180d: ventas, problemas180d: null, situacion: "sin-datos" };
  }
  return {
    ventas180d: ventas,
    problemas180d: problemas,
    situacion: problemas > 0 ? "con-problemas" : "sin-problemas",
  };
}

function parseProblema(raw: unknown): ProblemaTipo | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const categoria = asStr(o.categoria) ?? asStr(o.tipo) ?? asStr(o.detalle);
  if (!categoria) return null; // sin categoría no hay problema que mostrar
  const reclamos = asNum(o.reclamos);
  const cantidad = parseCantidad(asStr(o.cantidad)) || reclamos || 0;
  return {
    codigo: asStr(o.codigo),
    categoria,
    detalle: asStr(o.detalle),
    cantidad,
    // Si ML no manda `reclamos`, la cantidad del texto es la mejor cuenta que hay.
    reclamos: reclamos ?? cantidad,
    cancelaciones: asNum(o.cancelaciones) ?? 0,
    principal: o.principal === true,
    comoMejorar: asStr(o.solucion) ?? asStr(o.comoMejorar),
    accion: asStr(o.accion),
  };
}

function parseDetalle(raw: unknown): DetallePub | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const resumen = asStr(o.resumen);
  const { ventas180d, problemas180d, situacion } = parseResumen(resumen);

  const problemas = Array.isArray(o.problemas)
    ? o.problemas.map(parseProblema).filter((p): p is ProblemaTipo => p !== null)
    : [];
  problemas.sort(compararProblemas);

  // ML manda -1 en el puntaje cuando no lo calculó (publicación sin ventas).
  const scoreCrudo = asNum(o.score);
  const score = scoreCrudo !== null && scoreCrudo >= 0 ? scoreCrudo : null;

  return {
    score,
    nivel: asStr(o.nivel),
    resumen,
    aviso: asStr(o.aviso),
    ventas180d,
    problemas180d: problemas180d ?? (problemas.length > 0 ? sumaReclamos(problemas) : null),
    // Si el texto no se entendió pero hay problemas listados, la situación es clara.
    situacion: situacion === "sin-datos" && problemas.length > 0 ? "con-problemas" : situacion,
    dist: Array.isArray(o.dist) ? o.dist.map(asStr).filter((s): s is string => s !== null) : [],
    problemas,
  };
}

const sumaReclamos = (ps: ProblemaTipo[]) => ps.reduce((s, p) => s + p.reclamos, 0);

/** El problema principal primero, y después los que más reclamos acumulan. */
function compararProblemas(a: ProblemaTipo, b: ProblemaTipo): number {
  if (a.principal !== b.principal) return a.principal ? -1 : 1;
  if (a.reclamos !== b.reclamos) return b.reclamos - a.reclamos;
  return a.categoria.localeCompare(b.categoria, "es");
}

/** SKU normalizado: sin espacios y en mayúsculas, para que agrupe parejo. */
export function normalizarSku(sku: unknown): string | null {
  const s = asStr(sku);
  return s ? s.toUpperCase() : null;
}

/**
 * Normaliza la captura del panel. Acepta VARIAS listas y las mergea por id de
 * publicación: la captura del listado trae el % de experiencia y la URL de las
 * 2200 publicaciones, y la del diagnóstico trae el detalle (`ml`) solo de las
 * que están por debajo de 100. Lo último que llega gana, así que el detalle
 * pisa lo que faltaba.
 */
export function parseCaptura(...listas: unknown[]): CapturaPub[] {
  const porId = new Map<string, CapturaPub>();

  for (const lista of listas) {
    if (!Array.isArray(lista)) continue;
    for (const raw of lista) {
      if (!raw || typeof raw !== "object") continue;
      const o = raw as Record<string, unknown>;
      const id = asStr(o.id);
      if (!id) continue; // sin id no hay con qué mergear

      const prev = porId.get(id);
      const detalle = parseDetalle(o.ml ?? o.detalle) ?? prev?.detalle ?? null;
      // El -1 de ML no es un puntaje bajísimo: es "no lo calculé".
      const expCruda = asNum(o.exp) ?? asNum(o.experiencia);
      const experiencia =
        expCruda !== null && expCruda >= 0 ? expCruda : (prev?.experiencia ?? null);
      porId.set(id, {
        id,
        titulo: asStr(o.titulo) ?? asStr(o.title) ?? prev?.titulo ?? id,
        sku: normalizarSku(o.sku) ?? prev?.sku ?? null,
        estadoMl: asStr(o.estado) ?? prev?.estadoMl ?? null,
        catalogo: o.catalogo === true || prev?.catalogo === true,
        stock: asStr(o.stock) ?? prev?.stock ?? null,
        precio: asStr(o.precio) ?? prev?.precio ?? null,
        calidad: asNum(o.cal) ?? asNum(o.calidad) ?? prev?.calidad ?? null,
        experiencia,
        sinCalcular: experiencia === null && (expCruda !== null || prev?.sinCalcular === true),
        url: asStr(o.url) ?? asStr(o.permalink) ?? prev?.url ?? null,
        detalle,
      });
    }
  }

  return [...porId.values()];
}

// --------------------------------------------------------------- SKU agrupado

/** Una publicación dentro de la fila del SKU. */
export type PubDelSku = {
  id: string;
  titulo: string;
  url: string | null;
  experiencia: number | null;
  calidad: number | null;
  estadoMl: string | null;
  stock: string | null;
  precio: string | null;
  catalogo: boolean;
};

export type ExperienciaSku = {
  /** El SKU, o el MLU cuando la publicación no tiene SKU cargado en ML. */
  clave: string;
  sku: string | null;
  sinSku: boolean;
  titulo: string;
  /** % de experiencia del listado (el peor entre las publicaciones hermanas). */
  experiencia: number | null;
  semaforo: Semaforo;
  /** Mala | Media | Buena, tal como lo nombra ML. */
  nivel: string | null;
  score: number | null;
  situacion: Situacion;
  /** Ventas de los últimos 180 días según ML (las que usó para el puntaje). */
  ventas180d: number | null;
  /** Ventas de los últimos 180 días según nuestra base (ML no siempre las dice). */
  ventasBd180d: number | null;
  problemas180d: number;
  reclamos: number;
  cancelaciones: number;
  tiposProblema: number;
  problemaPrincipal: ProblemaTipo | null;
  /** Lo que va en la columna: la categoría, o por qué no hay problema principal. */
  problemaPrincipalTexto: string;
  comoMejorar: string | null;
  problemas: ProblemaTipo[];
  dist: string[];
  aviso: string | null;
  publicaciones: PubDelSku[];
};

const pubDelSku = (p: CapturaPub): PubDelSku => ({
  id: p.id,
  titulo: p.titulo,
  url: p.url,
  experiencia: p.experiencia,
  calidad: p.calidad,
  estadoMl: p.estadoMl,
  stock: p.stock,
  precio: p.precio,
  catalogo: p.catalogo,
});

/**
 * Cuál de las publicaciones hermanas manda. Comparten SKU, así que ML les da los
 * mismos reclamos y el mismo consejo; lo único que cambia es cuánto llegó a
 * leerse. Se elige la que más información trae (medido en la captura: de los 60
 * SKU con más de una publicación, 58 son idénticos y los 2 restantes difieren
 * solo porque a una hermana no se le pudo leer el detalle).
 */
function mejorDetalle(pubs: CapturaPub[]): CapturaPub {
  const puntos = (p: CapturaPub) => {
    const d = p.detalle;
    if (!d) return -1;
    return (
      (d.problemas.length > 0 ? 1000 : 0) +
      (d.situacion !== "sin-datos" ? 100 : 0) +
      (d.ventas180d !== null ? 10 : 0) +
      (d.score !== null ? 1 : 0)
    );
  };
  return [...pubs].sort((a, b) => puntos(b) - puntos(a))[0];
}

/**
 * Agrupa las publicaciones capturadas en filas por SKU.
 *
 * `ventasBdPorSku` son las ventas de 180 días de nuestra base, por SKU completo:
 * sirven para las publicaciones a las que ML no les informa las ventas (el texto
 * "No tuviste problemas con este producto" no trae número).
 */
export function agruparPorSku(
  pubs: CapturaPub[],
  ventasBdPorSku: Map<string, number> = new Map(),
  rojoHasta = 30,
): ExperienciaSku[] {
  const grupos = new Map<string, CapturaPub[]>();
  for (const p of pubs) {
    // Sin SKU no hay con qué unificar: cada publicación es su propia fila.
    const clave = p.sku ?? p.id;
    const g = grupos.get(clave);
    if (g) g.push(p);
    else grupos.set(clave, [p]);
  }

  const out: ExperienciaSku[] = [];
  for (const [clave, lista] of grupos) {
    const dueño = mejorDetalle(lista);
    const d = dueño.detalle;
    const problemas = d?.problemas ?? [];
    const principal = problemas.find((p) => p.principal) ?? problemas[0] ?? null;
    const situacion = d?.situacion ?? "sin-datos";

    // El peor % del listado entre las hermanas: es el que hay que mirar.
    const exps = lista.map((p) => p.experiencia).filter((n): n is number => n !== null);
    const experiencia = exps.length > 0 ? Math.min(...exps) : null;

    const sku = dueño.sku;
    out.push({
      clave,
      sku,
      sinSku: sku === null,
      titulo: dueño.titulo,
      experiencia,
      semaforo: semaforoDe(experiencia, rojoHasta),
      nivel: d?.nivel ?? null,
      score: d?.score ?? null,
      situacion,
      ventas180d: d?.ventas180d ?? null,
      ventasBd180d: sku ? (ventasBdPorSku.get(sku) ?? null) : null,
      problemas180d: d?.problemas180d ?? 0,
      reclamos: sumaReclamos(problemas),
      cancelaciones: problemas.reduce((s, p) => s + p.cancelaciones, 0),
      tiposProblema: problemas.length,
      problemaPrincipal: principal,
      problemaPrincipalTexto: principal?.categoria ?? TEXTO_SITUACION[situacion],
      comoMejorar: principal?.comoMejorar ?? null,
      problemas,
      dist: d?.dist ?? [],
      aviso: d?.aviso ?? null,
      publicaciones: lista.map(pubDelSku),
    });
  }

  out.sort(compararSkus);
  return out;
}

/**
 * Orden del reporte: primero los rojos (ML puede pausarlos), después lo que más
 * reclamos acumula y, a igualdad, lo que más se vende — un SKU con 2 reclamos y
 * 400 ventas urge más que uno con 2 reclamos y 5 ventas.
 */
export function compararSkus(a: ExperienciaSku, b: ExperienciaSku): number {
  const rojoA = a.semaforo === "rojo" ? 0 : 1;
  const rojoB = b.semaforo === "rojo" ? 0 : 1;
  if (rojoA !== rojoB) return rojoA - rojoB;
  if (a.reclamos !== b.reclamos) return b.reclamos - a.reclamos;
  const va = a.ventas180d ?? a.ventasBd180d ?? 0;
  const vb = b.ventas180d ?? b.ventasBd180d ?? 0;
  if (va !== vb) return vb - va;
  return a.clave.localeCompare(b.clave, "es");
}

// --------------------------------------------------------------------- params

export type ExperienciaParams = {
  /** Se listan las publicaciones con experiencia por debajo de esto. */
  umbral: number;
  /** Hasta qué % la fila va en rojo. */
  rojoHasta: number;
  /** Reclamos nuevos mínimos para que salga el mail de aviso. */
  minReclamos: number;
};

export const DEFAULT_EXPERIENCIA_PARAMS: ExperienciaParams = {
  umbral: EXPERIENCIA_MAX,
  rojoHasta: 30,
  minReclamos: 1,
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
    rojoHasta: clamp(src.rojoHasta, DEFAULT_EXPERIENCIA_PARAMS.rojoHasta, 0, EXPERIENCIA_MAX),
    minReclamos: clamp(src.minReclamos, DEFAULT_EXPERIENCIA_PARAMS.minReclamos, 1, 999),
  };
}

// -------------------------------------------------------------------- reporte

/** Un tipo de problema visto desde arriba: a cuántos SKU afecta y cuánto pesa. */
export type ProblemaRanking = {
  categoria: string;
  skus: number;
  reclamos: number;
  ventas180d: number;
  comoMejorar: string | null;
};

export type ExperienciaSummary = {
  /** Publicaciones que trae la captura (todo el catálogo). */
  publicacionesCapturadas: number;
  /** Publicaciones por debajo del umbral (las que entran al reporte). */
  publicaciones: number;
  /**
   * Publicaciones que quedaron afuera porque ML no les puso puntaje: no
   * vendieron nada en la ventana. No es un problema de experiencia, pero se
   * informa para que el total cierre.
   */
  sinPuntaje: number;
  /** Publicaciones cuya fila del listado no se pudo leer en la captura. */
  noLeidas: number;
  /** SKU listados. */
  skus: number;
  rojo: number;
  amarillo: number;
  conReclamos: number;
  sinReclamos: number;
  reclamosTotales: number;
  cancelacionesTotales: number;
  sinVentas: number;
  sinDatos: number;
  /** Unidades vendidas en 180 días de los SKU con reclamos. */
  ventasConReclamos: number;
  /** Los tipos de problema ordenados por reclamos: por dónde empezar. */
  ranking: ProblemaRanking[];
};

export type ExperienciaReport = {
  key: typeof EXPERIENCIA_KEY;
  /** Cuándo se sacó la captura del panel. */
  capturadoEn: string;
  /** Cuándo se armó este reporte. */
  generadoEn: string;
  params: ExperienciaParams;
  items: ExperienciaSku[];
  summary: ExperienciaSummary;
};

/** Resumen del reporte: los KPI de la pantalla y la hoja "Resumen" del Excel. */
export function resumirExperiencia(
  items: ExperienciaSku[],
  opts: { publicacionesCapturadas: number; sinPuntaje?: number; noLeidas?: number },
): ExperienciaSummary {
  let rojo = 0;
  let amarillo = 0;
  let conReclamos = 0;
  let reclamosTotales = 0;
  let cancelacionesTotales = 0;
  let sinVentas = 0;
  let sinDatos = 0;
  let ventasConReclamos = 0;
  let publicaciones = 0;

  // El ranking agrupa los SKU por su PROBLEMA PRINCIPAL y suma los reclamos del
  // SKU entero: es la lista de "arreglá esto y se van tantos reclamos".
  const porCategoria = new Map<string, ProblemaRanking>();

  for (const it of items) {
    publicaciones += it.publicaciones.length;
    if (it.semaforo === "rojo") rojo += 1;
    else if (it.semaforo === "amarillo") amarillo += 1;
    if (it.situacion === "sin-ventas") sinVentas += 1;
    if (it.situacion === "sin-datos") sinDatos += 1;
    cancelacionesTotales += it.cancelaciones;

    if (it.reclamos > 0) {
      conReclamos += 1;
      reclamosTotales += it.reclamos;
      ventasConReclamos += it.ventas180d ?? it.ventasBd180d ?? 0;
    }

    const cat = it.problemaPrincipal?.categoria;
    if (!cat) continue;
    const prev = porCategoria.get(cat);
    if (prev) {
      prev.skus += 1;
      prev.reclamos += it.reclamos;
      prev.ventas180d += it.ventas180d ?? it.ventasBd180d ?? 0;
    } else {
      porCategoria.set(cat, {
        categoria: cat,
        skus: 1,
        reclamos: it.reclamos,
        ventas180d: it.ventas180d ?? it.ventasBd180d ?? 0,
        comoMejorar: it.comoMejorar,
      });
    }
  }

  const ranking = [...porCategoria.values()].sort(
    (a, b) => b.reclamos - a.reclamos || b.skus - a.skus,
  );

  return {
    publicacionesCapturadas: opts.publicacionesCapturadas,
    publicaciones,
    sinPuntaje: opts.sinPuntaje ?? 0,
    noLeidas: opts.noLeidas ?? 0,
    skus: items.length,
    rojo,
    amarillo,
    conReclamos,
    sinReclamos: items.length - conReclamos,
    reclamosTotales,
    cancelacionesTotales,
    sinVentas,
    sinDatos,
    ventasConReclamos,
    ranking,
  };
}

/**
 * Las publicaciones que entran al reporte: las que TIENEN puntaje y está por
 * debajo del umbral. Se usa también para reconstruir la captura anterior cuando
 * hay que comparar, así los dos lados se filtran igual.
 */
export function filtrarAMejorar(pubs: CapturaPub[], umbral: number): CapturaPub[] {
  return pubs.filter((p) => p.experiencia !== null && p.experiencia < umbral);
}

/**
 * Núcleo del reporte: filtra por umbral, agrupa por SKU y resume. Puro →
 * testeable.
 *
 * El filtro se aplica sobre el % del LISTADO: es el número que el panel muestra
 * en la lista de publicaciones y el que ML usa para ordenarlas.
 *
 * Las publicaciones SIN puntaje quedan afuera a propósito. Son la mayoría del
 * catálogo (715 de 2213 en la captura del 29/07) y no tienen mala experiencia:
 * ML no les calculó nada porque no vendieron en la ventana de 180 días. Meterlas
 * ahogaría el reporte con cientos de filas que no hay cómo mejorar. Cuántas son
 * queda informado en el resumen.
 */
export function evaluarExperiencia(
  pubs: CapturaPub[],
  opts: {
    capturadoEn: string;
    generadoEn: string;
    params: ExperienciaParams;
    ventasBdPorSku?: Map<string, number>;
  },
): ExperienciaReport {
  const { params } = opts;
  const items = agruparPorSku(
    filtrarAMejorar(pubs, params.umbral),
    opts.ventasBdPorSku,
    params.rojoHasta,
  );

  return {
    key: EXPERIENCIA_KEY,
    capturadoEn: opts.capturadoEn,
    generadoEn: opts.generadoEn,
    params,
    items,
    summary: resumirExperiencia(items, {
      publicacionesCapturadas: pubs.length,
      sinPuntaje: pubs.filter((p) => p.experiencia === null && p.sinCalcular).length,
      noLeidas: pubs.filter((p) => p.experiencia === null && !p.sinCalcular).length,
    }),
  };
}

// ------------------------------------------------------------------- cambios

/**
 * Un SKU que se movió entre dos capturas. Es lo que se avisa por mail: los
 * reclamos solo suben (la ventana de 180 días los va soltando de a poco), así
 * que un salto en los reclamos es un problema nuevo de esta semana.
 */
export type CambioSku = {
  clave: string;
  sku: string | null;
  titulo: string;
  url: string | null;
  reclamosAntes: number;
  reclamos: number;
  deltaReclamos: number;
  experienciaAntes: number | null;
  experiencia: number | null;
  deltaExperiencia: number | null;
  nivelAntes: string | null;
  nivel: string | null;
  problemaPrincipal: string;
  comoMejorar: string | null;
  /** true cuando el SKU no estaba en la captura anterior. */
  nuevo: boolean;
  /** true cuando además cayó al rojo. */
  cayoEnRojo: boolean;
};

/**
 * Compara la captura de hoy contra la anterior y devuelve los SKU que
 * empeoraron: sumaron reclamos (al menos `minReclamos`) o perdieron puntos de
 * experiencia. Los que mejoraron o quedaron igual no se informan.
 *
 * Un SKU que aparece por primera vez solo se avisa si ya trae reclamos: si no,
 * el primer import avisaría de todo el catálogo.
 */
export function compararCapturas(
  actual: ExperienciaSku[],
  anterior: ExperienciaSku[] | null,
  minReclamos = 1,
): CambioSku[] {
  const antes = new Map((anterior ?? []).map((it) => [it.clave, it]));
  const out: CambioSku[] = [];

  for (const it of actual) {
    const prev = antes.get(it.clave);
    const reclamosAntes = prev?.reclamos ?? 0;
    const deltaReclamos = it.reclamos - reclamosAntes;
    const expAntes = prev?.experiencia ?? null;
    const deltaExp =
      expAntes !== null && it.experiencia !== null ? it.experiencia - expAntes : null;

    const sumoReclamos = deltaReclamos >= minReclamos;
    const bajoPuntaje = deltaExp !== null && deltaExp < 0;
    if (!sumoReclamos && !bajoPuntaje) continue;
    // Un SKU nuevo sin reclamos no es una noticia.
    if (!prev && it.reclamos === 0) continue;

    out.push({
      clave: it.clave,
      sku: it.sku,
      titulo: it.titulo,
      url: it.publicaciones[0]?.url ?? null,
      reclamosAntes,
      reclamos: it.reclamos,
      deltaReclamos,
      experienciaAntes: expAntes,
      experiencia: it.experiencia,
      deltaExperiencia: deltaExp,
      nivelAntes: prev?.nivel ?? null,
      nivel: it.nivel,
      problemaPrincipal: it.problemaPrincipalTexto,
      comoMejorar: it.comoMejorar,
      nuevo: !prev,
      cayoEnRojo: it.semaforo === "rojo" && prev?.semaforo !== "rojo",
    });
  }

  // Lo que cayó al rojo primero, después lo que más reclamos sumó.
  out.sort(
    (a, b) =>
      Number(b.cayoEnRojo) - Number(a.cayoEnRojo) ||
      b.deltaReclamos - a.deltaReclamos ||
      (a.deltaExperiencia ?? 0) - (b.deltaExperiencia ?? 0),
  );
  return out;
}

// -------------------------------------------------------------------- el mail

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Asunto del mail de aviso. */
export function asuntoCambios(cambios: CambioSku[]): string {
  const n = cambios.length;
  const rojos = cambios.filter((c) => c.cayoEnRojo).length;
  if (rojos > 0) {
    return `MA · ${rojos} SKU con mala experiencia de compra (${n} empeoró${n === 1 ? "" : "aron"})`;
  }
  if (n === 1) {
    const c = cambios[0];
    return `MA · empeoró la experiencia de compra: ${c.titulo.slice(0, 60)} (+${c.deltaReclamos} reclamo${c.deltaReclamos === 1 ? "" : "s"})`;
  }
  return `MA · empeoró la experiencia de compra de ${n} SKU`;
}

/**
 * Cuerpo del mail, en texto y HTML. Va autocontenido (sin imágenes ni CSS
 * externo) para que se vea igual en Gmail, Outlook y el celular.
 */
export function cuerpoCambios(
  cambios: CambioSku[],
  opts: { panelUrl?: string | null; max?: number } = {},
): { text: string; html: string } {
  const max = opts.max ?? 25;
  const muestra = cambios.slice(0, max);
  const resto = cambios.length - muestra.length;

  const lineas: string[] = [];
  lineas.push(
    `Empeoró la experiencia de compra de ${cambios.length} SKU en los últimos ${VENTANA_DIAS} días.`,
  );
  lineas.push("");
  for (const c of muestra) {
    lineas.push(`• ${c.sku ?? c.clave} — ${c.titulo}${c.cayoEnRojo ? " [pasó a rojo]" : ""}`);
    lineas.push(
      `  Reclamos: ${c.reclamosAntes} → ${c.reclamos} (+${c.deltaReclamos})` +
        (c.experiencia !== null ? ` · experiencia ${c.experienciaAntes ?? "—"}% → ${c.experiencia}%` : "") +
        (c.nivel ? ` · ${c.nivel}` : ""),
    );
    lineas.push(`  Problema principal: ${c.problemaPrincipal}`);
    if (c.comoMejorar) lineas.push(`  ML pide: ${c.comoMejorar}`);
    if (c.url) lineas.push(`  ${c.url}`);
    lineas.push("");
  }
  if (resto > 0) lineas.push(`… y ${resto} más.`);
  if (opts.panelUrl) {
    lineas.push("");
    lineas.push(`Ver el reporte completo: ${opts.panelUrl}`);
  }

  const filas = muestra
    .map((c) => {
      const marca = c.cayoEnRojo
        ? ' <span style="background:#fee2e2;color:#991b1b;font-size:11px;padding:1px 5px;border-radius:4px">pasó a rojo</span>'
        : "";
      const titulo = c.url
        ? `<a href="${esc(c.url)}" style="color:#0f766e;text-decoration:none">${esc(c.titulo)}</a>`
        : esc(c.titulo);
      return `<tr>
  <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#111827">
    ${titulo}${marca}
    <div style="color:#6b7280;font-size:12px;margin-top:2px">${esc(c.sku ?? c.clave)} · ${esc(c.problemaPrincipal)}</div>
    ${c.comoMejorar ? `<div style="color:#0f766e;font-size:12px;margin-top:4px">${esc(c.comoMejorar)}</div>` : ""}
  </td>
  <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;white-space:nowrap">
    <span style="color:#ef4444;font-size:15px;font-weight:700">+${c.deltaReclamos}</span>
    <div style="color:#6b7280;font-size:12px">${c.reclamosAntes} → ${c.reclamos} reclamos</div>
    ${c.experiencia !== null ? `<div style="color:#9ca3af;font-size:12px">${c.experienciaAntes ?? "—"}% → ${c.experiencia}%</div>` : ""}
  </td>
</tr>`;
    })
    .join("\n");

  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f9fafb;padding:24px">
  <div style="max-width:640px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden">
    <div style="padding:18px 20px;background:#0f766e;color:#fff">
      <div style="font-size:17px;font-weight:700">Empeoró la experiencia de compra</div>
      <div style="font-size:13px;opacity:.85;margin-top:2px">${cambios.length} SKU sumaron problemas de compradores</div>
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

/** Resumen del reporte en texto plano, para logs. */
export function experienciaToText(report: ExperienciaReport, max = 12): string {
  const { summary, items } = report;
  const lineas: string[] = [];
  lineas.push("Publicaciones con mala experiencia de compra");
  lineas.push(
    `${summary.skus} SKU (${summary.publicaciones} publicaciones) por debajo de ${report.params.umbral}% ` +
      `· ${summary.reclamosTotales} problemas en ${VENTANA_DIAS} días · ${summary.rojo} en rojo`,
  );
  lineas.push("");
  for (const it of items.slice(0, max)) {
    lineas.push(
      `• ${it.clave} ${it.titulo.slice(0, 45)} — ${it.reclamos} reclamo${it.reclamos === 1 ? "" : "s"}` +
        (it.ventas180d !== null ? ` / ${it.ventas180d} ventas` : ""),
    );
    lineas.push(`   ${it.problemaPrincipalTexto}`);
  }
  if (items.length > max) lineas.push(`… y ${items.length - max} más (ver en la plataforma).`);
  return lineas.join("\n");
}

/** Etiqueta y color de una fila, para la UI. */
export function experienciaEstado(sku: ExperienciaSku): { label: string; tone: string; dot: string } {
  if (sku.situacion === "sin-ventas") {
    return { label: "Sin ventas", tone: "text-zinc-400", dot: "bg-zinc-500" };
  }
  if (sku.situacion === "sin-datos") {
    return { label: "Sin datos", tone: "text-zinc-400", dot: "bg-zinc-500" };
  }
  if (sku.semaforo === "rojo") return { label: "Mala", tone: "text-red-300", dot: "bg-red-400" };
  if (sku.reclamos > 0) return { label: "Con problemas", tone: "text-amber-300", dot: "bg-amber-400" };
  return { label: "Sin problemas", tone: "text-emerald-300", dot: "bg-emerald-400" };
}
