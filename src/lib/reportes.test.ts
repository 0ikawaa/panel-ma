import { describe, it, expect } from "vitest";
import {
  scoreVentasAceleradas,
  computeWindows,
  summarize,
  normalizeParams,
  DEFAULT_PARAMS,
  DIAS_POR_MES,
  type VentasAceleradasInput,
} from "./reportes";

const P = {
  ...DEFAULT_PARAMS,
  ventanaDias: 30,
  baseDias: 90,
  ratioMin: 1.5,
  coberturaMax: 30,
  minUnidades: 5,
  mesesChina: 4,
  mesesBrasil: 1,
};

function input(over: Partial<VentasAceleradasInput>): VentasAceleradasInput {
  return {
    sku: "100",
    titulo: "X",
    unidadesRecientes: 0,
    unidadesBase: 0,
    stock: 0,
    enCamino: 0,
    origen: "china",
    ...over,
  };
}

describe("scoreVentasAceleradas", () => {
  it("marca un SKU que se acelera y no tiene cobertura", () => {
    // 60 u en 30 días = 2/día; histórico 30 u en 90 días = 0,33/día → accel 6x.
    // Stock 20 → cobertura 10 días (< 30) → riesgo.
    const [it0] = scoreVentasAceleradas([input({ unidadesRecientes: 60, unidadesBase: 30, stock: 20 })], P);
    expect(it0).toBeTruthy();
    expect(it0.aceleracion).toBeCloseTo(6, 5);
    expect(it0.diasCobertura).toBeCloseTo(10, 5);
    // China = 4 meses: 2/día * 4 * 30,44 = 243,52 objetivo − 20 disponible → 224.
    expect(it0.mesesObjetivo).toBe(4);
    expect(it0.sugerido).toBe(Math.round(2 * 4 * DIAS_POR_MES - 20));
  });

  it("pide menos para un producto de Brasil (1 mes) que de China (4 meses)", () => {
    const base = { unidadesRecientes: 60, unidadesBase: 30, stock: 10 };
    const [china] = scoreVentasAceleradas([input({ ...base, origen: "china" })], P);
    const [brasil] = scoreVentasAceleradas([input({ ...base, origen: "brasil" })], P);
    expect(china.mesesObjetivo).toBe(4);
    expect(brasil.mesesObjetivo).toBe(1);
    expect(brasil.sugerido).toBeLessThan(china.sugerido);
    expect(brasil.sugerido).toBe(Math.round(2 * 1 * DIAS_POR_MES - 10));
  });

  it("descarta si hay stock de sobra aunque se acelere", () => {
    const res = scoreVentasAceleradas([input({ unidadesRecientes: 60, unidadesBase: 30, stock: 200 })], P);
    expect(res).toHaveLength(0);
  });

  it("descarta ventas por debajo del mínimo de unidades", () => {
    const res = scoreVentasAceleradas([input({ unidadesRecientes: 3, unidadesBase: 0, stock: 0 })], P);
    expect(res).toHaveLength(0);
  });

  it("descarta si no se está acelerando (ratio bajo)", () => {
    const res = scoreVentasAceleradas([input({ unidadesRecientes: 30, unidadesBase: 90, stock: 0 })], P);
    expect(res).toHaveLength(0);
  });

  it("trata como sin historial a un producto nuevo que explota", () => {
    const [it0] = scoreVentasAceleradas([input({ unidadesRecientes: 40, unidadesBase: 0, stock: 5 })], P);
    expect(it0).toBeTruthy();
    expect(it0.sinHistorial).toBe(true);
    expect(it0.aceleracion).toBeNull();
  });

  it("cuenta lo que viene en camino como cobertura", () => {
    const res = scoreVentasAceleradas([input({ unidadesRecientes: 60, unidadesBase: 30, stock: 0, enCamino: 90 })], P);
    expect(res).toHaveLength(0);
  });

  it("ordena por urgencia (menos días de cobertura primero)", () => {
    const rows = [
      input({ sku: "A", unidadesRecientes: 60, unidadesBase: 30, stock: 40 }), // cob 20d
      input({ sku: "B", unidadesRecientes: 60, unidadesBase: 30, stock: 10 }), // cob 5d
    ];
    const res = scoreVentasAceleradas(rows, P);
    expect(res.map((r) => r.sku)).toEqual(["B", "A"]);
  });

  it("muestra el stock negativo (desajuste de Odoo) como 0", () => {
    const [it0] = scoreVentasAceleradas([input({ unidadesRecientes: 60, unidadesBase: 30, stock: -5 })], P);
    expect(it0.stock).toBe(0);
    expect(it0.diasCobertura).toBe(0);
  });

  it("deja el stock en null cuando no hay dato en Odoo", () => {
    const [it0] = scoreVentasAceleradas([input({ unidadesRecientes: 60, unidadesBase: 30, stock: null, enCamino: 10 })], P);
    expect(it0.stock).toBeNull();
    expect(it0.diasCobertura).toBeCloseTo(5, 5); // (0 + 10) / 2
  });
});

describe("summarize", () => {
  it("cuenta los sin reposición y suma unidades sugeridas", () => {
    const items = scoreVentasAceleradas(
      [
        input({ sku: "A", unidadesRecientes: 60, unidadesBase: 30, stock: 10, enCamino: 0 }),
        input({ sku: "B", unidadesRecientes: 60, unidadesBase: 30, stock: 10, enCamino: 5 }),
      ],
      P,
    );
    const s = summarize(items);
    expect(s.total).toBe(2);
    expect(s.sinReposicion).toBe(1);
    expect(s.unidadesSugeridas).toBe(items[0].sugerido + items[1].sugerido);
  });
});

describe("computeWindows", () => {
  it("parte las dos ventanas de forma contigua", () => {
    const now = new Date("2026-07-24T15:00:00Z");
    const w = computeWindows(P, now);
    expect(w.recienteHasta).toBe("2026-07-24");
    expect(w.recienteDesde).toBe("2026-06-25");
    expect(w.baseHasta).toBe("2026-06-24");
    expect(w.baseDesde).toBe("2026-03-27");
  });
});

describe("normalizeParams", () => {
  it("completa con defaults y descarta valores inválidos", () => {
    expect(normalizeParams(null)).toEqual(DEFAULT_PARAMS);
    expect(normalizeParams({ ventanaDias: 0, ratioMin: -3 })).toEqual(DEFAULT_PARAMS);
    expect(normalizeParams({ coberturaMax: 45 }).coberturaMax).toBe(45);
    expect(normalizeParams({ mesesBrasil: 2 }).mesesBrasil).toBe(2);
  });
});
