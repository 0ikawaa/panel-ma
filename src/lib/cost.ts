// Cálculo del costo final (nacionalizado) por unidad de un producto.

/** CBM que entran en un contenedor (constante del negocio). */
export const CBM_POR_CONTENEDOR = 68;
/** Incidencia para nacionalizar en Uruguay (+33%). */
export const INCIDENCIA = 1.33;
/** IVA Uruguay (+22%). */
export const IVA = 1.22;

export interface LandedCost {
  fleteUnitario: number; // costo de flete por unidad
  base: number; // FOB + flete unitario
  nacionalizado: number; // base * incidencia
  final: number; // * IVA (costo final IVA inc.)
}

/**
 * Costo final por unidad:
 *   fleteUnit = (flete / 68) * cbmUnitario
 *   base      = fob + fleteUnit
 *   final     = base * 1.33 * 1.22
 * Devuelve null si falta algún dato necesario.
 */
export function landedCost(
  fob: number | null | undefined,
  cbmUnitario: number | null | undefined,
  freight: number | null | undefined,
): LandedCost | null {
  if (fob == null || cbmUnitario == null || freight == null) return null;
  const fleteUnitario = (freight / CBM_POR_CONTENEDOR) * cbmUnitario;
  const base = fob + fleteUnitario;
  const nacionalizado = base * INCIDENCIA;
  const final = nacionalizado * IVA;
  return { fleteUnitario, base, nacionalizado, final };
}
