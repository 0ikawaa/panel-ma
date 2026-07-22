import JSZip from "jszip";
import * as XLSX from "xlsx";

/** Una línea original del Excel dentro de un ítem (un talle / variante). */
export interface DetalleLinea {
  codigos: string[]; // códigos de esa línea (ej. talles)
  unidades: number | null; // unidades totales de la línea (Quantity)
  monto: number | null; // precio de esa línea (Amount)
  cbmTotal: number | null;
  precioChina: number | null; // FOB unitario
  remark: string | null;
}

/** Un ítem: agrupa una o más líneas del Excel. */
export interface ParsedItem {
  rowIndex: number;
  photo: string | null;
  codigo: string; // código a mostrar (base cuando hay varios)
  precioChina: number | null;
  cantidadPorCaja: number | null;
  unidades: number | null; // Quantity total (suma)
  montoTotal: number | null; // Amount total (suma)
  unidad: string | null;
  cbmUnitario: number | null;
  cbmTotal: number | null; // suma
  remark: string | null;
  detalle: DetalleLinea[];
}

export interface ParseResult {
  items: ParsedItem[];
  photosFound: number;
  totalItems: number;
  containerTotal: number | null;
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
  s = s.replace(/[^0-9,.\-]/g, "");
  if (!s) return null;
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
      return null;
  }
}

function cellRefToRC(ref: string): { col: number; row: number } | null {
  const m = /^([A-Z]+)(\d+)$/.exec(ref);
  if (!m) return null;
  let col = 0;
  for (const ch of m[1]) col = col * 26 + (ch.charCodeAt(0) - 64);
  return { col: col - 1, row: parseInt(m[2], 10) - 1 };
}

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

/** Valores que en el Excel significan "sin código" (no identifican un producto).
 *  Se descartan para que productos distintos no se fusionen bajo un código falso. */
const PLACEHOLDER_CODES = new Set([
  "sin codigo", "sincodigo", "s codigo", "s/c", "sc",
  "na", "n/a", "nan", "null", "-", "--", "—", "x", "xx", "xxx", "?", "tbd",
]);

function isPlaceholderCode(code: string): boolean {
  return PLACEHOLDER_CODES.has(norm(code));
}

/** Divide un valor de código en sus partes (por "/" y salto de línea).
 *  Descarta placeholders como "SIN CODIGO", "NA" o "-". */
function splitCodes(raw: unknown): string[] {
  const first = String(raw ?? "").split("\n")[0].trim(); // ignora notas debajo del código
  if (!first || isPlaceholderCode(first)) return [];
  return first
    .split("/")
    .map((c) => c.trim())
    .filter(Boolean)
    .filter((c) => !isPlaceholderCode(c));
}

/** Código base: parte antes del primer guion. "48108-BEI-39" -> "48108". */
function baseCode(code: string): string {
  return code.split("-")[0].trim();
}

/* ------------------------------------------------------------------ */
/* Detección de columnas por encabezado                               */
/* ------------------------------------------------------------------ */

type Field =
  | "foto"
  | "codigo"
  | "descripcion"
  | "unit"
  | "precioChina"
  | "cantidadPorCaja"
  | "quantity"
  | "cbmUnitario"
  | "cbmTotal"
  | "amount"
  | "remark";

const FIELDS: Field[] = [
  "foto",
  "codigo",
  "descripcion",
  "unit",
  "precioChina",
  "cantidadPorCaja",
  "quantity",
  "cbmUnitario",
  "cbmTotal",
  "amount",
  "remark",
];

function scoreHeader(header: string, field: Field): number {
  const h = norm(header);
  if (!h) return 0;
  const has = (kw: string) => h.includes(kw);
  switch (field) {
    case "foto":
      if (has("foto") || has("imagen") || has("image") || has("photo") || has("picture") || has("pic")) return 3;
      return 0;
    case "codigo":
      // Preferir "MA CODE" sobre otras columnas con "code" (ej. "IHOME CODE").
      if (has("ma code") || has("macode")) return 5;
      if (has("codigo") || has("code") || has("cod ") || h === "cod" || has("sku") || has("item") || has("modelo") || has("model") || has("ref") || has("art")) return 3;
      return 0;
    case "descripcion":
      if (has("descrip") || has("detalle") || has("product name") || has("nombre del producto")) return 4;
      return 0;
    case "unit":
      if (h === "unit" || h === "unidad" || h === "uom" || has("u/m")) return 3;
      return 0;
    case "precioChina":
      if (has("fob")) return 4;
      if (has("precio") || has("price") || has("costo") || has("china") || h.includes("$")) return 3;
      return 0;
    case "cantidadPorCaja":
      if (has("caja") || has("carton") || has("ctn") || has("box")) return 4;
      if (has("pcs/") || has("/ctn") || has("qty/")) return 4;
      return 0;
    case "quantity":
      if (has("quatity") || has("quantity")) return 4; // "QUATITY" (typo en el Excel)
      if (has("cantidad total") || has("total qty") || has("unidades")) return 3;
      return 0;
    case "cbmUnitario":
      if (has("cbm")) {
        if (has("total") || has("tot")) return 0;
        if (has("unit") || has("unid") || has("u.")) return 4;
        return 2; // "cbm" a secas -> unitario
      }
      return 0;
    case "cbmTotal":
      if (has("cbm") && (has("total") || has("tot"))) return 4;
      if (has("volumen") || has("volume")) return 2;
      return 0;
    case "amount":
      if (has("amount") || has("importe") || has("monto")) return 4;
      return 0;
    case "remark":
      if (has("remark") || has("observ") || has("nota") || has("comentario")) return 4;
      return 0;
  }
}

function detectColumns(matrix: unknown[][]): {
  headerRow: number;
  map: Partial<Record<Field, number>>;
  headers: Partial<Record<Field, string>>;
} {
  let best = {
    headerRow: 0,
    score: -1,
    map: {} as Partial<Record<Field, number>>,
    headers: {} as Partial<Record<Field, string>>,
  };

  const limit = Math.min(matrix.length, 20);
  for (let r = 0; r < limit; r++) {
    const row = matrix[r] ?? [];
    const map: Partial<Record<Field, number>> = {};
    const headers: Partial<Record<Field, string>> = {};
    const usedCols = new Set<number>();
    let rowScore = 0;

    for (const field of FIELDS) {
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

async function extractImages(zip: JSZip): Promise<Map<number, string>> {
  const byRow = new Map<number, string>();
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

  /* Estrategia 1: imágenes ancladas (drawings estándar). Guardamos la fila
     "from" y, si existe, propagamos por el rango hasta "to" (celda combinada). */
  const drawingPaths = Object.keys(zip.files).filter((p) => /^xl\/drawings\/drawing\d+\.xml$/i.test(p));
  for (const drawingPath of drawingPaths) {
    const xml = await zip.file(drawingPath)!.async("string");
    const baseDir = drawingPath.substring(0, drawingPath.lastIndexOf("/"));
    const relsPath = `${baseDir}/_rels/${drawingPath.substring(drawingPath.lastIndexOf("/") + 1)}.rels`;
    const rels = await readRels(relsPath, baseDir);

    const anchorRe = /<xdr:(twoCellAnchor|oneCellAnchor)\b[\s\S]*?<\/xdr:\1>/g;
    let a: RegExpExecArray | null;
    while ((a = anchorRe.exec(xml))) {
      const block = a[0];
      const fromM = /<xdr:from>[\s\S]*?<xdr:row>(\d+)<\/xdr:row>/.exec(block);
      const toM = /<xdr:to>[\s\S]*?<xdr:row>(\d+)<\/xdr:row>/.exec(block);
      const embedM = /<a:blip[^>]*r:embed="([^"]+)"/.exec(block);
      if (!fromM || !embedM) continue;
      const fromRow = parseInt(fromM[1], 10);
      const toRow = toM ? parseInt(toM[1], 10) : fromRow;
      const mediaPath = rels.get(embedM[1]);
      if (!mediaPath) continue;
      const url = await mediaToDataUrl(mediaPath);
      if (!url) continue;
      for (let row = fromRow; row <= toRow; row++) {
        if (!byRow.has(row)) byRow.set(row, url);
      }
    }
  }

  /* Estrategia 2: imágenes en celda tipo WPS (DISPIMG + cellimages.xml) */
  const cellImagesFile = zip.file("xl/cellimages.xml");
  if (cellImagesFile) {
    const xml = await cellImagesFile.async("string");
    const rels = await readRels("xl/_rels/cellimages.xml.rels", "xl");
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

interface RawLine {
  r: number;
  codes: string[];
  unidades: number | null;
  monto: number | null;
  cbmTotal: number | null;
  cbmUnitario: number | null;
  precioChina: number | null;
  cantidadPorCaja: number | null;
  unidad: string | null;
  remark: string | null;
  descripcion: string | null;
  photo: string | null;
}

export async function parseExcel(buffer: Buffer | ArrayBuffer): Promise<ParseResult> {
  const buf: Buffer = Buffer.isBuffer(buffer) ? buffer : Buffer.from(new Uint8Array(buffer));

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

  const zip = await JSZip.loadAsync(buf);
  const imagesByRow = await extractImages(zip);

  // Rangos de celdas combinadas sobre la columna de la foto (para agrupar).
  const fotoCol = map.foto ?? 1;
  const merges = (sheet["!merges"] ?? []) as {
    s: { r: number; c: number };
    e: { r: number; c: number };
  }[];
  const mergeRanges = merges
    .filter((m) => m.s.c <= fotoCol && m.e.c >= fotoCol && m.e.r > m.s.r)
    .map((m) => [m.s.r, m.e.r] as [number, number]);
  const mergeGroupOf = (r: number): string | null => {
    for (const [s, e] of mergeRanges) if (r >= s && r <= e) return `m${s}`;
    return null;
  };

  const get = (row: unknown[], f: Field): unknown =>
    map[f] !== undefined ? row[map[f]!] : null;

  // 1) Leer líneas crudas y detectar el total del contenedor.
  const lines: RawLine[] = [];
  let containerTotal: number | null = null;

  // Etiquetas que marcan el cierre de la tabla (total, pago, depósito…).
  const isSummaryLabel = (s: string): boolean =>
    /(subtotal|total|deposit|balance|payment|deposito|saldo)/.test(s);

  for (let r = headerRow + 1; r < matrix.length; r++) {
    const row = matrix[r] ?? [];

    const qCell = get(row, "quantity");
    const codeCell = get(row, "codigo");
    const qLabel = typeof qCell === "string" ? norm(qCell) : "";
    const codeLabel = typeof codeCell === "string" ? norm(codeCell) : "";

    // Campos numéricos del producto.
    const precioChina = parseNumber(get(row, "precioChina"));
    const monto = parseNumber(get(row, "amount"));
    const unidades = parseInteger(get(row, "quantity"));
    const cbmTotal = parseNumber(get(row, "cbmTotal"));
    const cbmUnitario = parseNumber(get(row, "cbmUnitario"));
    const cantidadPorCaja = parseInteger(get(row, "cantidadPorCaja"));
    const codes = splitCodes(get(row, "codigo"));

    // Fila con etiqueta de cierre ("TOTAL", "Deposit", "Balance", "Payment"…):
    // fin de la tabla. Lo que sigue son totales, pagos, notas y datos bancarios.
    if (isSummaryLabel(qLabel) || isSummaryLabel(codeLabel)) {
      if (
        containerTotal === null &&
        monto !== null &&
        (qLabel.includes("total") || codeLabel.includes("total"))
      ) {
        containerTotal = monto;
      }
      break;
    }

    // Un producto real SIEMPRE tiene código propio o una cantidad numérica.
    // (Los "SIN CODIGO" quedan sin código pero conservan su cantidad.)
    const hasRealCode = codes.length > 0;
    const hasQty = unidades !== null;

    if (hasRealCode || hasQty) {
      lines.push({
        r,
        codes,
        unidades,
        monto,
        cbmTotal,
        cbmUnitario,
        precioChina,
        cantidadPorCaja,
        unidad: (() => {
          const u = get(row, "unit");
          return u === null || u === undefined || String(u).trim() === "" ? null : String(u).trim();
        })(),
        remark: (() => {
          const rm = get(row, "remark");
          return rm === null || rm === undefined || String(rm).trim() === "" ? null : String(rm).trim();
        })(),
        descripcion: (() => {
          const d = get(row, "descripcion");
          return d === null || d === undefined || String(d).trim() === "" ? null : String(d).trim();
        })(),
        photo: imagesByRow.get(r) ?? null,
      });
      continue;
    }

    // No es un producto. Si ya venían productos y esta fila trae importe o CBM,
    // es la zona de totales/depósitos SIN etiqueta (ej. una fila con solo el CBM
    // y el AMOUNT sumados): cerramos la tabla acá para no contarla como producto.
    if (lines.length > 0 && (monto !== null || cbmTotal !== null || cbmUnitario !== null)) {
      break;
    }
    // Si no, es una fila vacía o una nota suelta: la saltamos y seguimos.
  }

  // 2) Agrupar: por celda de foto combinada, o por código base.
  const groups = new Map<string, RawLine[]>();
  const order: string[] = [];
  for (const ln of lines) {
    const key =
      mergeGroupOf(ln.r) ??
      (ln.codes.length ? `c:${baseCode(ln.codes[0])}` : `r:${ln.r}`);
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }
    groups.get(key)!.push(ln);
  }

  // 3) Construir los ítems agregados.
  const items: ParsedItem[] = [];
  let photosFound = 0;

  for (let i = 0; i < order.length; i++) {
    const g = groups.get(order[i])!;
    const allCodes = g.flatMap((l) => l.codes);
    const bases = Array.from(new Set(allCodes.map(baseCode)));
    const distinct = Array.from(new Set(allCodes));

    const descripcion = g.find((l) => l.descripcion)?.descripcion ?? null;

    let codigo: string;
    if (bases.length === 0) {
      // Sin código propio: identificar por la primera línea de la descripción.
      codigo = descripcion ? descripcion.split("\n")[0].trim().slice(0, 40) : "—";
    } else if (bases.length === 1) {
      codigo = distinct.length > 1 ? bases[0] : distinct[0];
    } else {
      codigo = `${bases[0]} +${bases.length - 1}`;
    }

    const sum = (fn: (l: RawLine) => number | null): number | null => {
      let acc = 0;
      let any = false;
      for (const l of g) {
        const v = fn(l);
        if (v !== null) {
          acc += v;
          any = true;
        }
      }
      return any ? +acc.toFixed(6) : null;
    };

    const photo = g.find((l) => l.photo)?.photo ?? null;
    if (photo) photosFound += 1;

    const remarks = g.map((l) => l.remark).filter(Boolean) as string[];
    // Si no hay código, la descripción es la identidad del producto: mostrala completa.
    if (bases.length === 0 && descripcion) remarks.unshift(descripcion);

    items.push({
      rowIndex: i + 1,
      photo,
      codigo,
      precioChina: g.find((l) => l.precioChina !== null)?.precioChina ?? null,
      cantidadPorCaja: g[0].cantidadPorCaja,
      unidades: sum((l) => l.unidades),
      montoTotal: sum((l) => l.monto),
      unidad: g.find((l) => l.unidad)?.unidad ?? null,
      cbmUnitario: g[0].cbmUnitario,
      cbmTotal: sum((l) => l.cbmTotal),
      remark: remarks.length ? remarks.join("\n") : null,
      detalle: g.map((l) => ({
        codigos: l.codes,
        unidades: l.unidades,
        monto: l.monto,
        cbmTotal: l.cbmTotal,
        precioChina: l.precioChina,
        remark: l.remark,
      })),
    });
  }

  // Si no hubo una fila "TOTAL" explícita (estos proveedores no la ponen), el
  // precio del contenedor es la suma de los importes de la mercadería.
  if (containerTotal === null) {
    let s = 0;
    let any = false;
    for (const it of items) {
      if (it.montoTotal !== null) {
        s += it.montoTotal;
        any = true;
      }
    }
    containerTotal = any ? +s.toFixed(2) : null;
  }

  return {
    items,
    photosFound,
    totalItems: items.length,
    containerTotal,
    columnsDetected: {
      foto: headers.foto ?? null,
      codigo: headers.codigo ?? null,
      precioChina: headers.precioChina ?? null,
      unidades: headers.quantity ?? null,
      cbmTotal: headers.cbmTotal ?? null,
      montoTotal: headers.amount ?? null,
    },
  };
}
