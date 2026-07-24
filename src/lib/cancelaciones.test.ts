import { describe, it, expect } from "vitest";
import {
  buildPeriodos,
  bucketByPeriodo,
  buildComparacion,
  totalizar,
  type DailyRow,
} from "./cancelaciones";

describe("buildPeriodos", () => {
  it("arma meses ascendentes con el último en curso (parcial)", () => {
    const ps = buildPeriodos("mes", new Date("2026-07-24T15:00:00Z"), 3);
    expect(ps.map((p) => p.key)).toEqual(["2026-05", "2026-06", "2026-07"]);
    expect(ps[2].parcial).toBe(true);
    expect(ps[0].parcial).toBe(false);
    expect(ps[1]).toMatchObject({ desde: "2026-06-01", hasta: "2026-06-30", label: "junio 2026" });
  });

  it("arma semanas de lunes a domingo", () => {
    // 2026-07-24 es viernes → semana en curso 2026-07-20 (lun) a 2026-07-26 (dom).
    const ps = buildPeriodos("semana", new Date("2026-07-24T15:00:00Z"), 2);
    expect(ps[1]).toMatchObject({ desde: "2026-07-20", hasta: "2026-07-26", parcial: true });
    expect(ps[0]).toMatchObject({ desde: "2026-07-13", hasta: "2026-07-19", parcial: false });
  });
});

describe("bucketByPeriodo", () => {
  const daily: DailyRow[] = [
    { dia: "2026-06-10", total: 100, canceladas: 10, noPagada: 8, fraude: 1 },
    { dia: "2026-06-20", total: 50, canceladas: 5, noPagada: 5, fraude: 0 },
    { dia: "2026-07-05", total: 80, canceladas: 4, noPagada: 4, fraude: 0 },
  ];
  it("suma los días dentro de cada período y calcula la tasa", () => {
    const ps = buildPeriodos("mes", new Date("2026-07-24T15:00:00Z"), 2); // junio, julio
    const s = bucketByPeriodo(daily, ps);
    expect(s[0]).toMatchObject({ key: "2026-06", totalOrdenes: 150, canceladas: 15, noPagada: 13, fraude: 1 });
    expect(s[0].otras).toBe(1); // 15 − 13 − 1
    expect(s[0].tasa).toBeCloseTo(0.1, 5);
    expect(s[1]).toMatchObject({ key: "2026-07", totalOrdenes: 80, canceladas: 4 });
  });
});

describe("buildComparacion", () => {
  it("compara el último cerrado contra el anterior, ignorando el parcial", () => {
    const ps = buildPeriodos("mes", new Date("2026-07-24T15:00:00Z"), 3); // mayo, junio, julio(parcial)
    const daily: DailyRow[] = [
      { dia: "2026-05-10", total: 100, canceladas: 20, noPagada: 20, fraude: 0 },
      { dia: "2026-06-10", total: 100, canceladas: 10, noPagada: 10, fraude: 0 },
      { dia: "2026-07-10", total: 100, canceladas: 99, noPagada: 99, fraude: 0 }, // parcial: no debe entrar
    ];
    const c = buildComparacion(bucketByPeriodo(daily, ps));
    expect(c.actual?.key).toBe("2026-06");
    expect(c.anterior?.key).toBe("2026-05");
    expect(c.deltaCanceladas).toBe(-10); // 10 − 20
    expect(c.deltaPct).toBeCloseTo(-0.5, 5);
  });

  it("devuelve nulls si no hay dos períodos cerrados", () => {
    const c = buildComparacion([
      { key: "x", label: "x", parcial: true, totalOrdenes: 1, canceladas: 0, noPagada: 0, fraude: 0, otras: 0, tasa: 0 },
    ]);
    expect(c.actual).toBeNull();
    expect(c.deltaPct).toBeNull();
  });
});

describe("totalizar", () => {
  it("suma todos los períodos", () => {
    const t = totalizar([
      { key: "a", label: "", parcial: false, totalOrdenes: 100, canceladas: 10, noPagada: 8, fraude: 1, otras: 1, tasa: 0.1 },
      { key: "b", label: "", parcial: false, totalOrdenes: 100, canceladas: 20, noPagada: 20, fraude: 0, otras: 0, tasa: 0.2 },
    ]);
    expect(t).toMatchObject({ totalOrdenes: 200, canceladas: 30, noPagada: 28, fraude: 1 });
    expect(t.tasa).toBeCloseTo(0.15, 5);
  });
});
