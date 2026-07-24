// Compute del reporte "Calidad de las publicaciones".
// Trae las publicaciones ACTIVAS en vivo (MUNDO SHOP /ml-items) y las evalúa con
// la lógica pura de `calidad.ts`.

import { msListAllItems } from "@/lib/mundoshop";
import { evaluarCalidad, type CalidadReport } from "@/lib/calidad";

export async function computeCalidad(now: Date = new Date()): Promise<CalidadReport> {
  const { items } = await msListAllItems("active", { timeoutMs: 30000 });
  return evaluarCalidad(items, now.toISOString());
}
