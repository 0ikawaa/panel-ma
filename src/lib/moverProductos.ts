// Mover ítems de un embarque a otro.
//
// Antes esto se hacía borrando el ítem de un embarque y volviéndolo a cargar en
// el otro, con lo que se perdían la foto manual, el detalle por línea y el
// costo cargado. Mover conserva la fila: sólo cambia `containerId` y el orden.

/** IDs del body de una request: strings no vacíos, sin repetidos y en orden. */
export function sanitizarIds(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const vistos = new Set<string>();
  const ids: string[] = [];
  for (const x of v) {
    if (typeof x !== "string") continue;
    const id = x.trim();
    if (!id || vistos.has(id)) continue;
    vistos.add(id);
    ids.push(id);
  }
  return ids;
}

/**
 * Ordena los ítems como estaban en su embarque y les da el `rowIndex` que les
 * toca al final del destino.
 *
 * `rowIndex` es el orden de aparición en el Excel y es por lo que ordena la
 * tabla. Los ítems movidos van al final del embarque destino, uno atrás del
 * otro, respetando entre ellos el orden que traían: si en el origen iban
 * 3, 7 y 9, en el destino quedan pegados y en ese mismo orden.
 */
export function reindexarAlFinal<T extends { id: string; rowIndex: number }>(
  items: T[],
  ultimoDelDestino: number,
): { id: string; rowIndex: number }[] {
  return [...items]
    .sort((a, b) => a.rowIndex - b.rowIndex || a.id.localeCompare(b.id))
    .map((p, i) => ({ id: p.id, rowIndex: ultimoDelDestino + 1 + i }));
}
