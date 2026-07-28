// Armado de CSV para los botones "Exportar" de las pantallas.

/**
 * Una celda de CSV, siempre entre comillas y con las comillas de adentro
 * duplicadas. Ir siempre entrecomillado evita el problema clásico: los títulos
 * de MercadoLibre traen comas y, sin comillas, una sola descripción corre todas
 * las columnas de esa fila.
 */
export function csvCell(v: string | number | null | undefined): string {
  return `"${String(v ?? "").replace(/"/g, '""')}"`;
}

/** Una fila de CSV a partir de sus celdas. */
export function csvRow(celdas: (string | number | null | undefined)[]): string {
  return celdas.map(csvCell).join(",");
}
