// Parte del reporte de experiencia de compra que toca red y base de datos.
// La lógica pura (parseo de la captura, agrupado por SKU, comparación, mail)
// está en `experiencia.ts` para poder testearla sin red.
//
// El dato no se puede ir a buscar solo: la experiencia de compra vive en el
// panel de vendedor de MercadoLibre, detrás del login, y no está en la API (lo
// dicen las notas de la doc de MUNDO SHOP). Así que el flujo es:
//
//   1. se captura el panel con el navegador (ver el README),
//   2. se importa el JSON acá, que lo guarda como snapshot y compara con el anterior,
//   3. la pantalla y el Excel leen el último snapshot.

import { prisma } from "@/lib/prisma";
import { cachearConTtl } from "@/lib/cache";
import { msQuery } from "@/lib/mundoshop";
import {
  EXPERIENCIA_KEY,
  VENTANA_DIAS,
  agruparPorSku,
  asuntoCambios,
  compararCapturas,
  cuerpoCambios,
  evaluarExperiencia,
  filtrarAMejorar,
  normalizeExperienciaParams,
  parseCaptura,
  type CambioSku,
  type CapturaPub,
  type ExperienciaParams,
  type ExperienciaReport,
} from "@/lib/experiencia";
import { panelBaseUrl, parseEmails, sendMail } from "@/lib/mail";

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Fecha YYYY-MM-DD en horario de Uruguay (UTC-3, sin horario de verano). */
function uyDateStr(d: Date): string {
  return new Date(d.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * Unidades vendidas en MercadoLibre en los últimos 180 días, por SKU COMPLETO.
 *
 * Hace falta porque ML no siempre informa las ventas: cuando la publicación no
 * tuvo problemas, el panel dice «No tuviste problemas con este producto» y no da
 * ningún número. Sin esto, esos SKU se verían como si no vendieran nada.
 *
 * Van solo las ventas de ML a propósito: el reporte es sobre la experiencia de
 * compra de las publicaciones de ML, así que sumarle el mostrador y el mayorista
 * mezclaría canales que no influyen en ese puntaje.
 */
export async function ventas180dPorSku(now: Date = new Date()): Promise<Map<string, number>> {
  const hasta = uyDateStr(now);
  const desde = uyDateStr(new Date(now.getTime() - (VENTANA_DIAS - 1) * DAY_MS));

  const rows = await msQuery(
    `SELECT oi.item_sku AS sku, SUM(oi.quantity) AS u
     FROM ml_orders o JOIN ml_order_items oi ON oi.order_id = o.id
     WHERE o.status <> 'cancelled'
       AND substr(o.date_created,1,10) >= '${desde}' AND substr(o.date_created,1,10) <= '${hasta}'
       AND oi.item_sku IS NOT NULL AND oi.item_sku <> ''
     GROUP BY oi.item_sku`,
    45000,
  );

  // Se normaliza igual que en la captura (mayúsculas) para que las claves peguen.
  const out = new Map<string, number>();
  for (const r of rows) {
    const sku = String(r.sku).trim().toUpperCase();
    if (!sku) continue;
    out.set(sku, (out.get(sku) ?? 0) + num(r.u));
  }
  return out;
}

// ------------------------------------------------------------------ snapshots

export type SnapshotMeta = {
  id: string;
  capturadoEn: string;
  importadoEn: string;
  importadoPor: string | null;
  publicaciones: number;
  conDetalle: number;
  skus: number;
  reclamos: number;
};

type SnapshotConPayload = SnapshotMeta & { pubs: CapturaPub[] };

const aMeta = (row: {
  id: string;
  capturadoEn: Date;
  importadoEn: Date;
  importadoPor: string | null;
  publicaciones: number;
  conDetalle: number;
  skus: number;
  reclamos: number;
}): SnapshotMeta => ({
  id: row.id,
  capturadoEn: row.capturadoEn.toISOString(),
  importadoEn: row.importadoEn.toISOString(),
  importadoPor: row.importadoPor,
  publicaciones: row.publicaciones,
  conDetalle: row.conDetalle,
  skus: row.skus,
  reclamos: row.reclamos,
});

/**
 * Las últimas capturas, la más nueva primero. Se piden dos porque comparar la de
 * hoy con la anterior es lo que dice qué SKU empeoró.
 */
async function ultimasCapturas(cuantas = 2): Promise<SnapshotConPayload[]> {
  const filas = await prisma.experienciaSnapshot.findMany({
    orderBy: { capturadoEn: "desc" },
    take: cuantas,
  });
  return filas.map((f) => ({
    ...aMeta(f),
    // El payload se guarda ya normalizado, pero se vuelve a parsear por si la
    // forma cambió entre versiones del módulo.
    pubs: parseCaptura(f.payload),
  }));
}

/** El historial de capturas para mostrar en la pantalla (sin los payloads). */
export async function historialCapturas(cuantas = 10): Promise<SnapshotMeta[]> {
  const filas = await prisma.experienciaSnapshot.findMany({
    orderBy: { capturadoEn: "desc" },
    take: cuantas,
    select: {
      id: true,
      capturadoEn: true,
      importadoEn: true,
      importadoPor: true,
      publicaciones: true,
      conDetalle: true,
      skus: true,
      reclamos: true,
    },
  });
  return filas.map(aMeta);
}

// -------------------------------------------------------------------- config

/** Config guardada del reporte (o defaults) desde Prisma + fallback de .env. */
export async function getExperienciaConfig() {
  let cfg: { enabled: boolean; emailTo: string | null; params: unknown } | null = null;
  try {
    const row = await prisma.reportConfig.findUnique({ where: { key: EXPERIENCIA_KEY } });
    if (row) cfg = { enabled: row.enabled, emailTo: row.emailTo, params: row.params };
  } catch {
    /* sin config guardada: defaults */
  }
  const envTo = (process.env.REPORT_EMAIL_TO || "").trim();
  return {
    enabled: cfg?.enabled ?? true,
    emailTo: (cfg?.emailTo ?? envTo) || null,
    params: normalizeExperienciaParams((cfg?.params as Partial<ExperienciaParams> | null) ?? null),
  };
}

// -------------------------------------------------------------------- reporte

export type ExperienciaReportCompleto = ExperienciaReport & {
  /** De qué captura salió. */
  snapshot: SnapshotMeta;
  /** Contra qué captura anterior se comparó (null si es la primera). */
  comparadoCon: SnapshotMeta | null;
  /** Los SKU que empeoraron respecto de la captura anterior. */
  cambios: CambioSku[];
  /** true cuando no se pudo leer las ventas de la base (el reporte igual sirve). */
  sinVentasBd: boolean;
};

/**
 * Arma el reporte con la última captura importada. Devuelve null cuando todavía
 * no hay ninguna: la pantalla muestra cómo importar la primera.
 */
export async function computeExperiencia(
  params?: ExperienciaParams,
  now: Date = new Date(),
): Promise<ExperienciaReportCompleto | null> {
  const p = params ?? (await getExperienciaConfig()).params;

  const [capturas, ventasBd] = await Promise.all([
    ultimasCapturas(2),
    // Sin las ventas de la base el reporte igual sirve: se pierde solo la
    // columna de los SKU a los que ML no les informa las ventas.
    ventas180dPorSku(now).catch(() => null),
  ]);
  if (capturas.length === 0) return null;

  const [actual, anterior] = capturas;
  const report = evaluarExperiencia(actual.pubs, {
    capturadoEn: actual.capturadoEn,
    generadoEn: now.toISOString(),
    params: p,
    ventasBdPorSku: ventasBd ?? new Map(),
  });

  const itemsAnterior = anterior
    ? agruparPorSku(
        filtrarAMejorar(anterior.pubs, p.umbral),
        ventasBd ?? new Map(),
        p.rojoHasta,
      )
    : null;

  return {
    ...report,
    snapshot: actual,
    comparadoCon: anterior ? { ...anterior } : null,
    cambios: compararCapturas(report.items, itemsAnterior, p.minReclamos),
    sinVentasBd: ventasBd === null,
  };
}

/**
 * El reporte cacheado, que es lo que sirve la pantalla.
 *
 * Lo caro acá no es la captura (ya está guardada) sino las ventas de 180 días:
 * son seis meses de órdenes de MUNDO SHOP agrupadas por SKU. Vive en este módulo
 * y no en la ruta para que el import pueda invalidarlo — si no, después de subir
 * una captura la pantalla seguiría mostrando la anterior.
 */
export const experienciaCacheada = cachearConTtl(() => computeExperiencia(), {
  ttlMs: 10 * 60 * 1000,
});

// --------------------------------------------------------------------- import

export type ResultadoImport = {
  snapshot: SnapshotMeta;
  report: ExperienciaReportCompleto;
  /** Cuántos SKU empeoraron respecto de la captura anterior. */
  empeoraron: number;
  primeraCaptura: boolean;
  email: { status: string; to: string | null };
  runId: string | null;
};

/**
 * Importa una captura del panel: la normaliza, la guarda como snapshot, compara
 * con la anterior y avisa por mail lo que empeoró.
 *
 * `listas` son los arrays crudos de la captura (el del listado completo y el del
 * diagnóstico); se mergean por id de publicación.
 *
 * La PRIMERA captura no manda mail: no hay con qué comparar, así que avisaría de
 * todo el catálogo de una.
 */
export async function importarCaptura(opts: {
  listas: unknown[];
  capturadoEn?: Date;
  usuario?: string | null;
  /** false para importar sin mandar el mail. */
  enviarMail?: boolean;
  now?: Date;
}): Promise<ResultadoImport> {
  const now = opts.now ?? new Date();
  const capturadoEn = opts.capturadoEn ?? now;
  const pubs = parseCaptura(...opts.listas);
  if (pubs.length === 0) {
    throw new Error("La captura no trae ninguna publicación reconocible.");
  }

  const cfg = await getExperienciaConfig();

  // Se arma el reporte ANTES de guardar para poder contar SKU y reclamos, y para
  // comparar contra la captura que hoy es la última.
  const [anteriores, ventasBd] = await Promise.all([
    ultimasCapturas(1),
    ventas180dPorSku(now).catch(() => null),
  ]);
  const anterior = anteriores[0] ?? null;

  const previo = evaluarExperiencia(pubs, {
    capturadoEn: capturadoEn.toISOString(),
    generadoEn: now.toISOString(),
    params: cfg.params,
    ventasBdPorSku: ventasBd ?? new Map(),
  });

  const fila = await prisma.experienciaSnapshot.create({
    data: {
      capturadoEn,
      importadoPor: opts.usuario ?? null,
      publicaciones: pubs.length,
      conDetalle: pubs.filter((p) => p.detalle !== null).length,
      skus: previo.summary.skus,
      reclamos: previo.summary.reclamosTotales,
      payload: pubs as unknown as object,
    },
  });

  const itemsAnterior = anterior
    ? agruparPorSku(
        filtrarAMejorar(anterior.pubs, cfg.params.umbral),
        ventasBd ?? new Map(),
        cfg.params.rojoHasta,
      )
    : null;
  const cambios = compararCapturas(previo.items, itemsAnterior, cfg.params.minReclamos);
  const primeraCaptura = anterior === null;

  let email: { status: string; to: string | null } = { status: "skipped:sin-cambios", to: null };
  if (primeraCaptura) {
    email = { status: "skipped:primera-captura", to: null };
  } else if (!cfg.enabled) {
    email = { status: "skipped:deshabilitado", to: null };
  } else if (opts.enviarMail === false) {
    email = { status: "skipped:sin-envio", to: null };
  } else if (cambios.length > 0) {
    const base = panelBaseUrl();
    const cuerpo = cuerpoCambios(cambios, {
      panelUrl: base ? `${base}/reportes/experiencia` : null,
    });
    const res = await sendMail({
      to: parseEmails(cfg.emailTo),
      subject: asuntoCambios(cambios),
      text: cuerpo.text,
      html: cuerpo.html,
    });
    email = { status: res.status, to: res.to };
  }

  let runId: string | null = null;
  try {
    const run = await prisma.reportRun.create({
      data: {
        reportKey: EXPERIENCIA_KEY,
        trigger: "manual",
        items: cambios as unknown as object,
        summary: {
          ...previo.summary,
          snapshotId: fila.id,
          empeoraron: cambios.length,
          primeraCaptura,
        } as unknown as object,
        emailStatus: email.status,
        emailTo: email.to,
      },
    });
    runId = run.id;
  } catch {
    /* el log de la corrida es un extra: la captura ya quedó guardada */
  }

  // La pantalla tiene que ver la captura nueva, no la que estaba cacheada.
  experienciaCacheada.invalidar();

  const snapshot = aMeta(fila);
  return {
    snapshot,
    report: {
      ...previo,
      snapshot,
      comparadoCon: anterior ? { ...anterior } : null,
      cambios,
      sinVentasBd: ventasBd === null,
    },
    empeoraron: cambios.length,
    primeraCaptura,
    email,
    runId,
  };
}

/** Borra una captura importada por error. Devuelve true si existía. */
export async function borrarCaptura(id: string): Promise<boolean> {
  try {
    await prisma.experienciaSnapshot.delete({ where: { id } });
    experienciaCacheada.invalidar();
    return true;
  } catch {
    return false;
  }
}
