// Compute del reporte "Cancelaciones de ML" (consulta MUNDO SHOP).
// La lógica pura (períodos, comparación) está en `cancelaciones.ts`.

import { msQuery } from "@/lib/mundoshop";
import {
  CANCELACIONES_KEY,
  buildPeriodos,
  bucketByPeriodo,
  buildComparacion,
  totalizar,
  type Granularidad,
  type DailyRow,
  type CancelacionesReport,
} from "@/lib/cancelaciones";

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function computeCancelaciones(
  granularidad: Granularidad,
  n: number,
  now: Date = new Date(),
): Promise<CancelacionesReport> {
  const periodos = buildPeriodos(granularidad, now, n);
  const minDesde = periodos[0].desde;
  const maxHasta = periodos[periodos.length - 1].hasta;

  // Conteos diarios de órdenes ML: total, canceladas, y motivos por tags.
  // Fraude = tag fraud_risk_detected; No pagada = not_paid sin fraude.
  const sql = `
    SELECT substr(date_created,1,10) AS dia,
      COUNT(*) AS total,
      SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS canceladas,
      SUM(CASE WHEN status = 'cancelled' AND lower(tags) LIKE '%fraud%' THEN 1 ELSE 0 END) AS fraude,
      SUM(CASE WHEN status = 'cancelled' AND lower(tags) NOT LIKE '%fraud%' AND lower(tags) LIKE '%not_paid%' THEN 1 ELSE 0 END) AS no_pagada
    FROM ml_orders
    WHERE substr(date_created,1,10) >= '${minDesde}' AND substr(date_created,1,10) <= '${maxHasta}'
    GROUP BY dia`;

  const rows = await msQuery(sql, 45000);
  const daily: DailyRow[] = rows.map((r) => ({
    dia: String(r.dia),
    total: num(r.total),
    canceladas: num(r.canceladas),
    noPagada: num(r.no_pagada),
    fraude: num(r.fraude),
  }));

  const series = bucketByPeriodo(daily, periodos);
  return {
    key: CANCELACIONES_KEY,
    generadoEn: now.toISOString(),
    granularidad,
    series,
    comparacion: buildComparacion(series),
    totales: totalizar(series),
  };
}
