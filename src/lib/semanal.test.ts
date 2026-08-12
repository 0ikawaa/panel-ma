import { describe, it, expect } from "vitest";
import {
  DEFAULT_PARAMS,
  buildReport,
  codigoBase,
  construirFilas,
  fmtCobertura,
  normalizeParams,
  resumir,
  ventanaLabel,
  ventanaSemanal,
  type SemanalInput,
} from "@/lib/semanal";
import { medirImagen } from "@/lib/xlsxFotos";

// 2026-08-10 es lunes; 2026-08-09, domingo.
const LUNES_9AM_UY = new Date("2026-08-10T12:00:00Z");

describe("ventanaSemanal", () => {
  it("el lunes toma la semana que cerró (lunes a domingo)", () => {
    const v = ventanaSemanal(DEFAULT_PARAMS, LUNES_9AM_UY);
    expect(v.desde).toBe("2026-08-03");
    expect(v.hasta).toBe("2026-08-09");
  });

  it("corriéndolo a mitad de semana sigue siendo la misma semana cerrada", () => {
    const miercoles = new Date("2026-08-12T15:00:00Z");
    const v = ventanaSemanal(DEFAULT_PARAMS, miercoles);
    expect([v.desde, v.hasta]).toEqual(["2026-08-03", "2026-08-09"]);
  });

  it("el domingo no reporta el día que todavía está corriendo", () => {
    const domingo = new Date("2026-08-16T23:00:00Z");
    const v = ventanaSemanal(DEFAULT_PARAMS, domingo);
    expect(v.hasta).toBe("2026-08-09");
  });

  it("usa el huso de Uruguay, no UTC", () => {
    // 01:00 UTC del lunes es domingo 22:00 en Uruguay.
    const v = ventanaSemanal(DEFAULT_PARAMS, new Date("2026-08-10T01:00:00Z"));
    expect(v.hasta).toBe("2026-08-02");
  });

  it("la ventana del ritmo arranca `ritmoDias` antes del cierre", () => {
    const v = ventanaSemanal({ ...DEFAULT_PARAMS, ritmoDias: 90 }, LUNES_9AM_UY);
    expect(v.ritmoDesde).toBe("2026-05-12");
  });
});

describe("ventanaLabel", () => {
  it("junta el mes cuando la semana no lo cruza", () => {
    expect(ventanaLabel("2026-08-03", "2026-08-09")).toBe("3–9 ago");
  });
  it("muestra los dos meses cuando lo cruza", () => {
    expect(ventanaLabel("2026-07-28", "2026-08-03")).toBe("28 jul – 3 ago");
  });
});

describe("codigoBase", () => {
  it("saca la variante del SKU", () => {
    expect(codigoBase("16214-BLA")).toBe("16214");
    expect(codigoBase("48108-BEI-39")).toBe("48108");
    expect(codigoBase("53019")).toBe("53019");
  });
});

const fila = (p: Partial<SemanalInput> = {}): SemanalInput => ({
  sku: "16214-BLA",
  titulo: "Placard",
  categoria: "MOBILIARIO",
  unidadesSemana: 10,
  unidadesRitmo: 90, // 1 u/día con ritmoDias=90
  stock: 100,
  enCamino: 0,
  photo: null,
  ...p,
});

describe("construirFilas", () => {
  const params = { ...DEFAULT_PARAMS, mesesObjetivo: 4, ritmoDias: 90 };

  it("proyecta con la ventana larga, no con la semana", () => {
    // 10 u en la semana pero 90 u en 90 días = 1 u/día. A 4 meses (121,76 días)
    // hacen falta ~122 u; hay 100 → pedir 22. Si proyectara con la semana
    // (10/7 = 1,43 u/día) daría casi 74.
    const [it] = construirFilas([fila()], params);
    expect(it.velDia).toBeCloseTo(1, 5);
    expect(it.pedir).toBe(22);
    expect(it.mesesCobertura).toBeCloseTo(100 / 30.44, 3);
  });

  it("descuenta lo que ya viene en camino", () => {
    const [it] = construirFilas([fila({ enCamino: 50 })], params);
    expect(it.disponible).toBe(150);
    expect(it.pedir).toBe(0);
    expect(it.alcanza).toBe(true);
  });

  it("no descuenta el en camino si la config lo apaga", () => {
    const [it] = construirFilas([fila({ enCamino: 50 })], { ...params, descontarEnCamino: false });
    expect(it.disponible).toBe(100);
    expect(it.pedir).toBe(22);
  });

  it("lee el stock negativo de Odoo como cero", () => {
    const [it] = construirFilas([fila({ stock: -8 })], params);
    expect(it.stock).toBe(0);
    expect(it.mesesCobertura).toBe(0);
  });

  it("deja fuera lo que no se vendió en la semana", () => {
    expect(construirFilas([fila({ unidadesSemana: 0 })], params)).toHaveLength(0);
  });

  it("deja fuera los conceptos de servicio (envíos, armado)", () => {
    const rows = [fila({ sku: "001", titulo: "ENVÍO" }), fila({ sku: "16214-BLA" })];
    expect(construirFilas(rows, params).map((r) => r.sku)).toEqual(["16214-BLA"]);
  });

  it("sin ritmo medido no inventa una proyección", () => {
    // Vendió esta semana pero la ventana larga no lo tiene (dato raro): sin
    // velocidad no se puede proyectar, así que no se pide nada.
    const [it] = construirFilas([fila({ unidadesRitmo: 0 })], params);
    expect(it.mesesCobertura).toBeNull();
    expect(it.pedir).toBe(0);
  });

  it("ordena por urgencia: menos cobertura primero", () => {
    const rows = [
      fila({ sku: "A", stock: 1000 }),
      fila({ sku: "B", stock: 10 }),
      fila({ sku: "C", stock: 200 }),
      fila({ sku: "D", unidadesRitmo: 0 }), // sin ritmo → al final
    ];
    expect(construirFilas(rows, params).map((r) => r.sku)).toEqual(["B", "C", "A", "D"]);
  });

  it("a igual cobertura, primero lo que más se vendió", () => {
    const rows = [
      fila({ sku: "A", unidadesSemana: 3 }),
      fila({ sku: "B", unidadesSemana: 30 }),
    ];
    expect(construirFilas(rows, params).map((r) => r.sku)).toEqual(["B", "A"]);
  });

  it("trata cada variante por separado y guarda su código padre", () => {
    const items = construirFilas(
      [fila({ sku: "16214-BLA" }), fila({ sku: "16214-MAR", stock: 5 })],
      params,
    );
    expect(items.map((i) => i.sku)).toEqual(["16214-MAR", "16214-BLA"]);
    expect(new Set(items.map((i) => i.codigoBase))).toEqual(new Set(["16214"]));
  });
});

describe("resumir", () => {
  it("cuenta variantes, productos y lo que hay que pedir", () => {
    const items = construirFilas(
      [
        fila({ sku: "16214-BLA", unidadesSemana: 10, stock: 10 }),
        fila({ sku: "16214-MAR", unidadesSemana: 5, stock: 1000 }),
        fila({ sku: "53019", unidadesSemana: 2, stock: 0 }),
      ],
      DEFAULT_PARAMS,
    );
    const s = resumir(items);
    expect(s.variantes).toBe(3);
    expect(s.productos).toBe(2); // 16214 y 53019
    expect(s.unidadesSemana).toBe(17);
    expect(s.aReponer).toBe(2); // la de stock 1000 ya alcanza
    expect(s.sinStock).toBe(1);
    expect(s.unidadesAPedir).toBeGreaterThan(0);
  });
});

describe("normalizeParams", () => {
  it("completa con defaults y descarta valores imposibles", () => {
    expect(normalizeParams(null)).toEqual(DEFAULT_PARAMS);
    expect(normalizeParams({ mesesObjetivo: 0, ritmoDias: 3 })).toEqual(DEFAULT_PARAMS);
    expect(normalizeParams({ mesesObjetivo: 6 }).mesesObjetivo).toBe(6);
    expect(normalizeParams({ descontarEnCamino: false }).descontarEnCamino).toBe(false);
  });
});

describe("buildReport", () => {
  it("arma reporte, ventana y resumen de una", () => {
    const r = buildReport([fila()], DEFAULT_PARAMS, LUNES_9AM_UY);
    expect(r.key).toBe("semanal");
    expect(r.ventana.hasta).toBe("2026-08-09");
    expect(r.items).toHaveLength(1);
    expect(r.summary.variantes).toBe(1);
  });
});

describe("fmtCobertura", () => {
  it("muestra los meses con una decimal y coma", () => {
    expect(fmtCobertura(1.23)).toBe("1,2 m");
    expect(fmtCobertura(null)).toBe("—");
    expect(fmtCobertura(150)).toBe("99+ m");
  });
});

describe("medirImagen", () => {
  it("lee el tamaño de un PNG", () => {
    const png = new Uint8Array(24);
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    new DataView(png.buffer).setUint32(16, 120);
    new DataView(png.buffer).setUint32(20, 80);
    expect(medirImagen(png)).toEqual({ w: 120, h: 80 });
  });

  it("lee el tamaño de un JPEG salteando los segmentos previos", () => {
    // SOI + APP0 de 4 bytes de payload + SOF0 con alto 200 y ancho 300.
    const jpeg = new Uint8Array([
      0xff, 0xd8,
      0xff, 0xe0, 0x00, 0x04, 0x00, 0x00,
      0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0xc8, 0x01, 0x2c,
    ]);
    expect(medirImagen(jpeg)).toEqual({ w: 300, h: 200 });
  });

  it("devuelve null con bytes que no son imagen", () => {
    expect(medirImagen(new Uint8Array([1, 2, 3, 4]))).toBeNull();
  });
});
