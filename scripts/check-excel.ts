// Diagnóstico del parser de Excel contra archivos reales.
//
// Uso:
//   node scripts/check-excel.ts [carpeta]
//
// Sin argumento usa ./fixtures. Corre el MISMO parser que la app (lib/excel.ts)
// sobre cada .xlsx y muestra, por archivo: columnas detectadas, total del
// contenedor, cantidad de ítems, fotos encontradas y las primeras filas, para
// verificar a ojo que leyó bien. Marca en rojo lo que parezca sospechoso.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
import { parseExcel } from "../src/lib/excel.ts";

const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

const folder = process.argv[2] ?? "./fixtures";

if (!existsSync(folder)) {
  console.error(`${RED}No existe la carpeta "${folder}".${RESET}`);
  console.error(`Creá la carpeta y poné adentro los .xlsx a revisar, o pasá una ruta:`);
  console.error(`  node scripts/check-excel.ts "C:/ruta/a/tus/excels"`);
  process.exit(1);
}

const files = readdirSync(folder)
  .filter((f) => [".xlsx", ".xlsm", ".xls"].includes(extname(f).toLowerCase()))
  .sort();

if (files.length === 0) {
  console.error(`${YELLOW}No hay archivos Excel en "${folder}".${RESET}`);
  process.exit(1);
}

const N = Number(process.env.ROWS ?? 8); // filas a mostrar por archivo

function pad(v: unknown, w: number): string {
  const s = v === null || v === undefined ? "—" : String(v);
  return s.length > w ? s.slice(0, w - 1) + "…" : s.padEnd(w);
}
function num(v: number | null): string {
  return v === null ? "—" : v.toLocaleString("es-UY");
}

const CRIT: { key: string; label: string }[] = [
  { key: "codigo", label: "Código" },
  { key: "precioChina", label: "Precio (FOB)" },
  { key: "unidades", label: "Unidades" },
  { key: "cbmTotal", label: "CBM" },
  { key: "montoTotal", label: "Monto" },
];

for (const file of files) {
  const buf = readFileSync(join(folder, file));
  console.log("\n" + "═".repeat(78));
  console.log(`${BOLD}${CYAN}📄 ${file}${RESET}`);
  console.log("═".repeat(78));

  let res;
  try {
    res = await parseExcel(buf);
  } catch (e) {
    console.log(`${RED}✗ El parser tiró un error: ${(e as Error).message}${RESET}`);
    continue;
  }

  // Columnas detectadas
  console.log(`\n${BOLD}Columnas detectadas:${RESET}`);
  for (const { key, label } of CRIT) {
    const header = res.columnsDetected[key];
    const ok = header != null;
    const mark = ok ? `${GREEN}✓${RESET}` : `${RED}✗ NO DETECTADA${RESET}`;
    console.log(`  ${mark}  ${pad(label, 14)} ${ok ? DIM + '← "' + header + '"' + RESET : ""}`);
  }
  const fotoH = res.columnsDetected.foto;
  console.log(`  ${fotoH ? GREEN + "✓" : YELLOW + "○"}${RESET}  ${pad("Foto", 14)} ${fotoH ? DIM + '← "' + fotoH + '"' + RESET : DIM + "(sin columna de foto)" + RESET}`);

  // Resumen
  console.log(`\n${BOLD}Resumen:${RESET}`);
  console.log(`  Ítems:            ${BOLD}${res.totalItems}${RESET}`);
  console.log(`  Fotos:            ${res.photosFound}${res.photosFound === 0 ? YELLOW + "  ⚠ ninguna foto extraída" + RESET : ""}`);
  console.log(`  Total contenedor: ${res.containerTotal === null ? YELLOW + "— (no se detectó fila TOTAL)" + RESET : "US$ " + num(res.containerTotal)}`);

  // Chequeo de coherencia: suma de montos vs total declarado
  const sumMonto = res.items.reduce((a, it) => a + (it.montoTotal ?? 0), 0);
  if (res.containerTotal !== null && sumMonto > 0) {
    const diff = Math.abs(sumMonto - res.containerTotal);
    const pct = (diff / res.containerTotal) * 100;
    const c = pct < 1 ? GREEN : pct < 5 ? YELLOW : RED;
    console.log(`  Suma de montos:   US$ ${num(+sumMonto.toFixed(2))}  ${c}(dif. ${pct.toFixed(1)}% vs total)${RESET}`);
  }

  // Filas
  console.log(`\n${BOLD}Primeras ${Math.min(N, res.items.length)} filas:${RESET}`);
  console.log(
    DIM +
      "  " + pad("#", 4) + pad("Código", 18) + pad("Unid.", 9) +
      pad("FOB", 10) + pad("CBM u.", 9) + pad("CBM tot", 10) +
      pad("Monto", 11) + "det" + RESET,
  );
  for (const it of res.items.slice(0, N)) {
    const warn = !it.codigo || it.codigo === "—" || it.unidades === null;
    const line =
      "  " + pad(it.rowIndex, 4) + pad(it.codigo, 18) + pad(num(it.unidades), 9) +
      pad(num(it.precioChina), 10) + pad(num(it.cbmUnitario), 9) +
      pad(num(it.cbmTotal), 10) + pad(num(it.montoTotal), 11) +
      String(it.detalle.length);
    console.log((warn ? YELLOW : "") + line + (warn ? RESET : ""));
  }
  if (res.items.length > N) {
    console.log(DIM + `  … y ${res.items.length - N} ítems más` + RESET);
  }

  // Avisos
  const sinCodigo = res.items.filter((it) => !it.codigo || it.codigo === "—").length;
  const sinUnidades = res.items.filter((it) => it.unidades === null).length;
  const sinPrecio = res.items.filter((it) => it.precioChina === null).length;
  const avisos: string[] = [];
  if (sinCodigo) avisos.push(`${sinCodigo} ítem(s) sin código`);
  if (sinUnidades) avisos.push(`${sinUnidades} ítem(s) sin unidades`);
  if (sinPrecio) avisos.push(`${sinPrecio} ítem(s) sin precio FOB`);
  if (avisos.length) {
    console.log(`\n${YELLOW}⚠ Avisos: ${avisos.join(" · ")}${RESET}`);
  }
}

console.log("\n" + "═".repeat(78));
console.log(`${GREEN}Listo. Revisá arriba que cada columna esté bien mapeada y las filas cuadren.${RESET}`);
