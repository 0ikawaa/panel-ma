// Compute del reporte "Calidad de las publicaciones".
// Trae las publicaciones ACTIVAS en vivo con su detalle enriquecido (MUNDO SHOP
// /ml-item/:id) y las evalúa con la lógica pura de `calidad.ts`.

import { msListActiveDetailed } from "@/lib/mundoshop";
import { evaluarCalidad, type CalidadReport } from "@/lib/calidad";

export async function computeCalidad(now: Date = new Date()): Promise<CalidadReport> {
  const { items, fallidos } = await msListActiveDetailed({ timeoutMs: 20000, concurrency: 24 });
  return evaluarCalidad(items, now.toISOString(), fallidos);
}
