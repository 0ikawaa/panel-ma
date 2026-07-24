import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { msQuery } from "@/lib/mundoshop";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function motivoDe(tags: string): { motivo: "fraude" | "no-pagada" | "otro"; label: string } {
  const t = tags.toLowerCase();
  if (t.includes("fraud")) return { motivo: "fraude", label: "Cancelada por fraude" };
  if (t.includes("not_paid")) return { motivo: "no-pagada", label: "No pagada (sin completar el pago)" };
  return { motivo: "otro", label: "Otro" };
}

// Banderas de los tags que aportan contexto a la cancelación.
const FLAG_LABELS: Record<string, string> = {
  not_paid: "no pagada",
  not_delivered: "no entregada",
  no_shipping: "sin envío",
  fraud_risk_detected: "riesgo de fraude",
};
function flagsDe(tags: string): string[] {
  let arr: string[] = [];
  try {
    arr = JSON.parse(tags);
  } catch {
    arr = [];
  }
  return arr.filter((t) => FLAG_LABELS[t]).map((t) => FLAG_LABELS[t]);
}

// GET /api/reportes/cancelaciones/detalle?desde=YYYY-MM-DD&hasta=YYYY-MM-DD[&format=xlsx]
export async function GET(req: Request) {
  const url = new URL(req.url);
  const desde = url.searchParams.get("desde") || "";
  const hasta = url.searchParams.get("hasta") || "";
  const format = url.searchParams.get("format");
  if (!DATE_RE.test(desde) || !DATE_RE.test(hasta)) {
    return NextResponse.json({ error: "Fechas inválidas (YYYY-MM-DD)" }, { status: 400 });
  }

  // Una fila por orden cancelada (agrupa ítems por si el pack trae varios).
  const sql = `
    SELECT o.id AS id, o.date_created AS fecha, o.total_amount AS monto, o.buyer_nickname AS comprador,
           o.tags AS tags, s.status AS ship_status, s.substatus AS ship_sub,
           MAX(oi.item_sku) AS sku, MAX(oi.item_title) AS titulo, SUM(oi.quantity) AS cantidad,
           MAX(oi.thumbnail) AS thumb
    FROM ml_orders o
    LEFT JOIN ml_order_items oi ON oi.order_id = o.id
    LEFT JOIN ml_shipments s ON s.id = o.shipping_id
    WHERE o.status = 'cancelled'
      AND substr(o.date_created,1,10) >= '${desde}' AND substr(o.date_created,1,10) <= '${hasta}'
    GROUP BY o.id
    ORDER BY o.date_created DESC
    LIMIT 1000`;

  let rows: Record<string, unknown>[];
  try {
    rows = await msQuery(sql, 45000);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || "No se pudo obtener el detalle." }, { status: 502 });
  }

  const items = rows.map((r) => {
    const tags = String(r.tags ?? "");
    const { motivo, label } = motivoDe(tags);
    const envio = r.ship_status ? String(r.ship_status) + (r.ship_sub ? ` (${r.ship_sub})` : "") : null;
    return {
      id: String(r.id),
      fecha: String(r.fecha ?? "").slice(0, 10),
      sku: r.sku ? String(r.sku) : null,
      titulo: r.titulo ? String(r.titulo) : null,
      cantidad: Number(r.cantidad) || 0,
      monto: r.monto == null ? null : Number(r.monto),
      comprador: r.comprador ? String(r.comprador) : null,
      motivo,
      motivoLabel: label,
      flags: flagsDe(tags),
      envio,
      thumb: r.thumb ? String(r.thumb) : null,
    };
  });

  if (format === "xlsx") {
    const header = ["Fecha", "SKU", "Producto", "Cant.", "Monto", "Comprador", "Motivo", "Envío", "Banderas"];
    const aoa = [
      [`Cancelaciones ${desde} a ${hasta}`],
      [`${items.length} órdenes canceladas`],
      [],
      header,
      ...items.map((i) => [i.fecha, i.sku ?? "", i.titulo ?? "", i.cantidad, i.monto ?? "", i.comprador ?? "", i.motivoLabel, i.envio ?? "", i.flags.join(", ")]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [{ wch: 12 }, { wch: 14 }, { wch: 46 }, { wch: 6 }, { wch: 10 }, { wch: 20 }, { wch: 28 }, { wch: 20 }, { wch: 26 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Detalle");
    const buf: Buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="cancelaciones_detalle_${desde}_${hasta}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  }

  return NextResponse.json({ desde, hasta, count: items.length, items });
}
