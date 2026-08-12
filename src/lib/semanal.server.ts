// Parte del reporte semanal que toca red y base (MUNDO SHOP + Prisma + mail).
// La lógica pura vive en `semanal.ts` y el Excel en `semanal.xlsx.ts`.

import { prisma } from "@/lib/prisma";
import { msQuery, mlPhotoMap } from "@/lib/mundoshop";
import { fotoPorSku, indexarFotosPorCodigo, mapasVacios } from "@/lib/fotoProducto";
import { sendMail, parseEmails, panelBaseUrl, type MailResult } from "@/lib/mail";
import { buildSemanalXlsx, type FotoBytes } from "@/lib/semanal.xlsx";
import {
  SEMANAL_KEY,
  buildReport,
  fmtCobertura,
  normalizeParams,
  reportToText,
  ventanaSemanal,
  type SemanalInput,
  type SemanalParams,
  type SemanalReport,
} from "@/lib/semanal";

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// ------------------------------------------------------------------- config

export type SemanalConfig = {
  enabled: boolean;
  emailTo: string | null;
  params: SemanalParams;
};

/** Config guardada del reporte, con defaults cuando todavía no se tocó nada. */
export async function getSemanalConfig(): Promise<SemanalConfig> {
  const row = await prisma.reportConfig.findUnique({ where: { key: SEMANAL_KEY } });
  return {
    enabled: row?.enabled ?? true,
    // Sin destino guardado vale el del .env, igual que el resto de los avisos.
    emailTo: row?.emailTo ?? process.env.REPORT_EMAIL_TO ?? null,
    params: normalizeParams(row?.params as Partial<SemanalParams> | null),
  };
}

export async function saveSemanalConfig(patch: {
  enabled?: boolean;
  emailTo?: string | null;
  params?: Partial<SemanalParams>;
}): Promise<SemanalConfig> {
  const actual = await getSemanalConfig();
  const params = normalizeParams({ ...actual.params, ...(patch.params ?? {}) });
  const emailTo = patch.emailTo === undefined ? actual.emailTo : patch.emailTo;
  const enabled = patch.enabled === undefined ? actual.enabled : patch.enabled;
  await prisma.reportConfig.upsert({
    where: { key: SEMANAL_KEY },
    create: { key: SEMANAL_KEY, enabled, emailTo, params: params as unknown as object },
    update: { enabled, emailTo, params: params as unknown as object },
  });
  return { enabled, emailTo, params };
}

// ------------------------------------------------------------------ compute

/**
 * Consulta los datos en vivo y arma el reporte de la última semana cerrada.
 *
 * Las ventas se piden en UNA sola consulta con las dos ventanas (la semana y la
 * ventana larga del ritmo) resueltas con SUM(CASE ...): son las mismas filas, no
 * tiene sentido leerlas dos veces.
 */
export async function computeSemanal(
  params: SemanalParams,
  now: Date = new Date(),
): Promise<SemanalReport> {
  const v = ventanaSemanal(params, now);

  // Ventas unificadas por SKU, mismo criterio que /api/reposicion: ML real +
  // Odoo POS (local) + Odoo Sale sin "Mateo Alpuy" (espejo de ML → duplicaría).
  const sqlVentas = `
    SELECT sku,
      SUM(CASE WHEN d >= '${v.desde}' AND d <= '${v.hasta}' THEN units ELSE 0 END) AS semana,
      SUM(CASE WHEN d >= '${v.ritmoDesde}' AND d <= '${v.hasta}' THEN units ELSE 0 END) AS ritmo
    FROM (
      SELECT oi.item_sku AS sku, oi.quantity AS units, substr(o.date_created,1,10) AS d
      FROM ml_orders o JOIN ml_order_items oi ON oi.order_id = o.id
      WHERE o.status <> 'cancelled'
      UNION ALL
      SELECT pr.default_code AS sku, l.qty AS units, substr(o.date_order,1,10) AS d
      FROM odoo_pos_orders o JOIN odoo_pos_order_lines l ON l.order_id = o.id
      LEFT JOIN odoo_products pr ON pr.id = l.product_id
      WHERE o.state <> 'cancel'
      UNION ALL
      SELECT pr.default_code AS sku, l.product_uom_qty AS units, substr(o.date_order,1,10) AS d
      FROM odoo_sale_orders o JOIN odoo_sale_order_lines l ON l.order_id = o.id
      LEFT JOIN odoo_products pr ON pr.id = l.product_id
      WHERE o.state = 'sale' AND (o.salesman_name IS NULL OR o.salesman_name <> 'Mateo Alpuy')
    )
    WHERE sku IS NOT NULL AND sku <> '' AND d >= '${v.ritmoDesde}' AND d <= '${v.hasta}'
    GROUP BY sku`;

  const sqlStock = `
    SELECT default_code AS sku, SUM(qty_available) AS stock,
           MAX(name) AS name, MAX(categ_name) AS categ
    FROM odoo_products
    WHERE default_code IS NOT NULL AND default_code <> ''
    GROUP BY default_code`;

  const sqlEnCamino = `
    SELECT sku, SUM(cantidad) AS en_camino
    FROM productos_en_camino
    WHERE sku IS NOT NULL AND sku <> ''
    GROUP BY sku`;

  const [ventasRows, stockRows, caminoRows, productos, photos] = await Promise.all([
    msQuery(sqlVentas, 45000),
    msQuery(sqlStock, 45000),
    msQuery(sqlEnCamino, 45000),
    prisma.product.findMany({
      where: { codigo: { not: null } },
      select: { codigo: true, photo: true, fotoManual: true },
      orderBy: { createdAt: "desc" },
    }),
    // Las fotos no valen romper el reporte: sin ellas el Excel sale igual.
    mlPhotoMap().catch(mapasVacios),
  ]);

  const stockMap = new Map<string, { stock: number | null; name: string | null; categ: string | null }>();
  for (const r of stockRows) {
    stockMap.set(String(r.sku), {
      stock: num(r.stock),
      name: r.name ? String(r.name) : null,
      categ: r.categ ? String(r.categ) : null,
    });
  }
  const caminoMap = new Map<string, number>();
  for (const r of caminoRows) caminoMap.set(String(r.sku), num(r.en_camino) ?? 0);

  const fotos = indexarFotosPorCodigo(productos);

  const rows: SemanalInput[] = [];
  for (const r of ventasRows) {
    const sku = String(r.sku);
    // Igual que Reposición: los SKUs que no arrancan con dígito son conceptos
    // de envío ("self_service", "drop_off"), no productos.
    if (!/^\d/.test(sku)) continue;
    const st = stockMap.get(sku);
    rows.push({
      sku,
      titulo: st?.name ?? null,
      categoria: st?.categ ?? null,
      unidadesSemana: num(r.semana) ?? 0,
      unidadesRitmo: num(r.ritmo) ?? 0,
      stock: st ? st.stock : null,
      enCamino: caminoMap.get(sku) ?? 0,
      photo: fotoPorSku(fotos, photos, sku),
    });
  }

  return buildReport(rows, params, now);
}

// -------------------------------------------------------------------- fotos

const MIME_OK: Record<string, "jpeg" | "png"> = {
  "image/jpeg": "jpeg",
  "image/jpg": "jpeg",
  "image/png": "png",
};

/**
 * Baja las fotos de las variantes del reporte para poder embeberlas en el Excel.
 * Nunca tira: la que falla simplemente no va. Se acota la concurrencia para no
 * abrir trescientas conexiones a la vez contra MercadoLibre.
 */
export async function descargarFotos(
  report: SemanalReport,
  opts: { concurrencia?: number; timeoutMs?: number; max?: number } = {},
): Promise<Map<string, FotoBytes>> {
  const timeoutMs = opts.timeoutMs ?? 8000;
  const objetivo = report.items.filter((it) => it.photo).slice(0, opts.max ?? 1000);
  const out = new Map<string, FotoBytes>();
  let i = 0;

  const worker = async () => {
    for (;;) {
      const idx = i++;
      if (idx >= objetivo.length) return;
      const it = objetivo[idx];
      try {
        const res = await fetch(it.photo!, { signal: AbortSignal.timeout(timeoutMs) });
        if (!res.ok) continue;
        const ext = MIME_OK[(res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase()];
        if (!ext) continue; // webp/gif no entran en el .xlsx
        out.set(it.sku, { data: new Uint8Array(await res.arrayBuffer()), ext });
      } catch {
        /* una foto que no baja no rompe el reporte */
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(opts.concurrencia ?? 12, objetivo.length) }, worker));
  return out;
}

// --------------------------------------------------------------------- mail

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const fmtInt = (n: number) => Math.round(n).toLocaleString("es-UY");

/** Cuerpo HTML del mail: el resumen y las primeras variantes con foto. */
export function buildSemanalHtml(report: SemanalReport, topN = 20): string {
  const { summary: s, ventana, params } = report;
  const base = panelBaseUrl();
  const top = report.items.slice(0, topN);

  const filas = top
    .map((it) => {
      const foto = it.photo
        ? `<img src="${esc(it.photo)}" width="56" height="56" alt="" ` +
          `style="width:56px;height:56px;object-fit:contain;border-radius:6px;background:#f4f4f5">`
        : `<div style="width:56px;height:56px;border-radius:6px;background:#f4f4f5"></div>`;
      const pedir =
        it.pedir > 0
          ? `<strong style="color:#b91c1c">pedir ${fmtInt(it.pedir)}</strong>`
          : `<span style="color:#15803d">alcanza</span>`;
      return (
        `<tr>` +
        `<td style="padding:8px 10px 8px 0;vertical-align:top">${foto}</td>` +
        `<td style="padding:8px 0;vertical-align:top;font:13px system-ui,sans-serif;color:#18181b">` +
        `<div><strong>${esc(it.sku)}</strong> · ${esc(it.titulo ?? "sin título")}</div>` +
        `<div style="color:#52525b;padding-top:2px">` +
        `${fmtInt(it.unidadesSemana)} u en la semana · stock ${fmtInt(it.stock)}` +
        (it.enCamino > 0 ? ` (+${fmtInt(it.enCamino)} en camino)` : "") +
        ` · cubre ${esc(fmtCobertura(it.mesesCobertura))} · ${pedir}` +
        `</div></td></tr>`
      );
    })
    .join("");

  const resto =
    report.items.length > topN
      ? `<p style="font:13px system-ui,sans-serif;color:#52525b">` +
        `Y ${fmtInt(report.items.length - topN)} variantes más en el Excel adjunto.</p>`
      : "";

  const link = base
    ? `<p style="font:13px system-ui,sans-serif"><a href="${esc(base)}/reportes/semanal" ` +
      `style="color:#0f766e">Ver el reporte en el panel</a></p>`
    : "";

  return (
    `<div style="max-width:680px;margin:0 auto;padding:24px;font:14px system-ui,sans-serif;color:#18181b">` +
    `<h1 style="font-size:19px;margin:0 0 4px">Reporte semanal · ${esc(ventana.label)}</h1>` +
    `<p style="color:#52525b;margin:0 0 16px;font-size:13px">` +
    `Semana del ${esc(ventana.desde)} al ${esc(ventana.hasta)}</p>` +
    `<p style="margin:0 0 4px"><strong>${fmtInt(s.unidadesSemana)}</strong> unidades · ` +
    `<strong>${fmtInt(s.variantes)}</strong> variantes de ${fmtInt(s.productos)} productos</p>` +
    `<p style="margin:0 0 16px"><strong>${fmtInt(s.aReponer)}</strong> variantes no llegan a ` +
    `${params.mesesObjetivo} meses → pedir <strong>${fmtInt(s.unidadesAPedir)}</strong> unidades` +
    (s.sinStock > 0 ? ` · ${fmtInt(s.sinStock)} vendieron y ya están sin stock` : "") +
    `</p>` +
    `<table style="border-collapse:collapse;width:100%">${filas}</table>` +
    resto +
    link +
    `<p style="color:#71717a;font-size:11px;margin-top:20px">` +
    `El ritmo se mide sobre los últimos ${params.ritmoDias} días; "pedir" son las unidades ` +
    `para cubrir ${params.mesesObjetivo} meses` +
    (params.descontarEnCamino ? ", descontando lo que ya viene en camino." : ".") +
    `</p></div>`
  );
}

/** Nombre del adjunto: "reporte-semanal-2026-08-10.xlsx". */
export function nombreAdjunto(report: SemanalReport): string {
  return `reporte-semanal-${report.ventana.hasta}.xlsx`;
}

/**
 * Corre el reporte, arma el Excel con fotos, lo manda por mail y deja registro
 * en ReportRun. Es lo que llama el cron de los lunes y el botón "Enviar ahora".
 */
export async function runAndDeliverSemanal(
  trigger: "manual" | "cron",
  opts: { send?: boolean; to?: string[] } = {},
) {
  const cfg = await getSemanalConfig();
  const report = await computeSemanal(cfg.params);

  const bytesPorSku = await descargarFotos(report);
  const xlsx = await buildSemanalXlsx(report, bytesPorSku);

  let mail: Pick<MailResult, "status" | "to"> = { status: "skipped:no-enviado", to: null };
  const destinos = opts.to ?? parseEmails(cfg.emailTo);
  const quiereEnviar = opts.send !== false;
  // El cron respeta el interruptor de la pantalla; el envío manual no (si
  // alguien aprieta el botón es porque lo quiere ahora).
  const habilitado = trigger === "cron" ? cfg.enabled : true;

  if (quiereEnviar && habilitado) {
    const res = await sendMail({
      to: destinos,
      subject: `Reporte semanal · ${report.ventana.label} · ${fmtInt(report.summary.unidadesSemana)} u vendidas`,
      text: reportToText(report),
      html: buildSemanalHtml(report),
      attachments: [{ filename: nombreAdjunto(report), content: xlsx }],
    });
    mail = { status: res.status, to: res.to };
  } else if (!habilitado) {
    mail = { status: "skipped:deshabilitado", to: null };
  }

  const run = await prisma.reportRun.create({
    data: {
      reportKey: SEMANAL_KEY,
      trigger,
      // El snapshot guarda las filas sin la URL de foto: no aporta nada al
      // histórico y engorda bastante el JSON.
      items: report.items.map((it) => {
        const fila: Record<string, unknown> = { ...it };
        delete fila.photo;
        return fila;
      }) as unknown as object,
      summary: { ...report.summary, ventana: report.ventana } as unknown as object,
      emailStatus: mail.status,
      emailTo: mail.to,
    },
  });

  return { report, run, mail, xlsx, fotos: bytesPorSku.size };
}

/** Última corrida guardada, para mostrar en la pantalla sin recalcular. */
export async function ultimaCorridaSemanal() {
  return prisma.reportRun.findFirst({
    where: { reportKey: SEMANAL_KEY },
    orderBy: { createdAt: "desc" },
  });
}
