import { describe, it, expect } from "vitest";
import {
  landedCost,
  cbmPorUnidad,
  IVA,
  INCIDENCIA_CHINA,
  INCIDENCIA_BRASIL,
  CBM_POR_CONTENEDOR,
} from "./cost";

describe("cbmPorUnidad", () => {
  it("divide el CBM de la caja por las unidades por caja", () => {
    expect(cbmPorUnidad(0.5, 10)).toBeCloseTo(0.05, 6);
  });
  it("devuelve null si falta algún dato o las unidades son 0", () => {
    expect(cbmPorUnidad(null, 10)).toBeNull();
    expect(cbmPorUnidad(0.5, null)).toBeNull();
    expect(cbmPorUnidad(0.5, 0)).toBeNull();
  });
});

describe("landedCost — Brasil", () => {
  it("aplica incidencia 1,15 e IVA, sin flete", () => {
    const lc = landedCost("brasil", 10, null, null);
    expect(lc).not.toBeNull();
    expect(lc!.fleteUnitario).toBe(0);
    expect(lc!.incidencia).toBe(INCIDENCIA_BRASIL);
    expect(lc!.final).toBeCloseTo(10 * INCIDENCIA_BRASIL * IVA, 6); // 14.03
  });
});

describe("landedCost — China", () => {
  it("suma flete prorrateado por CBM, incidencia 1,33 e IVA", () => {
    // flete = (6800 / 68) * 0.05 = 5 ; base = 10 + 5 = 15
    const lc = landedCost("china", 10, 0.05, 6800);
    expect(lc).not.toBeNull();
    expect(lc!.fleteUnitario).toBeCloseTo(
      (6800 / CBM_POR_CONTENEDOR) * 0.05,
      6,
    );
    expect(lc!.base).toBeCloseTo(15, 6);
    expect(lc!.incidencia).toBe(INCIDENCIA_CHINA);
    expect(lc!.final).toBeCloseTo(15 * INCIDENCIA_CHINA * IVA, 6); // 24.339
  });

  it("devuelve null si falta el flete o el CBM unitario", () => {
    expect(landedCost("china", 10, 0.05, null)).toBeNull();
    expect(landedCost("china", 10, null, 6800)).toBeNull();
  });
});

describe("landedCost — sin FOB", () => {
  it("devuelve null cuando no hay precio de origen", () => {
    expect(landedCost("china", null, 0.05, 6800)).toBeNull();
    expect(landedCost("brasil", null, null, null)).toBeNull();
  });
});
