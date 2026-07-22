import * as XLSX from "xlsx";

/* ------------------------------------------------------------------ */
/* Tipos                                                               */
/* ------------------------------------------------------------------ */

export interface VentaItem {
  codigo: string;
  titulo: string | null;
  unidades: number;
}

export interface StockItem {
  codigo: string;
  titulo: string | null;
  disponible: number | null;
}

export interface VentasResult {
  items: VentaItem[];
  periodo: string | null;
}

export interface StockResult {
  items: StockItem[];
  dispColumn: string | null;
}

/** Fila final de la tabla de reposición (ventas ⨝ stock). */
export interface ReposicionRow {
  codigo: string;
  titulo: string | null;
  vendidas: number;
  stock: number | null;
  sugerida: number;
}

/* ------------------------------------------------------------------ */
/* Utilidades                                                          */
/* ------------------------------------------------------------------ */

/** Código dentro del primer corchete: "[98253] LAMPARA" -> "98253". */
const CODE_RE = /\[([^\]]+)\]/;

const MESES_RE =
  /\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\b/i;

function parseNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return isFinite(v) ? v : null;
  let s = String(v).trim().replace(/[^0-9,.\-]/g, "");
  if (!s) return null;
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(",", ".");
  const n = parseFloat(s);
  return isFinite(n) ? n : null;
}

function readMatrix(buffer: Buffer | ArrayBuffer): unknown[][] {
  const buf: Buffer = Buffer.isBuffer(buffer) ? buffer : Buffer.from(new Uint8Array(buffer));
  const wb = XLSX.read(buf, { type: "buffer" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    blankrows: true,
    defval: null,
    raw: true,
  });
}

/** Separa "[cod] TÍTULO" en { codigo, titulo }. null si no hay corchete. */
function splitCodeTitle(raw: unknown): { codigo: string; titulo: string | null } | null {
  const s = String(raw ?? "").trim();
  const m = CODE_RE.exec(s);
  if (!m) return null;
  const codigo = m[1].trim();
  if (!codigo) return null;
  const titulo = s.slice(m.index + m[0].length).trim() || null;
  return { codigo, titulo };
}

/* ------------------------------------------------------------------ */
/* Ventas                                                              */
/* ------------------------------------------------------------------ */

/**
 * Parser del Excel de ventas (pivot "Análisis de facturas").
 * - El código va entre corchetes en la primera columna con texto.
 * - Las unidades vendidas son el valor de la columna Total (el numérico más a
 *   la derecha de la fila).
 * - Suma todas las ventas de un mismo código.
 */
export function parseVentas(buffer: Buffer | ArrayBuffer): VentasResult {
  const matrix = readMatrix(buffer);

  // Columna que contiene el "[código] título": la primera que trae corchetes.
  let labelCol = 0;
  let found = false;
  for (let r = 0; r < matrix.length && !found; r++) {
    const row = matrix[r] ?? [];
    for (let c = 0; c < row.length; c++) {
      if (CODE_RE.test(String(row[c] ?? ""))) {
        labelCol = c;
        found = true;
        break;
      }
    }
  }

  const acc = new Map<string, VentaItem>();
  let periodo: string | null = null;

  for (const row of matrix) {
    const r = row ?? [];
    const cell = r[labelCol];
    if (cell == null) continue;

    const parsed = splitCodeTitle(cell);
    if (!parsed) {
      // ¿Fila del período? (ej. "     mayo 2026", pero no "Total")
      const s = String(cell).trim();
      if (MESES_RE.test(s) && !/total/i.test(s)) periodo = s;
      continue;
    }

    // Unidades = último valor numérico de la fila (columna Total del pivot).
    let unidades: number | null = null;
    for (let c = r.length - 1; c > labelCol; c--) {
      const n = parseNumber(r[c]);
      if (n !== null) {
        unidades = n;
        break;
      }
    }

    const prev = acc.get(parsed.codigo);
    acc.set(parsed.codigo, {
      codigo: parsed.codigo,
      titulo: prev?.titulo ?? parsed.titulo,
      unidades: (prev?.unidades ?? 0) + (unidades ?? 0),
    });
  }

  return { items: [...acc.values()], periodo };
}

/* ------------------------------------------------------------------ */
/* Stock                                                               */
/* ------------------------------------------------------------------ */

/**
 * Parser del Excel de stock.
 * - Detecta la fila de encabezados por las columnas "Nombre…" y
 *   "…disponible para uso".
 * - Deja el código entre corchetes, el título y la cantidad disponible.
 */
export function parseStock(buffer: Buffer | ArrayBuffer): StockResult {
  const matrix = readMatrix(buffer);

  const norm = (v: unknown) => String(v ?? "").toLowerCase();

  // Buscar la fila de encabezados (primeras 10 filas) con "disponible".
  let headerRow = 0;
  let dispCol = -1;
  let nameCol = -1;
  const limit = Math.min(matrix.length, 10);
  for (let r = 0; r < limit; r++) {
    const row = matrix[r] ?? [];
    const dCol = row.findIndex((h) => norm(h).includes("disponible"));
    if (dCol >= 0) {
      headerRow = r;
      dispCol = dCol;
      nameCol = row.findIndex((h) => norm(h).includes("nombre"));
      break;
    }
  }

  // Sin encabezado claro: usar la primera columna con corchetes como nombre.
  if (nameCol < 0) {
    for (let r = 0; r < matrix.length && nameCol < 0; r++) {
      const row = matrix[r] ?? [];
      for (let c = 0; c < row.length; c++) {
        if (CODE_RE.test(String(row[c] ?? ""))) {
          nameCol = c;
          break;
        }
      }
    }
  }
  if (nameCol < 0) nameCol = 0;

  const dispColumn = dispCol >= 0 ? String(matrix[headerRow]?.[dispCol] ?? "") : null;

  const acc = new Map<string, StockItem>();
  for (let r = headerRow + 1; r < matrix.length; r++) {
    const row = matrix[r] ?? [];
    const parsed = splitCodeTitle(row[nameCol]);
    if (!parsed) continue;
    const disponible = dispCol >= 0 ? parseNumber(row[dispCol]) : null;
    // El mismo código puede repetirse (variantes): sumamos el disponible.
    const prev = acc.get(parsed.codigo);
    acc.set(parsed.codigo, {
      codigo: parsed.codigo,
      titulo: prev?.titulo ?? parsed.titulo,
      disponible:
        prev?.disponible != null || disponible != null
          ? (prev?.disponible ?? 0) + (disponible ?? 0)
          : null,
    });
  }

  return { items: [...acc.values()], dispColumn };
}

/* ------------------------------------------------------------------ */
/* Combinación                                                         */
/* ------------------------------------------------------------------ */

/**
 * Cruza ventas y stock por código y calcula la reposición sugerida:
 *   sugerida = max(0, round(vendidas * meses − stockDisponible))
 * La lista se basa en los códigos que tuvieron ventas.
 */
export function combinarReposicion(
  ventas: VentaItem[],
  stock: StockItem[],
  meses: number,
): ReposicionRow[] {
  const stockMap = new Map(stock.map((s) => [s.codigo, s]));
  return ventas.map((v) => {
    const s = stockMap.get(v.codigo);
    const disponible = s?.disponible ?? null;
    const sugerida = Math.max(0, Math.round(v.unidades * meses - (disponible ?? 0)));
    return {
      codigo: v.codigo,
      titulo: s?.titulo ?? v.titulo,
      vendidas: v.unidades,
      stock: disponible,
      sugerida,
    };
  });
}
