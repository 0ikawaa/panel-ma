import { describe, it, expect } from "vitest";
import {
  fmtDiaCortoMl,
  fmtFechaLargaMl,
  fmtHoraMl,
  hoyInput,
  mesesAtrasInput,
  primeroDelMesInput,
} from "./fechaVentas";

describe("valores por defecto de los filtros de fecha", () => {
  it("hoyInput devuelve el día local en formato de <input type=date>", () => {
    const d = new Date(2026, 6, 28, 15, 30); // 28 de julio de 2026, hora local
    expect(hoyInput(d)).toBe("2026-07-28");
  });

  it("no se corre de día por la hora", () => {
    // El bug clásico: usar toISOString() derecho manda 21:00 local al día siguiente.
    expect(hoyInput(new Date(2026, 6, 28, 23, 59))).toBe("2026-07-28");
    expect(hoyInput(new Date(2026, 6, 28, 0, 1))).toBe("2026-07-28");
  });

  it("primeroDelMesInput da el 1 del mes en curso", () => {
    expect(primeroDelMesInput(new Date(2026, 6, 28))).toBe("2026-07-01");
    expect(primeroDelMesInput(new Date(2026, 0, 31))).toBe("2026-01-01");
  });

  it("mesesAtrasInput retrocede la cantidad de meses pedida", () => {
    expect(mesesAtrasInput(1, new Date(2026, 6, 15))).toBe("2026-06-15");
    expect(mesesAtrasInput(4, new Date(2026, 6, 15))).toBe("2026-03-15");
  });

  it("mesesAtrasInput cruza el año para atrás", () => {
    expect(mesesAtrasInput(3, new Date(2026, 1, 10))).toBe("2025-11-10");
  });

  it("mesesAtrasInput con 0 es hoy", () => {
    const d = new Date(2026, 6, 28);
    expect(mesesAtrasInput(0, d)).toBe(hoyInput(d));
  });
});

describe("timestamps de MercadoLibre", () => {
  const ISO = "2026-07-28T08:56:03.000-04:00";

  it("el día se muestra tal cual lo manda ML, sin convertir de zona", () => {
    // Es el mismo criterio con el que se filtra por fecha; convertir acá haría
    // que una orden apareciera en un día y se filtrara en otro.
    expect(fmtDiaCortoMl(ISO)).toBe("28/7");
  });

  it("la hora sí se pasa a hora uruguaya", () => {
    // 08:56 en -04:00 son las 09:56 en Uruguay (-03:00).
    expect(fmtHoraMl(ISO)).toMatch(/09:56/);
  });

  it("la fecha larga combina día crudo y hora uruguaya", () => {
    const s = fmtFechaLargaMl(ISO);
    expect(s).toContain("28/7/2026");
    expect(s).toMatch(/09:56:03/);
  });

  it("no explota con basura ni con vacío", () => {
    expect(fmtDiaCortoMl("")).toBe("");
    expect(fmtDiaCortoMl("2026")).toBe("");
    expect(fmtHoraMl("no-es-fecha")).toBe("");
    expect(fmtFechaLargaMl("no-es-fecha")).toBe("");
  });
});
