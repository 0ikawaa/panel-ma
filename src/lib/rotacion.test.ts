import { describe, it, expect } from "vitest";
import {
  scoreRotacion,
  summarizeRotacion,
  rotacionMeses,
  monthRange,
  addMonth,
  mesLabel,
  normalizeRotacionParams,
  motivoLabel,
  ROTACION_DEFAULTS,
  type RotacionInput,
} from "./rotacion";

const P = { ...ROTACION_DEFAULTS, minUnidadesRef: 5, caidaMin: 0.5 };

function input(over: Partial<RotacionInput>): RotacionInput {
  return {
    codigo: "100",
    titulo: "X",
    ventaActual: 0,
    ventaMesPasado: 0,
    ventaAnioPasado: 0,
    stock: 0,
    enCamino: 0,
    ...over,
  };
}

describe("scoreRotacion", () => {
  it("marca un producto que dejó de venderse y estaba agotado", () => {
    // Vendía 20 el mes pasado, ahora 0 → caída 100%. Stock 0 y nada en camino.
    const [it0] = scoreRotacion([input({ ventaMesPasado: 20, ventaActual: 0, stock: 0 })], P);
    expect(it0).toBeTruthy();
    expect(it0.caidaMesPct).toBe(1);
    expect(it0.unidadesPerdidas).toBe(20);
    expect(it0.motivo).toBe("sin-stock");
  });

  it("distingue 'con stock, no rota' de 'sin stock'", () => {
    const [conStock] = scoreRotacion([input({ ventaMesPasado: 30, ventaActual: 5, stock: 40 })], P);
    expect(conStock.motivo).toBe("con-stock");
    const [enCamino] = scoreRotacion([input({ ventaMesPasado: 30, ventaActual: 5, stock: 0, enCamino: 50 })], P);
    expect(enCamino.motivo).toBe("sin-stock-en-camino");
  });

  it("no marca si la caída es menor al umbral", () => {
    // 20 → 15 = caída 25% < 50%.
    const res = scoreRotacion([input({ ventaMesPasado: 20, ventaActual: 15, stock: 10 })], P);
    expect(res).toHaveLength(0);
  });

  it("no marca productos que nunca vendieron lo suficiente", () => {
    const res = scoreRotacion([input({ ventaMesPasado: 3, ventaActual: 0, stock: 0 })], P);
    expect(res).toHaveLength(0);
  });

  it("no marca si vende igual o más", () => {
    const res = scoreRotacion([input({ ventaMesPasado: 10, ventaActual: 12, ventaAnioPasado: 8, stock: 5 })], P);
    expect(res).toHaveLength(0);
  });

  it("detecta caída contra el año pasado aunque el mes pasado sea bajo", () => {
    // Producto estacional: año pasado 40, mes pasado 2, ahora 1 → cae vs año.
    const [it0] = scoreRotacion([input({ ventaAnioPasado: 40, ventaMesPasado: 2, ventaActual: 1, stock: 3 })], P);
    expect(it0).toBeTruthy();
    expect(it0.caidaAnioPct).toBeCloseTo(0.975, 3);
    expect(it0.unidadesPerdidas).toBe(39); // ref = max(2, 40) = 40; 40 − 1
  });

  it("toma el stock negativo como 0 (y por lo tanto 'sin stock')", () => {
    const [it0] = scoreRotacion([input({ ventaMesPasado: 20, ventaActual: 2, stock: -8 })], P);
    expect(it0.stock).toBe(0);
    expect(it0.motivo).toBe("sin-stock");
  });

  it("ordena por unidades perdidas", () => {
    const rows = [
      input({ codigo: "A", ventaMesPasado: 10, ventaActual: 0, stock: 0 }), // pierde 10
      input({ codigo: "B", ventaMesPasado: 50, ventaActual: 0, stock: 0 }), // pierde 50
    ];
    expect(scoreRotacion(rows, P).map((r) => r.codigo)).toEqual(["B", "A"]);
  });
});

describe("summarizeRotacion", () => {
  it("cuenta sin stock / con stock y suma unidades perdidas", () => {
    const items = scoreRotacion(
      [
        input({ codigo: "A", ventaMesPasado: 20, ventaActual: 0, stock: 0 }), // sin stock
        input({ codigo: "B", ventaMesPasado: 30, ventaActual: 5, stock: 40 }), // con stock
      ],
      P,
    );
    const s = summarizeRotacion(items);
    expect(s.total).toBe(2);
    expect(s.sinStock).toBe(1);
    expect(s.conStock).toBe(1);
    expect(s.unidadesPerdidas).toBe(20 + 25);
  });
});

describe("rotacionMeses", () => {
  it("toma el último mes cerrado, el anterior y el mismo del año pasado", () => {
    const now = new Date("2026-07-24T15:00:00Z");
    const m = rotacionMeses(now);
    expect(m.actual).toBe("2026-06"); // último mes completo
    expect(m.mesPasado).toBe("2026-05");
    expect(m.anioPasado).toBe("2025-06");
  });

  it("cruza bien el fin de año", () => {
    const m = rotacionMeses(new Date("2026-01-10T12:00:00Z"));
    expect(m.actual).toBe("2025-12");
    expect(m.mesPasado).toBe("2025-11");
    expect(m.anioPasado).toBe("2024-12");
  });
});

describe("monthRange / addMonth / mesLabel", () => {
  it("da el rango del mes con el último día correcto", () => {
    expect(monthRange("2026-02")).toEqual({ desde: "2026-02-01", hasta: "2026-02-28" });
    expect(monthRange("2024-02")).toEqual({ desde: "2024-02-01", hasta: "2024-02-29" }); // bisiesto
    expect(monthRange("2026-06")).toEqual({ desde: "2026-06-01", hasta: "2026-06-30" });
  });
  it("suma y resta meses", () => {
    expect(addMonth("2026-01", -1)).toBe("2025-12");
    expect(addMonth("2026-06", -12)).toBe("2025-06");
  });
  it("nombra el mes en español", () => {
    expect(mesLabel("2026-06")).toBe("junio 2026");
  });
});

describe("normalizeRotacionParams", () => {
  it("completa defaults y recorta caidaMin a [0,1]", () => {
    expect(normalizeRotacionParams(null)).toEqual(ROTACION_DEFAULTS);
    expect(normalizeRotacionParams({ caidaMin: 5 }).caidaMin).toBe(1);
    expect(normalizeRotacionParams({ caidaMin: -1 }).caidaMin).toBe(0);
    expect(normalizeRotacionParams({ minUnidadesRef: 10 }).minUnidadesRef).toBe(10);
  });
});

describe("motivoLabel", () => {
  it("da textos legibles", () => {
    expect(motivoLabel("sin-stock")).toMatch(/agotado/i);
    expect(motivoLabel("con-stock")).toMatch(/no rota/i);
  });
});
