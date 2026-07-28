import { describe, it, expect } from "vitest";
import { fmtFecha, hoyUy, parseFecha, toInputFecha } from "./fecha";

describe("parseFecha", () => {
  it("guarda la fecha a medianoche UTC", () => {
    expect(parseFecha("2026-07-30")?.toISOString()).toBe("2026-07-30T00:00:00.000Z");
  });

  it("se queda con el día de un ISO completo", () => {
    expect(parseFecha("2026-07-30T00:00:00.000Z")?.toISOString()).toBe(
      "2026-07-30T00:00:00.000Z",
    );
  });

  it("devuelve null sin fecha o con basura", () => {
    expect(parseFecha(null)).toBeNull();
    expect(parseFecha("")).toBeNull();
    expect(parseFecha("30/07/2026")).toBeNull();
    expect(parseFecha(123)).toBeNull();
  });

  it("rechaza fechas que no existen en vez de correrlas", () => {
    expect(parseFecha("2026-02-31")).toBeNull();
    expect(parseFecha("2026-13-01")).toBeNull();
  });
});

describe("fmtFecha", () => {
  it("muestra el mismo día que se cargó, sin importar la zona horaria", () => {
    // El bug: 2026-07-30 a medianoche UTC es el 29 de julio en Uruguay.
    expect(fmtFecha("2026-07-30T00:00:00.000Z")).toContain("30");
    expect(fmtFecha("2026-07-30T00:00:00.000Z")).toContain("2026");
    expect(fmtFecha("2026-01-01T00:00:00.000Z")).toContain("01");
  });

  it("devuelve el guion largo sin fecha", () => {
    expect(fmtFecha(null)).toBe("—");
    expect(fmtFecha("cualquier cosa")).toBe("—");
  });
});

describe("toInputFecha", () => {
  it("da el YYYY-MM-DD que espera un <input type=date>", () => {
    expect(toInputFecha("2026-07-30T00:00:00.000Z")).toBe("2026-07-30");
    expect(toInputFecha(new Date("2026-07-30T00:00:00.000Z"))).toBe("2026-07-30");
    expect(toInputFecha(null)).toBe("");
  });

  it("va y vuelve sin correr el día", () => {
    const guardado = parseFecha("2026-07-30")!;
    expect(toInputFecha(guardado)).toBe("2026-07-30");
  });
});

describe("hoyUy", () => {
  it("de noche en Uruguay todavía es el día de hoy, aunque en UTC sea mañana", () => {
    // 22:00 del 29 en Montevideo = 01:00 del 30 en UTC.
    expect(hoyUy(new Date("2026-07-30T01:00:00Z")).toISOString()).toBe(
      "2026-07-29T00:00:00.000Z",
    );
  });

  it("de día coincide con la fecha UTC", () => {
    expect(hoyUy(new Date("2026-07-30T13:00:00Z")).toISOString()).toBe(
      "2026-07-30T00:00:00.000Z",
    );
  });
});
