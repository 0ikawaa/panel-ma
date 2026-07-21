import JSZip from "jszip";
import * as XLSX from "xlsx";

export interface ParsedRow {
  rowIndex: number;
  photo: string | null; // data URL (base64)
  codigo: string | null;
  precioChina: number | null;
  cantidadPorCaja: number | null;
  cbmUnitario: number | null;
  cbmTotal: number | null;
}

export interface ParseResult {
  rows: ParsedRow[];
  photosFound: number;
  totalRows: number;
  columnsDetected: Record<string, string | null>;
}

/* ------------------------------------------------------------------ */
/* Utilidades                                                          */
/* ------------------------------------------------------------------ */

const norm = (s: unknown): string =>
  String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // quita acentos
    .replace(/\s+/g, " ")
    .trim();

function parseNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return isFinite(v) ? v : null;
  let s = String(v).trim();
  if (!s) return null;
  // limpia símbolos de moneda y espacios
  s = s.replace(/[^0-9,.\-]/g, "");
  if (!s) return null;
  // Si tiene coma y punto: asume punto = miles, coma = decimal (formato ES)
  if (s.includes(",") && s.includes(".")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(",")) {
    s = s.replace(",", ".");
  }
  const n = parseFloat(s);
  return isFinite(n) ? n : null;
}

function parseInteger(v: unknown): number | null {
  const n = parseNumber(v);
  return n === null ? null : Math.round(n);
}

function extToMime(path: string): string | null {
  const ext = path.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "bmp":
      return "image/bmp";
    case "webp":
      return "image/webp";
    default:
      return null; // emf/wmf u otros no soportados en <img>
  }
}

/** Convierte "B2" -> { col: 1, row: 1 } (ambos 0-based). */
function cellRefToRC(ref: string): { col: number; row: number } | null {
  const m = /^([A-Z]+)(\d+)$/.exec(ref);
  if (!m) return null;
  let col = 0;
  for (const ch of m[1]) col = col * 26 + (ch.charCodeAt(0) - 64);
  return { col: col - 1, row: parseInt(m[2], 10) - 1 };
}

/** Resuelve una ruta relativa de un .rels respecto a la carpeta base. */
function resolveZipPath(baseDir: string, target: string): string {
  const parts = (baseDir + "/" + target).split("/");
  const stack: string[] = [];
  for (const p of parts) {
    if (p === "" || p === ".") continue;
    if (p === "..") stack.pop();
    else stack.push(p);
  }
  return stack.join("/");
}

/* ------------------------------------------------------------------ */
/* Detección de columnas por encabezado                               */
/* ------------------------------------------------------------------ */

type Field =
  | "foto"
  | "codigo"
  | "precioChina"
  | "cantidadPorCaja"
  | "cbmUnitario"
  | "cbmTotal";

/** Puntúa qué tan bien un encabezado corresponde a un campo. */
function scoreHeader(header: string, field: Field): number {
  const h = norm(header);
  if (!h) return 0;
  const has = (kw: string) => h.includes(kw);
  switch (field) {
    case "foto":
      if (has("foto") || has("imagen") || has("image") || has("photo") || has("picture") || has("pic")) return 3;
      return 0;
    case "codigo":
      // Preferir la columna "MA CODE" por sobre otras columnas de código
      // (p. ej. "IHOME CODE") cuando el Excel trae ambas.
      if (has("ma code") || has("macode")) return 5;
      if (has("codigo") || has("code") || has("cod ") || h === "cod" || has("sku") || has("item") || has("modelo") || has("model") || has("ref") || has("art")) return 3;
      return 0;
    case "precioChina":
      if (has("precio") || has("price") || has("fob") || has("costo") || has("usd") || has("china") || h.includes("$")) {
        return has("china") ? 4 : 3;
      }
      return 0;
    case "cantidadPorCaja":
      if (has("caja") || has("carton") || has("ctn") || has("box")) return 4;
      if (has("cantidad") || has("cant") || has("pcs") || has("qty") || has("unid")) return 3;
      return 0;
    case "cbmUnitario":
      if (has("cbm")) {
        if (has("unit") || has("unid") || has("u.") || h.endsWith(" u") || has("x unidad") || has("por unidad")) return 4;
        if (has("total") || has("tot")) return 0;
        return 2; // "cbm" a secas -> probablemente unitario
      }
      return 0;
    case "cbmTotal":
      if (has("cbm") && (has("total") || has("tot"))) return 4;
      if (has("volumen") || has("volume")) return 2;
      return 0;
  }
}

/** Dada la matriz de filas, encuentra la fila de encabezado y el mapa columna->campo. */
function detectColumns(matrix: unknown[][]): {
  headerRow: number;
  map: Partial<Record<Field, number>>;
  headers: Partial<Record<Field, string>>;
} {
  const fields: Field[] = ["foto", "codigo", "precioChina", "cantidadPorCaja", "cbmUnitario", "cbmTotal"];
  let best = { headerRow: 0, score: -1, map: {} as Partial<Record<Field, number>>, headers: {} as Partial<Record<Field, string>> };

  const limit = Math.min(matrix.length, 15); // el encabezado suele estar arriba
  for (let r = 0; r < limit; r++) {
    const row = matrix[r] ?? [];
    const map: Partial<Record<Field, number>> = {};
    const headers: Partial<Record<Field, string>> = {};
    const usedCols = new Set<number>();
    let rowScore = 0;

    for (const field of fields) {
      let bestCol = -1;
      let bestColScore = 0;
      for (let c = 0; c < row.length; c++) {
        if (usedCols.has(c)) continue;
        const sc = scoreHeader(String(row[c] ?? ""), field);
        if (sc > bestColScore) {
          bestColScore = sc;
          bestCol = c;
        }
      }
      if (bestCol >= 0 && bestColScore > 0) {
        map[field] = bestCol;
        headers[field] = String(row[bestCol] ?? "");
        usedCols.add(bestCol);
        rowScore += bestColScore;
      }
    }

    if (rowScore > best.score) {
      best = { headerRow: r, score: rowScore, map, headers };
    }
  }
  return { headerRow: best.headerRow, map: best.map, headers: best.headers };
}

/* ------------------------------------------------------------------ */
/* Extracción de imágenes                                             */
/* ------------------------------------------------------------------ */

/** Devuelve un map: fila (0-based del sheet) -> data URL de la imagen. */
async function extractImages(zip: JSZip): Promise<Map<number, string>> {
  const byRow = new Map<number, string>();

  // Cache de medios en data URL
  const mediaCache = new Map<string, string | null>();
  async function mediaToDataUrl(path: string): Promise<string | null> {
    if (mediaCache.has(path)) return mediaCache.get(path) ?? null;
    const file = zip.file(path);
    if (!file) {
      mediaCache.set(path, null);
      return null;
    }
    const mime = extToMime(path);
    if (!mime) {
      mediaCache.set(path, null);
      return null;
    }
    const b64 = await file.async("base64");
    const url = `data:${mime};base64,${b64}`;
    mediaCache.set(path, url);
    return url;
  }

  // Lee un .rels y devuelve map rId -> ruta absoluta en el zip
  async function readRels(relsPath: string, baseDir: string): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    const file = zip.file(relsPath);
    if (!file) return map;
    const xml = await file.async("string");
    const re = /<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"[^>]*\/?>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(xml))) {
      const id = m[1];
      const target = m[2];
      if (/^https?:/i.test(target)) continue;
      map.set(id, resolveZipPath(baseDir, target));
    }
    return map;
  }

  /* --- Estrategia 1: imágenes ancladas (drawings estándar) --- */
  const drawingPaths = Object.keys(zip.files).filter((p) => /^xl\/drawings\/drawing\d+\.xml$/i.test(p));
  for (const drawingPath of drawingPaths) {
    const xml = await zip.file(drawingPath)!.async("string");
    const baseDir = drawingPath.substring(0, drawingPath.lastIndexOf("/"));
    const relsPath = `${baseDir}/_rels/${drawingPath.substring(drawingPath.lastIndexOf("/") + 1)}.rels`;
    const rels = await readRels(relsPath, baseDir);

    // Cada anchor: capturamos la fila "from" y el r:embed de la imagen
    const anchorRe = /<xdr:(twoCellAnchor|oneCellAnchor)\b[\s\S]*?<\/xdr:\1>/g;
    let a: RegExpExecArray | null;
    while ((a = anchorRe.exec(xml))) {
      const block = a[0];
      const rowM = /<xdr:from>[\s\S]*?<xdr:row>(\d+)<\/xdr:row>/.exec(block);
      const embedM = /<a:blip[^>]*r:embed="([^"]+)"/.exec(block);
      if (!rowM || !embedM) continue;
      const row = parseInt(rowM[1], 10); // ya es 0-based
      const mediaPath = rels.get(embedM[1]);
      if (!mediaPath) continue;
      const url = await mediaToDataUrl(mediaPath);
      if (url && !byRow.has(row)) byRow.set(row, url);
    }
  }

  /* --- Estrategia 2: imágenes en celda tipo WPS (DISPIMG + cellimages.xml) --- */
  const cellImagesFile = zip.file("xl/cellimages.xml");
  if (cellImagesFile) {
    const xml = await cellImagesFile.async("string");
    const rels = await readRels("xl/_rels/cellimages.xml.rels", "xl");

    // nombre (ID_xxx) -> ruta de media
    const idToMedia = new Map<string, string>();
    const picRe = /<xdr:pic>[\s\S]*?<\/xdr:pic>/g;
    let p: RegExpExecArray | null;
    while ((p = picRe.exec(xml))) {
      const block = p[0];
      const nameM = /<xdr:cNvPr[^>]*name="([^"]+)"/.exec(block);
      const embedM = /<a:blip[^>]*r:embed="([^"]+)"/.exec(block);
      if (!nameM || !embedM) continue;
      const mediaPath = rels.get(embedM[1]);
      if (mediaPath) idToMedia.set(nameM[1], mediaPath);
    }

    // Busca en la primera hoja las celdas con DISPIMG("ID_xxx")
    const sheetPath =
      Object.keys(zip.files).find((p) => /^xl\/worksheets\/sheet1\.xml$/i.test(p)) ??
      Object.keys(zip.files).find((p) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(p));
    if (sheetPath) {
      const sheetXml = await zip.file(sheetPath)!.async("string");
      const cellRe = /<c\b[^>]*r="([A-Z]+\d+)"[^>]*>([\s\S]*?)<\/c>/g;
      let c: RegExpExecArray | null;
      while ((c = cellRe.exec(sheetXml))) {
        const ref = c[1];
        const inner = c[2];
        const dispM = /DISPIMG\(\s*&quot;([^&]+)&quot;|DISPIMG\(\s*"([^"]+)"/.exec(inner);
        if (!dispM) continue;
        const id = dispM[1] ?? dispM[2];
        const mediaPath = idToMedia.get(id);
        if (!mediaPath) continue;
        const rc = cellRefToRC(ref);
        if (!rc) continue;
        const url = await mediaToDataUrl(mediaPath);
        if (url && !byRow.has(rc.row)) byRow.set(rc.row, url);
      }
    }
  }

  return byRow;
}

/* ------------------------------------------------------------------ */
/* Función principal                                                  */
/* ------------------------------------------------------------------ */

export async function parseExcel(buffer: Buffer | ArrayBuffer): Promise<ParseResult> {
  const buf: Buffer = Buffer.isBuffer(buffer)
    ? buffer
    : Buffer.from(new Uint8Array(buffer));

  // 1) Datos de las celdas con SheetJS
  const wb = XLSX.read(buf, { type: "buffer" });
  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    blankrows: true,
    defval: null,
    raw: true,
  });

  const { headerRow, map, headers } = detectColumns(matrix);

  // 2) Imágenes incrustadas
  const zip = await JSZip.loadAsync(buf);
  const imagesByRow = await extractImages(zip);

  // 3) Construir filas
  const rows: ParsedRow[] = [];
  let photosFound = 0;
  let order = 0;

  for (let r = headerRow + 1; r < matrix.length; r++) {
    const row = matrix[r] ?? [];
    const get = (f: Field): unknown =>
      map[f] !== undefined ? row[map[f]!] : null;

    const codigo = map.codigo !== undefined ? row[map.codigo] : null;
    const precioChina = parseNumber(get("precioChina"));
    const cantidadPorCaja = parseInteger(get("cantidadPorCaja"));
    let cbmUnitario = parseNumber(get("cbmUnitario"));
    let cbmTotal = parseNumber(get("cbmTotal"));
    const photo = imagesByRow.get(r) ?? null;

    // Si falta uno de los CBM pero tenemos el otro y la cantidad, lo calculamos
    if (cbmTotal === null && cbmUnitario !== null && cantidadPorCaja !== null) {
      cbmTotal = +(cbmUnitario * cantidadPorCaja).toFixed(6);
    } else if (cbmUnitario === null && cbmTotal !== null && cantidadPorCaja) {
      cbmUnitario = +(cbmTotal / cantidadPorCaja).toFixed(6);
    }

    const codigoStr =
      codigo === null || codigo === undefined || String(codigo).trim() === ""
        ? null
        : String(codigo).trim();

    // Una fila es un producto real solo si tiene código, precio, cantidad o
    // CBM unitario. Así descartamos la fila de "TOTAL" (que trae únicamente el
    // CBM total y duplicaría la suma) y las imágenes sueltas (solo foto).
    const hasProductData =
      codigoStr !== null ||
      precioChina !== null ||
      cantidadPorCaja !== null ||
      cbmUnitario !== null;
    if (!hasProductData) continue;

    order += 1;
    if (photo) photosFound += 1;

    rows.push({
      rowIndex: order,
      photo,
      codigo: codigoStr,
      precioChina,
      cantidadPorCaja,
      cbmUnitario,
      cbmTotal,
    });
  }

  return {
    rows,
    photosFound,
    totalRows: rows.length,
    columnsDetected: {
      foto: headers.foto ?? null,
      codigo: headers.codigo ?? null,
      precioChina: headers.precioChina ?? null,
      cantidadPorCaja: headers.cantidadPorCaja ?? null,
      cbmUnitario: headers.cbmUnitario ?? null,
      cbmTotal: headers.cbmTotal ?? null,
    },
  };
}
