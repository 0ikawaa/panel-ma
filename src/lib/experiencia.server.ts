// Parte del reporte de experiencia de compra que toca red y base de datos.
// La lógica pura (aspectos, semáforo, agrupado, caídas, mail) está en
// `experiencia.ts` para poder testearla sin red.

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { msQuery, msListActiveExperiencia, msGetReputacion } from "@/lib/mundoshop";
import {
  EXPERIENCIA_KEY,
  EXPERIENCIA_MAX,
  agruparPorSku,
  asuntoCaidas,
  codigoBase,
  confirmarPendientes,
  cuerpoCaidas,
  detectarCaidas,
  evaluarExperiencia,
  normalizeExperienciaParams,
  type Caida,
  type CaidaPendiente,
  type ExperienciaItem,
  type ExperienciaParams,
  type ExperienciaReport,
  type PubExperiencia,
  type PuntajePrevio,
  type ReputacionResumen,
  type VentasReclamos,
} from "@/lib/experiencia";
import { panelBaseUrl, parseEmails, sendMail } from "@/lib/mail";

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Marca de una caída detectada pero todavía no avisada. Se guarda en
 * `avisoStatus` para no tener que agregar otra columna: mientras vale esto, la
 * caída está marcada en el panel pero el mail no salió.
 */
const PENDIENTE = "pendiente";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Fecha YYYY-MM-DD en horario de Uruguay (UTC-3, sin horario de verano). */
function uyDateStr(d: Date): string {
  return new Date(d.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * Ventas, cancelaciones y reclamos por SKU unificado (código base), desde la BD
 * de MUNDO SHOP.
 *
 * Se usan solo las ventas de MercadoLibre a propósito: el reporte es sobre la
 * experiencia de compra DE LAS PUBLICACIONES DE ML, así que sumarle el mostrador
 * y el mayorista mezclaría canales que no tienen nada que ver con ese puntaje.
 *
 * Los RECLAMOS salen de `ml_claims`, que MUNDO SHOP tiene creada pero todavía
 * vacía (ML no habilitó ese permiso). La consulta ya está armada para cuando se
 * llene; mientras tanto devuelve 0 y `reclamosDisponibles` queda en false para
 * poder decirlo en la pantalla en vez de mostrar un cero que parece un dato.
 */
export async function ventasReclamosPorCodigo(
  now: Date = new Date(),
): Promise<{ porCodigo: Map<string, VentasReclamos>; reclamosDisponibles: boolean }> {
  const hasta = uyDateStr(now);
  const desde90 = uyDateStr(new Date(now.getTime() - 89 * DAY_MS));
  const desde30 = uyDateStr(new Date(now.getTime() - 29 * DAY_MS));

  const sqlVentas = `
    SELECT oi.item_sku AS sku,
      SUM(CASE WHEN o.status <> 'cancelled' AND substr(o.date_created,1,10) >= '${desde30}' THEN oi.quantity ELSE 0 END) AS u30,
      SUM(CASE WHEN o.status <> 'cancelled' THEN oi.quantity ELSE 0 END) AS u90,
      COUNT(DISTINCT CASE WHEN o.status <> 'cancelled' THEN o.id END) AS ordenes90,
      SUM(CASE WHEN o.status = 'cancelled' THEN oi.quantity ELSE 0 END) AS cancel90
    FROM ml_orders o JOIN ml_order_items oi ON oi.order_id = o.id
    WHERE substr(o.date_created,1,10) >= '${desde90}' AND substr(o.date_created,1,10) <= '${hasta}'
      AND oi.item_sku IS NOT NULL AND oi.item_sku <> ''
    GROUP BY oi.item_sku`;

  // Reclamos por SKU: ml_claims.resource_id apunta a la orden de ML.
  const sqlReclamos = `
    SELECT oi.item_sku AS sku, COUNT(DISTINCT c.id) AS reclamos
    FROM ml_claims c
    JOIN ml_orders o ON o.id = c.resource_id
    JOIN ml_order_items oi ON oi.order_id = o.id
    WHERE substr(c.date_created,1,10) >= '${desde90}' AND substr(c.date_created,1,10) <= '${hasta}'
      AND oi.item_sku IS NOT NULL AND oi.item_sku <> ''
    GROUP BY oi.item_sku`;

  const [ventasRows, reclamosRows] = await Promise.all([
    msQuery(sqlVentas, 45000),
    // Si la tabla cambia de forma o el permiso sigue cerrado, el reporte sigue.
    msQuery(sqlReclamos, 30000).catch(() => null),
  ]);

  const porCodigo = new Map<string, VentasReclamos>();
  const acumular = (sku: string, patch: Partial<VentasReclamos>) => {
    const codigo = codigoBase(sku);
    const prev = porCodigo.get(codigo) ?? {
      unidades30d: 0,
      unidades90d: 0,
      ordenes90d: 0,
      canceladas90d: 0,
      reclamos90d: 0,
    };
    porCodigo.set(codigo, {
      unidades30d: prev.unidades30d + (patch.unidades30d ?? 0),
      unidades90d: prev.unidades90d + (patch.unidades90d ?? 0),
      ordenes90d: prev.ordenes90d + (patch.ordenes90d ?? 0),
      canceladas90d: prev.canceladas90d + (patch.canceladas90d ?? 0),
      reclamos90d: prev.reclamos90d + (patch.reclamos90d ?? 0),
    });
  };

  for (const r of ventasRows) {
    acumular(String(r.sku), {
      unidades30d: num(r.u30),
      unidades90d: num(r.u90),
      ordenes90d: num(r.ordenes90),
      canceladas90d: num(r.cancel90),
    });
  }
  for (const r of reclamosRows ?? []) {
    acumular(String(r.sku), { reclamos90d: num(r.reclamos) });
  }

  // "Disponible" = la consulta corrió Y devolvió algo. Con la tabla vacía no
  // tiene sentido mostrar "0 reclamos" como si fuera un dato real.
  const reclamosDisponibles = !!reclamosRows && reclamosRows.length > 0;
  return { porCodigo, reclamosDisponibles };
}

/**
 * Puente item_id → SKU armado con las ventas históricas (`ml_order_items`).
 *
 * Existe porque MercadoLibre devuelve `seller_sku` vacío en casi todas las
 * publicaciones (45 de 817), así que sin este puente el reporte no podría
 * unificar nada: cada publicación quedaría como un grupo suelto. Con las ventas
 * se recupera el SKU de todo lo que alguna vez se vendió, que es justamente lo
 * que interesa mirar.
 *
 * Una publicación puede haber vendido varias variantes; se toma la más vendida,
 * que para agrupar por código base da lo mismo (todas comparten el código padre).
 */
export async function skuPorItemId(): Promise<Map<string, string>> {
  const rows = await msQuery(
    `SELECT item_id, item_sku, COUNT(*) AS n
     FROM ml_order_items
     WHERE item_sku IS NOT NULL AND item_sku <> ''
     GROUP BY item_id, item_sku`,
    45000,
  );
  const mejor = new Map<string, { sku: string; n: number }>();
  for (const r of rows) {
    const id = String(r.item_id);
    const sku = String(r.item_sku);
    const n = num(r.n);
    const prev = mejor.get(id);
    if (!prev || n > prev.n) mejor.set(id, { sku, n });
  }
  return new Map([...mejor].map(([id, v]) => [id, v.sku]));
}

/** Reputación global del vendedor, achatada a lo que muestra el reporte. */
async function reputacionResumen(): Promise<ReputacionResumen | null> {
  try {
    const r = await msGetReputacion(20000);
    return {
      nivel: r.nivel,
      powerSeller: r.power_seller,
      reclamos120d: r.metricas_120d.reclamos.cantidad,
      reclamosTasaPct: r.metricas_120d.reclamos.tasa_pct,
      demoras120d: r.metricas_120d.demoras_despacho.cantidad,
      demorasTasaPct: r.metricas_120d.demoras_despacho.tasa_pct,
      cancelaciones120d: r.metricas_120d.cancelaciones.cantidad,
      cancelacionesTasaPct: r.metricas_120d.cancelaciones.tasa_pct,
      ventasCompletadas120d: r.metricas_120d.ventas_completadas,
    };
  } catch {
    return null; // la reputación es un extra: si falla, el reporte igual sirve
  }
}

/**
 * Arma el reporte completo: barre las publicaciones activas con su experiencia,
 * les pega las ventas/reclamos por SKU unificado y la reputación del vendedor.
 *
 * NO incluye las marcas de «bajó» a propósito: este resultado se cachea 15
 * minutos y las marcas cambian con cada corrida, así que se pegan aparte con
 * `conMarcasDelPanel` en cada pedido.
 */
export async function computeExperiencia(
  params?: ExperienciaParams,
  now: Date = new Date(),
): Promise<ExperienciaReport> {
  const p = params ?? (await getExperienciaConfig()).params;

  const [live, ventas, skuPorItem, reputacion] = await Promise.all([
    msListActiveExperiencia({ timeoutMs: 20000, concurrency: 24 }),
    // Sin ventas el reporte igual sirve (el puntaje es lo principal).
    ventasReclamosPorCodigo(now).catch(() => ({
      porCodigo: new Map<string, VentasReclamos>(),
      reclamosDisponibles: false,
    })),
    // Sin el puente se pierde el agrupado, pero el reporte igual sale.
    skuPorItemId().catch(() => new Map<string, string>()),
    reputacionResumen(),
  ]);

  return evaluarExperiencia(live.rows, {
    generadoEn: now.toISOString(),
    params: p,
    ventasPorCodigo: ventas.porCodigo,
    skuPorItem,
    reputacion,
    reclamosPorSkuDisponibles: ventas.reclamosDisponibles,
    fallidos: live.fallidos,
  });
}

// ------------------------------------------------------------- marcas y avisos

/** La marca de caída guardada de una publicación, para pintarla en el panel. */
export type MarcaCaida = {
  itemId: string;
  bajoDe: number;
  bajoDelta: number;
  bajoEn: string; // ISO
  cruzo100: boolean;
  problema: string | null;
  avisoStatus: string | null;
};

export type ExperienciaReportConMarcas = ExperienciaReport & {
  /** Caídas pendientes de revisar, por id de publicación. */
  marcas: Record<string, MarcaCaida>;
  /** Cuántas publicaciones tienen la marca sin ver. */
  bajaronSinVer: number;
};

/**
 * Le pega al reporte las marcas de «bajó» que están sin ver. Se leen de la BD y
 * no se recalculan acá: la detección de caídas corre en la corrida
 * (`runAndDeliverExperiencia`), así que abrir la pantalla no dispara mails.
 *
 * Va SIEMPRE por fuera del cache del reporte: si las marcas viajaran adentro,
 * después de una corrida la pantalla seguiría mostrando las de hace 15 minutos.
 */
export async function conMarcasDelPanel(
  report: ExperienciaReport,
): Promise<ExperienciaReportConMarcas> {
  let filas: Awaited<ReturnType<typeof prisma.experienciaScore.findMany>> = [];
  try {
    filas = await prisma.experienciaScore.findMany({
      where: { bajoEn: { not: null }, vistoEn: null },
    });
  } catch {
    // Si la migración todavía no corrió, el reporte se muestra sin marcas.
    return { ...report, marcas: {}, bajaronSinVer: 0 };
  }

  const marcas: Record<string, MarcaCaida> = {};
  for (const f of filas) {
    if (f.bajoEn === null) continue;
    marcas[f.itemId] = {
      itemId: f.itemId,
      bajoDe: f.bajoDe ?? f.score,
      bajoDelta: f.bajoDelta ?? 0,
      bajoEn: f.bajoEn.toISOString(),
      cruzo100: f.bajoCruzo100,
      problema: f.bajoProblema,
      avisoStatus: f.avisoStatus,
    };
  }
  return { ...report, marcas, bajaronSinVer: Object.keys(marcas).length };
}

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

/** Los puntajes de la corrida anterior, para poder comparar. */
async function puntajesPrevios(): Promise<PuntajePrevio[]> {
  const filas = await prisma.experienciaScore.findMany({ select: { itemId: true, score: true } });
  return filas.map((f) => ({ itemId: f.itemId, score: f.score }));
}

/**
 * Guarda el puntaje que leyó esta corrida y actualiza las marcas del panel.
 *
 * - `nuevas` → caídas recién detectadas: se marcan como PENDIENTE (se ven en el
 *   panel, todavía sin mail).
 * - `confirmadas` → caídas que ya venían marcadas y siguen caídas: se les pone
 *   el estado del envío.
 * - `recuperadas` → volvieron al puntaje que tenían: la marca se borra sola.
 *
 * Los puntajes van con un solo INSERT ... ON CONFLICT en vez de ~800 upserts de
 * Prisma: con upserts de a uno la corrida tardaba 131s (más que el `maxDuration`
 * de la ruta) y con el bulk baja a ~20s. Las marcas son un puñado, así que ésas
 * sí van con updates comunes.
 */
async function guardarPuntajes(
  items: ExperienciaItem[],
  nuevas: Caida[],
  confirmadas: Caida[],
  avisoStatus: string | null,
  now: Date,
): Promise<number> {
  const filas = items.flatMap((grupo) =>
    grupo.publicaciones.map((pub) => ({
      itemId: pub.id,
      sku: pub.sku,
      codigo: grupo.codigo,
      titulo: pub.titulo,
      score: pub.score,
      nivel: pub.nivel,
    })),
  );
  if (filas.length === 0) return 0;

  // Antes de pisar los puntajes hay que saber qué marcas había, para poder
  // limpiar las de las publicaciones que se recuperaron.
  const previas = await prisma.experienciaScore.findMany({
    where: { bajoEn: { not: null } },
    select: { itemId: true, bajoDe: true },
  });

  // Bulk upsert. Postgres aguanta 65535 parámetros por statement y acá van 7 por
  // fila (~5700 para 817), pero se parte igual para no depender del tamaño del
  // catálogo.
  const TANDA = 500;
  for (let i = 0; i < filas.length; i += TANDA) {
    const values = filas
      .slice(i, i + TANDA)
      .map(
        (f) =>
          Prisma.sql`(${f.itemId}, ${f.sku}, ${f.codigo}, ${f.titulo}, ${f.score}, ${f.nivel}, ${now})`,
      );
    await prisma.$executeRaw`
      INSERT INTO "ExperienciaScore" ("itemId", "sku", "codigo", "titulo", "score", "nivel", "checkedAt")
      VALUES ${Prisma.join(values)}
      ON CONFLICT ("itemId") DO UPDATE SET
        "sku" = EXCLUDED."sku",
        "codigo" = EXCLUDED."codigo",
        "titulo" = EXCLUDED."titulo",
        "score" = EXCLUDED."score",
        "nivel" = EXCLUDED."nivel",
        "checkedAt" = EXCLUDED."checkedAt"`;
  }

  // Caídas nuevas: quedan marcadas y esperando la confirmación de mañana.
  for (const c of nuevas) {
    await prisma.experienciaScore.update({
      where: { itemId: c.itemId },
      data: {
        bajoDe: c.scoreAnterior,
        bajoDelta: c.delta,
        bajoEn: now,
        bajoCruzo100: c.cruzo100,
        bajoProblema: c.problemaPrincipal,
        avisadoEn: null,
        avisoStatus: PENDIENTE,
        vistoEn: null,
        vistoPor: null,
      },
    });
  }

  // Caídas confirmadas: se refresca el delta con el puntaje de hoy y se anota el envío.
  for (const c of confirmadas) {
    await prisma.experienciaScore.update({
      where: { itemId: c.itemId },
      data: {
        bajoDelta: c.delta,
        bajoCruzo100: c.cruzo100,
        bajoProblema: c.problemaPrincipal,
        avisadoEn: avisoStatus === "sent" ? now : null,
        avisoStatus,
      },
    });
  }

  // Marcas que dejan de tener sentido: la publicación volvió a donde estaba.
  const marcadas = new Set([...nuevas, ...confirmadas].map((c) => c.itemId));
  const scorePorItem = new Map(filas.map((f) => [f.itemId, f.score]));
  const recuperadas = previas
    .filter((p) => !marcadas.has(p.itemId))
    .filter((p) => p.bajoDe !== null && (scorePorItem.get(p.itemId) ?? -1) >= p.bajoDe)
    .map((p) => p.itemId);
  if (recuperadas.length > 0) {
    await prisma.experienciaScore.updateMany({
      where: { itemId: { in: recuperadas } },
      data: {
        bajoDe: null,
        bajoDelta: null,
        bajoEn: null,
        bajoCruzo100: false,
        bajoProblema: null,
        avisadoEn: null,
        avisoStatus: null,
        vistoEn: null,
        vistoPor: null,
      },
    });
  }
  return recuperadas.length;
}

/** Las caídas marcadas en el panel que todavía no se avisaron por mail. */
async function caidasPendientes(): Promise<CaidaPendiente[]> {
  const filas = await prisma.experienciaScore.findMany({
    where: { bajoEn: { not: null }, avisoStatus: PENDIENTE },
    select: { itemId: true, bajoDe: true, score: true },
  });
  return filas
    .filter((f): f is typeof f & { bajoDe: number } => f.bajoDe !== null)
    .map((f) => ({ itemId: f.itemId, bajoDe: f.bajoDe, score: f.score }));
}

/**
 * Corre el reporte, detecta las publicaciones que bajaron, manda el mail y deja
 * la marca en el panel. Lo usan el botón manual y el cron diario.
 *
 * @param trigger "manual" | "cron"
 * @param opts.send false para generar y guardar sin mandar el mail
 */
export async function runAndDeliverExperiencia(
  trigger: "manual" | "cron",
  opts: { send?: boolean } = {},
): Promise<{
  report: ExperienciaReportConMarcas;
  /** Caídas confirmadas: las que van en el mail. */
  caidas: Caida[];
  /** Caídas nuevas: marcadas en el panel, esperando la confirmación de la próxima corrida. */
  nuevas: number;
  /** Marcas que se limpiaron porque la publicación recuperó su puntaje. */
  recuperadas: number;
  email: { status: string; to: string | null };
  primeraCorrida: boolean;
  runId: string | null;
}> {
  const cfg = await getExperienciaConfig();
  const now = new Date();
  const report = await computeExperiencia(cfg.params, now);

  const [previos, pendientes] = await Promise.all([puntajesPrevios(), caidasPendientes()]);
  // Sin nada guardado esta es la foto inicial: se guarda y no se avisa nada.
  const primeraCorrida = previos.length === 0;

  // Índice de lo que leyó esta corrida, para confirmar las pendientes.
  const actual = new Map<string, PubExperiencia>();
  for (const g of report.items) for (const p of g.publicaciones) actual.set(p.id, p);

  // Paso 1: las que ya venían marcadas y HOY siguen caídas → se confirman y se avisan.
  const confirmadas = primeraCorrida
    ? []
    : confirmarPendientes(pendientes, actual, cfg.params.minCaida);

  // Paso 2: caídas nuevas contra la referencia guardada → se marcan, sin mail
  // todavía (ver `confirmarPendientes`: el puntaje del barrido no es comparable
  // con una lectura individual, así que una sola lectura no alcanza para avisar).
  const yaPendiente = new Set(pendientes.map((p) => p.itemId));
  const nuevas = primeraCorrida
    ? []
    : detectarCaidas(report.items, previos, cfg.params.minCaida).filter(
        (c) => !yaPendiente.has(c.itemId),
      );

  let email: { status: string; to: string | null } = { status: "skipped:sin-caidas", to: null };
  const shouldSend = opts.send !== false && confirmadas.length > 0 && cfg.enabled;
  if (shouldSend) {
    const base = panelBaseUrl();
    const cuerpo = cuerpoCaidas(confirmadas, {
      panelUrl: base ? `${base}/reportes/experiencia` : null,
    });
    const res = await sendMail({
      to: parseEmails(cfg.emailTo),
      subject: asuntoCaidas(confirmadas),
      text: cuerpo.text,
      html: cuerpo.html,
    });
    email = { status: res.status, to: res.to };
  } else if (primeraCorrida) {
    email = { status: "skipped:primera-corrida", to: null };
  } else if (!cfg.enabled) {
    email = { status: "skipped:deshabilitado", to: null };
  } else if (nuevas.length > 0) {
    email = { status: "skipped:a-confirmar", to: null };
  }

  const recuperadas = await guardarPuntajes(
    report.items,
    nuevas,
    confirmadas,
    confirmadas.length > 0 ? email.status : null,
    now,
  );

  let runId: string | null = null;
  try {
    const run = await prisma.reportRun.create({
      data: {
        reportKey: EXPERIENCIA_KEY,
        trigger,
        items: confirmadas as unknown as object,
        summary: {
          ...report.summary,
          caidas: confirmadas.length,
          nuevasAConfirmar: nuevas.length,
          recuperadas,
          cruzaron100: confirmadas.filter((c) => c.cruzo100).length,
          primeraCorrida,
        } as unknown as object,
        emailStatus: email.status,
        emailTo: email.to,
      },
    });
    runId = run.id;
  } catch {
    /* el log de la corrida es un extra: si falla, el reporte ya se guardó */
  }

  // Las marcas recién escritas tienen que verse en lo que se devuelve.
  const conMarcas = await conMarcasDelPanel(report);
  return {
    report: conMarcas,
    caidas: confirmadas,
    nuevas: nuevas.length,
    recuperadas,
    email,
    primeraCorrida,
    runId,
  };
}

/** Marca como vistas las caídas de las publicaciones indicadas (limpia la marca del panel). */
export async function marcarCaidasVistas(itemIds: string[], usuario: string | null): Promise<number> {
  if (itemIds.length === 0) return 0;
  const res = await prisma.experienciaScore.updateMany({
    where: { itemId: { in: itemIds }, bajoEn: { not: null } },
    data: { vistoEn: new Date(), vistoPor: usuario },
  });
  return res.count;
}

/** Marca como vistas TODAS las caídas pendientes. */
export async function marcarTodasVistas(usuario: string | null): Promise<number> {
  const res = await prisma.experienciaScore.updateMany({
    where: { bajoEn: { not: null }, vistoEn: null },
    data: { vistoEn: new Date(), vistoPor: usuario },
  });
  return res.count;
}

/** Reexportado para las rutas, que arman el reporte agrupado en el export. */
export { agruparPorSku, EXPERIENCIA_MAX };
