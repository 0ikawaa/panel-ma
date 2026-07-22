import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import {
  combinarReposicion,
  parseVentas,
  parseStock,
  type VentaItem,
  type StockItem,
} from "./reposicion";

function xlsxBuffer(aoa: unknown[][]): Buffer {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Hoja1");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

describe("combinarReposicion", () => {
  const ventas: VentaItem[] = [
    { codigo: "98253", titulo: "LAMPARA", unidades: 8 },
    { codigo: "self_service", titulo: null, unidades: 99 },
    { codigo: "777", titulo: "STOCK NEG", unidades: 1 },
  ];
  const stock: StockItem[] = [
    { codigo: "98253", titulo: "LAMPARA", disponible: 8 },
    { codigo: "777", titulo: "STOCK NEG", disponible: -5 },
  ];

  it("descarta códigos que no empiezan con número", () => {
    const rows = combinarReposicion(ventas, stock, 4);
    expect(rows.map((r) => r.codigo)).toEqual(["98253", "777"]);
  });

  it("sugerida = max(0, round(vendidas*meses − stock))", () => {
    const rows = combinarReposicion(ventas, stock, 4);
    const lampara = rows.find((r) => r.codigo === "98253")!;
    expect(lampara.sugerida).toBe(24); // 8*4 - 8 = 24
  });

  it("toma el stock negativo como 0", () => {
    const rows = combinarReposicion(ventas, stock, 4);
    const neg = rows.find((r) => r.codigo === "777")!;
    expect(neg.stock).toBe(0);
    expect(neg.sugerida).toBe(4); // 1*4 - 0 = 4
  });
});

describe("parseVentas", () => {
  it("suma unidades por código y detecta el período", () => {
    const buf = xlsxBuffer([
      ["Análisis de facturas"],
      ["mayo 2026"],
      ["[98253] LAMPARA", 5, 5],
      ["[98253] LAMPARA", 3, 3],
      ["self_service", 9, 9],
    ]);
    const { items, periodo } = parseVentas(buf);
    expect(periodo).toBe("mayo 2026");
    const lampara = items.find((i) => i.codigo === "98253")!;
    expect(lampara.unidades).toBe(8);
    expect(lampara.titulo).toBe("LAMPARA");
  });
});

describe("parseStock", () => {
  it("detecta el encabezado y suma el disponible por código", () => {
    const buf = xlsxBuffer([
      ["Reporte de stock"],
      ["Nombre", "Disponible para uso"],
      ["[98253] LAMPARA", 10],
      ["[98253] LAMPARA", -2],
      ["[555] OTRO", 4],
    ]);
    const { items, dispColumn } = parseStock(buf);
    expect(dispColumn).toBe("Disponible para uso");
    const lampara = items.find((i) => i.codigo === "98253")!;
    expect(lampara.disponible).toBe(8); // 10 + (-2)
    const otro = items.find((i) => i.codigo === "555")!;
    expect(otro.disponible).toBe(4);
  });
});
