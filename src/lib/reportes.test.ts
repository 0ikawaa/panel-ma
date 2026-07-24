import { describe, it, expect } from "vitest";
import {
  scoreVentasAceleradas,
  computeWindows,
  summarize,
  normalizeParams,
  DEFAULT_PARAMS,
  type VentasAceleradasInput,
} from "./reportes";

const P = { ...DEFAULT_PARAMS, ventanaDias: 30, baseDias: 90, ratioMin: 1.5, coberturaMax: 30, minUnidades: 5, objetivoDias: 45 };

function input(over: Partial<VentasAceleradasInput>): VentasAceleradasInput {
  return { sku: "100", titulo: "X", unidadesRecientes: 0, unidadesBase: 0, stock: 0, enCamino: 0, ...over };
}

describe("scoreVentasAceleradas", () => {
  it("marca un SKU que se acelera y no tiene cobertura", () => {
    // 60 u en 30 días = 2/día; histórico 30 u en 90 días = 0,33/día → accel 6x.
    // Stock 20 → cobertura 10 días (< 30) → riesgo.
    const [it0] = scoreVentasAceleradas([input({ unidadesRecientes: 60, unidadesBase: 30, stock: 20 })], P);
    expect(it0).toBeTruthy();
    expect(it0.aceleracion).toBeCloseTo(6, 5);
    expect(it0.diasCobertura).toBeCloseTo(10, 5);
    expect(it0.sugerido).toBe(70); // 2/día * 45 = 90 objetivo − 20 disponible
  });

  it("descarta si hay stock de sobra aunque se acelere", () => {
    // Misma aceleración pero stock 200 → cobertura 100 días > 30 → no marca.
    const res = scoreVentasAceleradas([input({ unidadesRecientes: 60, unidadesBase: 30, stock: 200 })], P);
    expect(res).toHaveLength(0);
  });

  it("descarta ventas por debajo del mínimo de unidades", () => {
    const res = scoreVentasAceleradas([input({ unidadesRecientes: 3, unidadesBase: 0, stock: 0 })], P);
    expect(res).toHaveLength(0);
  });

  it("descarta si no se está acelerando (ratio bajo)", () => {
    // 30 u / 30d = 1/día; base 90 u / 90d = 1/día → accel 1x < 1,5.
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
    // 60u/30d = 2/día, stock 0 pero 90 en camino → cobertura 45 días > 30 → no marca.
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

  it("trata stock negativo (desajuste de Odoo) como 0", () => {
    const [it0] = scoreVentasAceleradas([input({ unidadesRecientes: 60, unidadesBase: 30, stock: -5 })], P);
    expect(it0.diasCobertura).toBe(0);
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
    expect(w.recienteDesde).toBe("2026-06-25"); // 30 días atrás inclusive
    expect(w.baseHasta).toBe("2026-06-24"); // día anterior al inicio reciente
    expect(w.baseDesde).toBe("2026-03-27"); // 90 días más antes
  });
});

describe("normalizeParams", () => {
  it("completa con defaults y descarta valores inválidos", () => {
    expect(normalizeParams(null)).toEqual(DEFAULT_PARAMS);
    expect(normalizeParams({ ventanaDias: 0, ratioMin: -3 })).toEqual(DEFAULT_PARAMS);
    expect(normalizeParams({ coberturaMax: 45 }).coberturaMax).toBe(45);
  });
});
