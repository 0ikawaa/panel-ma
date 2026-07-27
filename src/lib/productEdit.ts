// Recálculo de los agregados de un producto cuando se edita su detalle.
//
// Un ítem puede agrupar varias líneas (talles, variantes, códigos hermanos) y
// cada línea tiene su propio precio de origen. Por eso el precio del lote NO se
// puede sacar como `unidades × precioChina` del ítem: ese precio es sólo
// representativo (el de la primera línea que lo tenga). Contra la base real,
// multiplicar a nivel ítem falla en 7 de 157 productos —uno se iría a cero por
// tener el precio en 0—, mientras que sumar línea por línea da exacto en los
// 157. De ahí que todo el cálculo viva acá y sea por línea.

export interface LineaEditable {
  codigos: string[];
  unidades: number | null;
  precioChina: number | null;
  cbmTotal: number | null;
  remark: string | null;
}

export interface LineaCalculada extends LineaEditable {
  /** Precio del lote de la línea. Derivado: nunca se carga a mano. */
  monto: number | null;
}

export interface AgregadosProducto {
  unidades: number | null;
  montoTotal: number | null;
  cbmTotal: number | null;
  /** Precio unitario representativo del ítem: el de la primera línea que tenga. */
  precioChina: number | null;
}

function redondear(n: number, decimales: number): number {
  return +n.toFixed(decimales);
}

function esNumero(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** Número del body de una request, o null si viene vacío o no es numérico. */
export function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return isFinite(n) ? n : null;
}

/** Igual que `numOrNull` pero redondeado: las unidades son enteras. */
export function intOrNull(v: unknown): number | null {
  const n = numOrNull(v);
  return n === null ? null : Math.round(n);
}

/** Texto del body sin espacios sobrantes; "" cuenta como "sin dato". */
export function strOrNull(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

/**
 * Normaliza el detalle que manda la pantalla. Nunca se confía en el monto que
 * venga del cliente: se recalcula acá con `calcularLineas`.
 */
export function sanitizeDetalle(input: unknown): LineaEditable[] {
  if (!Array.isArray(input)) return [];
  return input.map((l) => {
    const line = (l ?? {}) as Record<string, unknown>;
    return {
      codigos: Array.isArray(line.codigos)
        ? line.codigos.map((c) => String(c).trim()).filter(Boolean)
        : [],
      unidades: intOrNull(line.unidades),
      precioChina: numOrNull(line.precioChina),
      cbmTotal: numOrNull(line.cbmTotal),
      remark: strOrNull(line.remark),
    };
  });
}

/**
 * Precio del lote de una línea = unidades × precio unitario.
 * null si falta cualquiera de los dos (no asumimos 0: "sin dato" y "vale cero"
 * son cosas distintas y el ítem 20112 de la base tiene el precio en 0).
 *
 * Se redondea a 6 decimales, no a 2: sólo para matar el ruido del punto
 * flotante. Redondear cada línea a centavos y recién después sumar corría el
 * total de dos productos reales de la base (48101 y 48400, que se sumaron con
 * precisión completa y tienen montos con 3 decimales). El redondeo a centavos
 * va una sola vez, sobre el total del ítem.
 */
export function montoLinea(
  unidades: number | null | undefined,
  precioChina: number | null | undefined,
): number | null {
  if (!esNumero(unidades) || !esNumero(precioChina)) return null;
  return redondear(unidades * precioChina, 6);
}

/**
 * Completa cada línea con sus derivados: el monto y, si se conoce el CBM por
 * unidad del producto, también el CBM de la línea.
 *
 * El CBM se deriva en vez de arrastrarse del Excel porque los valores
 * importados no cierran: el Contenedor 22 figuraba con 118,394 CBM cuando en un
 * contenedor entran 68 (CBM_POR_CONTENEDOR). Ese número salía de sumar líneas
 * contadas dos veces en los ítems agrupados; derivándolo da 67,684.
 *
 * Si no hay CBM por unidad no se puede calcular, y entonces se respeta el valor
 * que ya tenía la línea en lugar de borrarlo.
 */
export function calcularLineas(
  lineas: LineaEditable[],
  cbmPorUnidad?: number | null,
): LineaCalculada[] {
  return lineas.map((l) => ({
    ...l,
    monto: montoLinea(l.unidades, l.precioChina),
    cbmTotal:
      esNumero(cbmPorUnidad) && esNumero(l.unidades)
        ? redondear(cbmPorUnidad * l.unidades, 6)
        : l.cbmTotal,
  }));
}

/** Suma un campo de las líneas; null si ninguna lo tiene cargado. */
function sumar(
  lineas: LineaCalculada[],
  key: "unidades" | "monto" | "cbmTotal",
  decimales: number,
): number | null {
  let acc = 0;
  let alguna = false;
  for (const l of lineas) {
    const v = l[key];
    if (esNumero(v)) {
      acc += v;
      alguna = true;
    }
  }
  return alguna ? redondear(acc, decimales) : null;
}

/** Agregados del ítem a partir de sus líneas ya calculadas. */
export function agregarLineas(lineas: LineaCalculada[]): AgregadosProducto {
  const conPrecio = lineas.find((l) => esNumero(l.precioChina));
  return {
    unidades: sumar(lineas, "unidades", 0),
    montoTotal: sumar(lineas, "monto", 2),
    cbmTotal: sumar(lineas, "cbmTotal", 6),
    precioChina: conPrecio ? conPrecio.precioChina : null,
  };
}

/**
 * Inverso de `cbmPorUnidad` (lib/cost.ts): la pantalla edita el CBM por unidad
 * —que es lo que se ve en la tabla y lo que entra al costo final—, pero la base
 * guarda el CBM por caja. Si el producto no tiene unidades por caja cargadas se
 * asume 1, así el valor tecleado se conserva tal cual en vez de perderse.
 */
export function cbmCajaDesdeUnidad(
  cbmPorUnidad: number | null | undefined,
  unidadesPorCaja: number | null | undefined,
): { cbmUnitario: number | null; cantidadPorCaja: number | null } {
  if (!esNumero(cbmPorUnidad)) return { cbmUnitario: null, cantidadPorCaja: unidadesPorCaja ?? null };
  const porCaja = esNumero(unidadesPorCaja) && unidadesPorCaja !== 0 ? unidadesPorCaja : 1;
  return { cbmUnitario: redondear(cbmPorUnidad * porCaja, 6), cantidadPorCaja: porCaja };
}
