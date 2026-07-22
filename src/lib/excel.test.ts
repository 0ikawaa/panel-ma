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
