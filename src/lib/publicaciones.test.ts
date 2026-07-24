import { describe, it, expect } from "vitest";
import {
  motivoInactiva,
  buildInactivas,
  buildSinVentas,
  normalizePublicacionesParams,
  ventanaDias,
  ventanaDesde,
  PUBLICACIONES_DEFAULTS,
  type InactivaInput,
  type SinVentasInput,
} from "./publicaciones";

function inactiva(over: Partial<InactivaInput>): InactivaInput {
  return {
    id: "MLU1",
    titulo: "X",
    thumbnail: null,
    permalink: null,
    status: "paused",
    subStatus: ["out_of_stock"],
    mlDisponible: 0,
    vendidas: 100,
    skus: ["20105"],
    stockOdoo: 8,
    enCamino: 0,
    ...over,
  };
}

describe("motivoInactiva", () => {
  it("out_of_stock → sin-stock", () => {
    expect(motivoInactiva("paused", ["out_of_stock"]).motivo).toBe("sin-stock");
  });
  it("paused_by_seller → pausada-vendedor", () => {
    expect(motivoInactiva("paused", ["paused_by_seller"]).motivo).toBe("pausada-vendedor");
  });
  it("status closed → cerrada", () => {
    expect(motivoInactiva("closed", []).motivo).toBe("cerrada");
  });
  it("sin sub_status → otra", () => {
    expect(motivoInactiva("paused", []).motivo).toBe("otra");
  });
});

describe("buildInactivas", () => {
  it("sólo incluye inactivas con stock Odoo > 0", () => {
    const out = buildInactivas([
      inactiva({ id: "conStock", stockOdoo: 5 }),
      inactiva({ id: "sinStock", stockOdoo: 0 }),
      inactiva({ id: "sinMapa", stockOdoo: null }),
    ]);
    expect(out.map((o) => o.id)).toEqual(["conStock"]);
  });

  it("la explicación de out_of_stock con stock indica reponer", () => {
    const [it] = buildInactivas([inactiva({ subStatus: ["out_of_stock"], stockOdoo: 8 })]);
    expect(it.explicacion).toMatch(/repon|republic/i);
    expect(it.accionable).toBe(true);
  });

  it("ordena por más stock inmovilizado primero", () => {
    const out = buildInactivas([inactiva({ id: "a", stockOdoo: 3 }), inactiva({ id: "b", stockOdoo: 20 })]);
    expect(out[0].id).toBe("b");
  });
});

function sinVenta(over: Partial<SinVentasInput>): SinVentasInput {
  return {
    id: "MLU1",
    titulo: "X",
    thumbnail: null,
    permalink: null,
    mlDisponible: 4,
    vendidas: 50,
    skus: ["20105"],
    stockOdoo: 10,
    ventasVentana: 0,
    ultimaVenta: "2026-05-01",
    ...over,
  };
}

describe("buildSinVentas", () => {
  const now = new Date("2026-07-24T12:00:00.000Z");

  it("excluye las que vendieron algo en la ventana", () => {
    const out = buildSinVentas([sinVenta({ id: "vendio", ventasVentana: 2 }), sinVenta({ id: "no", ventasVentana: 0 })], now);
    expect(out.map((o) => o.id)).toEqual(["no"]);
  });

  it("usa stock de Odoo cuando está y marca conStock", () => {
    const [it] = buildSinVentas([sinVenta({ stockOdoo: 10, mlDisponible: 2 })], now);
    expect(it.stock).toBe(10);
    expect(it.stockOrigen).toBe("odoo");
    expect(it.conStock).toBe(true);
  });

  it("cae al disponible de ML si no hay SKU mapeado", () => {
    const [it] = buildSinVentas([sinVenta({ stockOdoo: null, mlDisponible: 3, skus: [] })], now);
    expect(it.stock).toBe(3);
    expect(it.stockOrigen).toBe("ml");
  });

  it("ordena las con stock primero", () => {
    const out = buildSinVentas(
      [sinVenta({ id: "sin", stockOdoo: 0, mlDisponible: 0 }), sinVenta({ id: "con", stockOdoo: 5 })],
      now,
    );
    expect(out[0].id).toBe("con");
  });
});

describe("params y ventana", () => {
  it("normaliza defaults", () => {
    expect(normalizePublicacionesParams(null)).toEqual(PUBLICACIONES_DEFAULTS);
  });
  it("recorta cantidades inválidas", () => {
    expect(normalizePublicacionesParams({ ventanaUnidad: "semana", ventanaCantidad: 999 }).ventanaCantidad).toBe(52);
    expect(normalizePublicacionesParams({ ventanaUnidad: "mes", ventanaCantidad: 0 }).ventanaCantidad).toBe(PUBLICACIONES_DEFAULTS.ventanaCantidad);
  });
  it("ventanaDias: 2 meses ≈ 61 días", () => {
    expect(ventanaDias({ ventanaUnidad: "mes", ventanaCantidad: 2 })).toBe(61);
  });
  it("ventanaDesde resta los días correctos", () => {
    const desde = ventanaDesde({ ventanaUnidad: "semana", ventanaCantidad: 1 }, new Date("2026-07-24T12:00:00.000Z"));
    expect(desde).toBe("2026-07-17");
  });
});
