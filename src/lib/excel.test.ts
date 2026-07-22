import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { parseExcel } from "./excel";

function xlsxBuffer(aoa: unknown[][]): Buffer {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Hoja1");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

// Excel de ejemplo con encabezados típicos de proveedor chino (incluye el
// typo "QUATITY") y una fila TOTAL que corta la tabla.
const SAMPLE = [
  ["Proveedor XYZ", "", "", "", "", "", ""],
  ["Foto", "MA CODE", "FOB", "QUATITY", "CBM TOTAL", "Amount", "Remark"],
  ["", "48108-BEI-39", 2.5, 100, 0.5, 250, "nota A"],
  ["", "48108-BEI-40", 2.5, 50, 0.3, 125, ""],
  ["", "77777", 1.0, 10, 0.1, 10, ""],
  ["", "TOTAL", "", "", "", 385, ""],
  ["Condiciones de pago: 30% depósito", "", "", "", "", "", ""],
];

describe("parseExcel — detección de columnas", () => {
  it("mapea los encabezados aunque tengan typos y ruido arriba", async () => {
    const res = await parseExcel(xlsxBuffer(SAMPLE));
    expect(res.columnsDetected).toMatchObject({
      foto: "Foto",
      codigo: "MA CODE",
      precioChina: "FOB",
      unidades: "QUATITY",
      cbmTotal: "CBM TOTAL",
      montoTotal: "Amount",
    });
  });
});

describe("parseExcel — filas y total", () => {
  it("corta en la fila TOTAL e ignora las notas de abajo", async () => {
    const res = await parseExcel(xlsxBuffer(SAMPLE));
    expect(res.totalItems).toBe(2); // 48108 (agrupado) + 77777
    expect(res.containerTotal).toBe(385);
  });

  it("agrupa por código base y suma unidades / monto / CBM", async () => {
    const res = await parseExcel(xlsxBuffer(SAMPLE));
    const item = res.items.find((i) => i.codigo === "48108")!;
    expect(item).toBeDefined();
    expect(item.unidades).toBe(150); // 100 + 50
    expect(item.montoTotal).toBe(375); // 250 + 125
    expect(item.cbmTotal).toBeCloseTo(0.8, 6); // 0.5 + 0.3
    expect(item.detalle).toHaveLength(2);
  });

  it("deja los productos de una sola línea sin agrupar", async () => {
    const res = await parseExcel(xlsxBuffer(SAMPLE));
    const item = res.items.find((i) => i.codigo === "77777")!;
    expect(item.unidades).toBe(10);
    expect(item.montoTotal).toBe(10);
  });

  it("no encuentra fotos cuando el Excel no tiene imágenes incrustadas", async () => {
    const res = await parseExcel(xlsxBuffer(SAMPLE));
    expect(res.photosFound).toBe(0);
  });
});

// Réplica de la estructura real de las facturas del proveedor (UNION SOURCE):
// 14 columnas, SIN fila "TOTAL" etiquetada, con una fila de totales sin etiqueta
// (solo CBM + AMOUNT sumados) y filas "Deposit" / "Balance" al final, además de
// productos cargados como "SIN CODIGO" / "NA". Cubre los 3 bugs que encontramos.
const REAL_HEADER = [
  "NO.", "FOTO", "IHOME CODE", "MA CODE", "DESCRIPTION", "PACKAGING",
  "FOB NINGBO", "UNIT", "QTY/CTN", "CBM", "TOTAL CBM", "CTNS", "QUATITY", "AMOUNT",
];
function row14(v: Record<number, unknown>): unknown[] {
  const r = new Array(14).fill("");
  for (const k of Object.keys(v)) r[Number(k)] = v[Number(k)];
  return r;
}
const REAL_INVOICE = [
  ["UNION SOURCE CO.,LTD"],
  ["Proforma Invoice"],
  REAL_HEADER,
  // Productos con código real
  row14({ 0: 1, 2: "MA044", 3: 75118, 4: "Shelf", 6: 10.68, 7: "PC", 8: 1, 9: 0.014, 10: 1.4, 11: 100, 12: 100, 13: 1068 }),
  row14({ 0: 2, 2: "MA095", 3: 23029, 4: "Lamp", 6: 4.65, 7: "SET", 8: 12, 9: 0.072, 10: 7.2, 11: 100, 12: 1200, 13: 5580 }),
  // Dos productos DISTINTOS cargados como "SIN CODIGO" / "NA"
  row14({ 0: 3, 2: "MA-Vino", 3: "SIN CODIGO", 4: "Protector vino", 6: 0.066, 7: "PC", 8: 1000, 9: 0.054, 10: 0.54, 11: 10, 12: 10000, 13: 660 }),
  row14({ 0: 4, 2: "NA", 3: "NA", 4: "Repuesto cafetera", 6: 12.25, 7: "PC", 8: 1, 9: 0.01, 10: 0.01, 11: 1, 12: 1, 13: 12.25 }),
  // Fila de totales SIN etiqueta (solo CBM total + AMOUNT sumados)
  row14({ 10: 9.15, 13: 7320.25 }),
  // Pagos
  row14({ 12: "Deposit", 13: 732 }),
  row14({ 12: "Balance", 13: 6588.25 }),
  ["Payments Term:", "10% deposit, then balance OA 90days"],
];

describe("parseExcel — facturas reales (UNION SOURCE)", () => {
  it("cuenta solo los productos, sin filas de totales ni pagos", async () => {
    const res = await parseExcel(xlsxBuffer(REAL_INVOICE));
    expect(res.totalItems).toBe(4); // 2 con código + 2 "SIN CODIGO", nada más
  });

  it("no fusiona productos distintos cargados como 'SIN CODIGO' / 'NA'", async () => {
    const res = await parseExcel(xlsxBuffer(REAL_INVOICE));
    const sinCodigo = res.items.filter((i) => i.unidades === 10000 || i.unidades === 1);
    expect(sinCodigo).toHaveLength(2); // siguen separados (10000 y 1), no sumados a 10001
    expect(res.items.some((i) => i.unidades === 10001)).toBe(false);
  });

  it("calcula el total del contenedor como la suma de la mercadería", async () => {
    const res = await parseExcel(xlsxBuffer(REAL_INVOICE));
    // 1068 + 5580 + 660 + 12.25 = 7320.25 (coincide con la fila de totales interna)
    expect(res.containerTotal).toBeCloseTo(7320.25, 2);
  });

  it("no cuenta 'Deposit' ni 'Balance' como productos", async () => {
    const res = await parseExcel(xlsxBuffer(REAL_INVOICE));
    expect(res.items.some((i) => i.montoTotal === 732 || i.montoTotal === 6588.25)).toBe(false);
  });
});
