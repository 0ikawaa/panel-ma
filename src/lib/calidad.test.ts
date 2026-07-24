import { describe, it, expect } from "vitest";
import { objetivosDe, evaluarCalidad, CALIDAD_MAX } from "./calidad";
import type { MlItem } from "./mundoshop";

function item(over: Partial<MlItem>): MlItem {
  return {
    id: "MLU1",
    title: "Producto X",
    status: "active",
    sub_status: [],
    health: 1,
    price: 100,
    available_quantity: 10,
    sold_quantity: 5,
    listing_type: "gold_special",
    catalog_listing: false,
    permalink: "http://x",
    thumbnail: null,
    seller_sku: null,
    tags: ["good_quality_thumbnail", "good_quality_picture", "cart_eligible", "loyalty_discount_eligible"],
    ...over,
  };
}

describe("objetivosDe", () => {
  it("una publicación al máximo (health 1 + todos los tags buenos) no tiene objetivos", () => {
    expect(objetivosDe(item({ health: 1 }))).toHaveLength(0);
  });

  it("marca foto principal cuando falta good_quality_thumbnail", () => {
    const objs = objetivosDe(item({ tags: ["good_quality_picture", "cart_eligible", "loyalty_discount_eligible"] }));
    expect(objs.some((o) => o.code === "foto_principal")).toBe(true);
  });

  it("infracción es de severidad alta y va primero", () => {
    const objs = objetivosDe(item({ health: 0.8, tags: ["under_infractions", "good_quality_thumbnail", "good_quality_picture", "cart_eligible", "loyalty_discount_eligible"] }));
    expect(objs[0].code).toBe("infracciones");
    expect(objs[0].severidad).toBe("alta");
  });

  it("health por debajo del máximo agrega el objetivo de ficha técnica", () => {
    const objs = objetivosDe(item({ health: CALIDAD_MAX - 0.1 }));
    expect(objs.some((o) => o.code === "ficha")).toBe(true);
  });
});

describe("evaluarCalidad", () => {
  it("separa las que están al máximo de las que hay que mejorar", () => {
    const r = evaluarCalidad(
      [
        item({ id: "A", health: 1 }), // máxima
        item({ id: "B", health: 0.75, tags: ["cart_eligible"] }), // a mejorar
      ],
      "2026-07-24T00:00:00.000Z",
    );
    expect(r.summary.activas).toBe(2);
    expect(r.summary.maxima).toBe(1);
    expect(r.summary.aMejorar).toBe(1);
    expect(r.items).toHaveLength(1);
    expect(r.items[0].id).toBe("B");
  });

  it("ordena las que tienen infracción primero", () => {
    const r = evaluarCalidad(
      [
        item({ id: "sinInfra", health: 0.5, tags: [] }),
        item({ id: "conInfra", health: 0.9, tags: ["under_infractions", "good_quality_thumbnail", "good_quality_picture", "cart_eligible", "loyalty_discount_eligible"] }),
      ],
      "2026-07-24T00:00:00.000Z",
    );
    expect(r.items[0].id).toBe("conInfra");
    expect(r.summary.conInfracciones).toBe(1);
  });
});
