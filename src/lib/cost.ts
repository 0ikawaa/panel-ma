// Cálculo del costo final (nacionalizado) por unidad de un producto.

/** CBM que entran en un contenedor (constante del negocio). */
export const CBM_POR_CONTENEDOR = 68;
/** Incidencia para nacionalizar desde China en Uruguay (+33%). */
export const INCIDENCIA_CHINA = 1.33;
/** Incidencia para nacionalizar desde Brasil en Uruguay (+15%). */
export const INCIDENCIA_BRASIL = 1.15;
/** IVA Uruguay (+22%). */
export const IVA = 1.22;

export type Origin = "china" | "brasil";

/**
 * CBM por unidad = CBM de la columna del Excel (por caja) / unidades por caja (QTY/CTN).
 * Devuelve null si falta el CBM o la cantidad por caja (o es 0).
 */
export function cbmPorUnidad(
  cbmCaja: number | null | undefined,
  unidadesPorCaja: number | null | undefined,
): number | null {
  if (cbmCaja == null || unidadesPorCaja == null || unidadesPorCaja === 0) return null;
  return cbmCaja / unidadesPorCaja;
}

export interface LandedCost {
  origin: Origin;
  fob: number; // precio origen unitario
  fleteUnitario: number; // 0 en Brasil
  base: number; // fob + flete (China) o fob (Brasil)
  incidencia: number; // 1.33 (China) o 1.15 (Brasil)
  nacionalizado: number; // base * incidencia
  final: number; // * IVA (costo final IVA inc.)
}

/**
 * Costo final por unidad.
 *
 * China:  ((flete / 68) * cbmUnitario + FOB) * 1.33 * 1.22
 * Brasil: precioOrigen * 1.15 * 1.22
 *
 * Devuelve null si falta algún dato necesario.
 */
export function landedCost(
  origin: Origin,
  fob: number | null | undefined,
  cbmUnitario: number | null | undefined,
  freight: number | null | undefined,
): LandedCost | null {
  if (fob == null) return null;

  if (origin === "brasil") {
    const base = fob;
    const nacionalizado = base * INCIDENCIA_BRASIL;
    const final = nacionalizado * IVA;
    return {
      origin,
      fob,
      fleteUnitario: 0,
      base,
      incidencia: INCIDENCIA_BRASIL,
      nacionalizado,
      final,
    };
  }

  // China
  if (cbmUnitario == null || freight == null) return null;
  const fleteUnitario = (freight / CBM_POR_CONTENEDOR) * cbmUnitario;
  const base = fob + fleteUnitario;
  const nacionalizado = base * INCIDENCIA_CHINA;
  const final = nacionalizado * IVA;
  return {
    origin,
    fob,
    fleteUnitario,
    base,
    incidencia: INCIDENCIA_CHINA,
    nacionalizado,
    final,
  };
}
