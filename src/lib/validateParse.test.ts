import { describe, it, expect } from "vitest";
import { validateParse } from "./validateParse";
import type { ParseResult, ParsedItem } from "./excel";

function item(over: Partial<ParsedItem> = {}): ParsedItem {
  return {
    rowIndex: 1,
    photo: null,
    codigo: "48108",
    precioChina: 2.5,
    cantidadPorCaja: 10,
    unidades: 100,
    montoTotal: 250,
    unidad: "PC",
    cbmUnitario: 0.05,
    cbmTotal: 0.5,
    remark: null,
    detalle: [],
    ...over,
  };
}

function result(over: Partial<ParseResult> = {}): ParseResult {
  return {
    items: [item()],
    photosFound: 1,
    totalItems: 1,
    containerTotal: 250,
    columnsDetected: {
      foto: "FOTO",
      codigo: "MA CODE",
      precioChina: "FOB NINGBO",
      unidades: "QUATITY",
      cbmTotal: "TOTAL CBM",
      montoTotal: "AMOUNT",
    },
    ...over,
  };
}

describe("validateParse — bloqueantes", () => {
  it("acepta un Excel bien leído", () => {
    const v = validateParse(result());
    expect(v.ok).toBe(true);
    expect(v.blocking).toHaveLength(0);
  });

  it("bloquea si no se detectó la columna de precio (FOB)", () => {
    const v = validateParse(
      result({ columnsDetected: { ...result().columnsDetected, precioChina: null } }),
    );
    expect(v.ok).toBe(false);
    expect(v.blocking.join(" ")).toMatch(/FOB/);
  });

  it("bloquea si no se detectó la columna de cantidad", () => {
    const v = validateParse(
      result({ columnsDetected: { ...result().columnsDetected, unidades: null } }),
    );
    expect(v.ok).toBe(false);
    expect(v.blocking.join(" ")).toMatch(/cantidad/i);
  });

  it("bloquea si no hay ningún producto", () => {
    const v = validateParse(result({ items: [], totalItems: 0 }));
    expect(v.ok).toBe(false);
  });

  it("bloquea si la mayoría de los productos quedó sin precio (columna mal mapeada)", () => {
    const items = [
      item({ precioChina: 2.5 }),
      item({ precioChina: null }),
      item({ precioChina: null }),
    ];
    const v = validateParse(result({ items, totalItems: items.length }));
    expect(v.ok).toBe(false);
    expect(v.blocking.join(" ")).toMatch(/%/);
  });
});

describe("validateParse — avisos no bloqueantes", () => {
  it("avisa (sin bloquear) si falta la columna de código", () => {
    const v = validateParse(
      result({ columnsDetected: { ...result().columnsDetected, codigo: null } }),
    );
    expect(v.ok).toBe(true);
    expect(v.warnings.join(" ")).toMatch(/código/i);
  });

  it("avisa si no se extrajo ninguna foto pero hay columna de foto", () => {
    const v = validateParse(result({ photosFound: 0 }));
    expect(v.ok).toBe(true);
    expect(v.warnings.join(" ")).toMatch(/imagen|foto/i);
  });

  it("un solo producto sin precio es aviso, no bloqueo", () => {
    const items = [item(), item(), item({ precioChina: null })];
    const v = validateParse(result({ items, totalItems: items.length }));
    expect(v.ok).toBe(true);
    expect(v.warnings.join(" ")).toMatch(/sin precio FOB/);
  });
});
