// Validación de la lectura de un Excel antes de guardarlo.
//
// La idea: nunca guardar un embarque mal leído. Si falta una columna crítica o
// la mayoría de los productos quedó sin precio/cantidad (síntoma de columnas mal
// mapeadas), se BLOQUEA el guardado y se explica por qué. Los problemas menores
// quedan como avisos (se puede guardar, pero se muestran).

import type { ParseResult, ParsedItem } from "./excel";

export interface ParseValidation {
  ok: boolean; // false si hay algo bloqueante
  blocking: string[]; // motivos que impiden guardar
  warnings: string[]; // avisos no bloqueantes
}

/** Muestra compacta de un ítem para la vista previa. */
export interface SampleRow {
  codigo: string | null;
  unidades: number | null;
  precioChina: number | null;
  cbmTotal: number | null;
  montoTotal: number | null;
}

export interface PreviewReport {
  totalItems: number;
  photosFound: number;
  containerTotal: number | null;
  columnsDetected: ParseResult["columnsDetected"];
  sample: SampleRow[];
  validation: ParseValidation;
}

export function validateParse(res: ParseResult): ParseValidation {
  const blocking: string[] = [];
  const warnings: string[] = [];
  const cols = res.columnsDetected;
  const n = res.items.length;

  // --- Bloqueantes: sin esto el embarque no sirve ---
  if (n === 0) {
    blocking.push("No se detectó ningún producto en el Excel.");
  }
  if (!cols.precioChina) {
    blocking.push("No se encontró la columna de precio unitario (FOB).");
  }
  if (!cols.unidades) {
    blocking.push("No se encontró la columna de cantidad (Quantity / QUATITY).");
  }
  if (!cols.montoTotal) {
    blocking.push("No se encontró la columna de importe (Amount).");
  }

  // --- Coherencia: columnas presentes pero mal leídas ---
  if (n > 0) {
    const pct = (x: number) => Math.round((x / n) * 100);
    const sinPrecio = res.items.filter((i: ParsedItem) => i.precioChina === null).length;
    const sinUnidades = res.items.filter((i: ParsedItem) => i.unidades === null).length;
    const sinMonto = res.items.filter((i: ParsedItem) => i.montoTotal === null).length;

    if (cols.precioChina && sinPrecio / n > 0.5) {
      blocking.push(
        `El ${pct(sinPrecio)}% de los productos quedó sin precio FOB: probablemente se leyó mal esa columna.`,
      );
    } else if (sinPrecio > 0) {
      warnings.push(`${sinPrecio} producto(s) sin precio FOB.`);
    }

    if (cols.unidades && sinUnidades / n > 0.5) {
      blocking.push(
        `El ${pct(sinUnidades)}% de los productos quedó sin cantidad: probablemente se leyó mal esa columna.`,
      );
    } else if (sinUnidades > 0) {
      warnings.push(`${sinUnidades} producto(s) sin cantidad.`);
    }

    if (sinMonto > 0) {
      warnings.push(`${sinMonto} producto(s) sin importe.`);
    }
  }

  // --- Avisos: se puede guardar, pero conviene revisar ---
  if (!cols.codigo) {
    warnings.push(
      "No se encontró la columna de código (MA CODE): los productos se identificarán por su descripción.",
    );
  }
  if (!cols.cbmTotal) {
    warnings.push("No se encontró la columna de CBM total: no se podrá calcular el costo de flete.");
  }
  if (!cols.foto) {
    warnings.push("No se encontró la columna de Foto.");
  } else if (n > 0 && res.photosFound === 0) {
    warnings.push("Se detectó la columna de Foto pero no se extrajo ninguna imagen.");
  }

  return { ok: blocking.length === 0, blocking, warnings };
}

/** Arma el informe de vista previa (lo que la UI muestra antes de confirmar). */
export function buildPreviewReport(res: ParseResult): PreviewReport {
  return {
    totalItems: res.totalItems,
    photosFound: res.photosFound,
    containerTotal: res.containerTotal,
    columnsDetected: res.columnsDetected,
    sample: res.items.slice(0, 6).map((i) => ({
      codigo: i.codigo,
      unidades: i.unidades,
      precioChina: i.precioChina,
      cbmTotal: i.cbmTotal,
      montoTotal: i.montoTotal,
    })),
    validation: validateParse(res),
  };
}
