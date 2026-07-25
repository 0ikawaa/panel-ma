import { describe, it, expect } from "vitest";
import { objetivosDe, evaluarCalidad, CALIDAD_MAX } from "./calidad";
import type { MlItemDetail } from "./mundoshop";

// Item "perfecto" por defecto: sin ningún objetivo (ni calidad ni oportunidad).
function item(over: Partial<MlItemDetail>): MlItemDetail {
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
    catalog_listing: true,
    permalink: "http://x",
    thumbnail: null,
    seller_sku: null,
    tags: ["good_quality_thumbnail", "good_quality_picture", "cart_eligible", "loyalty_discount_eligible"],
    original_price: null,
    currency: "UYU",
    condition: "new",
    catalog_product_id: null,
    visits_30d: 0,
    photos_count: 8,
    photos_min_resolution: 1200,
    has_video: true,
    free_shipping: true,
    warranty: null,
    attributes_count: 30,
    description_length: 500,
    date_created: null,
    issues: [],
    ...over,
  };
}

describe("objetivosDe", () => {
  it("una publicación perfecta no tiene objetivos", () => {
    expect(objetivosDe(item({}))).toHaveLength(0);
  });

  it("marca foto principal cuando falta good_quality_thumbnail", () => {
    const objs = objetivosDe(item({ tags: ["good_quality_picture", "cart_eligible", "loyalty_discount_eligible"] }));
    expect(objs.some((o) => o.code === "foto_principal" && o.categoria === "calidad")).toBe(true);
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

  it("fotos: incluye la resolución mínima real en el label", () => {
    const objs = objetivosDe(item({ photos_min_resolution: 500, tags: ["good_quality_thumbnail", "cart_eligible", "loyalty_discount_eligible"] }));
    const fotos = objs.find((o) => o.code === "fotos");
    expect(fotos).toBeTruthy();
    expect(fotos!.label).toContain("500px");
  });

  it("detecta sin envío gratis, sin video y fuera de catálogo como oportunidades", () => {
    const objs = objetivosDe(item({ free_shipping: false, has_video: false, catalog_listing: false }));
    const codes = objs.filter((o) => o.categoria === "oportunidad").map((o) => o.code);
    expect(codes).toEqual(expect.arrayContaining(["envio_gratis", "video", "catalogo"]));
  });

  it("catálogo sube a media cuando existe catalog_product_id (Buy Box)", () => {
    const conFicha = objetivosDe(item({ catalog_listing: false, catalog_product_id: "MLU-PROD-1" })).find((o) => o.code === "catalogo");
    const sinFicha = objetivosDe(item({ catalog_listing: false, catalog_product_id: null })).find((o) => o.code === "catalogo");
    expect(conFicha!.severidad).toBe("media");
    expect(sinFicha!.severidad).toBe("baja");
  });

  it("los objetivos de calidad van antes que los de oportunidad", () => {
    const objs = objetivosDe(item({ health: 0.5, free_shipping: false, tags: ["good_quality_thumbnail", "good_quality_picture", "cart_eligible", "loyalty_discount_eligible"] }));
    const primeraOport = objs.findIndex((o) => o.categoria === "oportunidad");
    const ultimaCalidad = objs.map((o) => o.categoria).lastIndexOf("calidad");
    expect(ultimaCalidad).toBeLessThan(primeraOport);
  });
});

describe("evaluarCalidad", () => {
  it("separa las que están al máximo (health) de las que tienen objetivos de calidad", () => {
    const r = evaluarCalidad(
      [
        item({ id: "A", health: 1 }), // máxima (sin gaps de calidad)
        item({ id: "B", health: 0.75, tags: ["cart_eligible"] }), // a mejorar
      ],
      "2026-07-24T00:00:00.000Z",
    );
    expect(r.summary.activas).toBe(2);
    expect(r.summary.maxima).toBe(1);
    expect(r.summary.aMejorar).toBe(1);
    expect(r.items.map((i) => i.id)).toContain("B");
  });

  it("una oportunidad (sin video) no descuenta del 'al máximo' pero sí aparece en la lista", () => {
    const r = evaluarCalidad([item({ id: "A", has_video: false })], "2026-07-24T00:00:00.000Z");
    expect(r.summary.maxima).toBe(1); // sigue al máximo de calidad
    expect(r.summary.sinVideo).toBe(1);
    expect(r.items).toHaveLength(1); // pero se lista por la oportunidad
    expect(r.items[0].objetivos.every((o) => o.categoria === "oportunidad")).toBe(true);
  });

  it("prioriza la publicación con más visitas cuando el resto es igual", () => {
    const r = evaluarCalidad(
      [
        item({ id: "pocasVisitas", health: 0.7, tags: ["good_quality_thumbnail", "good_quality_picture", "cart_eligible", "loyalty_discount_eligible"], visits_30d: 5 }),
        item({ id: "muchasVisitas", health: 0.7, tags: ["good_quality_thumbnail", "good_quality_picture", "cart_eligible", "loyalty_discount_eligible"], visits_30d: 5000 }),
      ],
      "2026-07-24T00:00:00.000Z",
    );
    expect(r.items[0].id).toBe("muchasVisitas");
  });

  it("ordena las que tienen infracción primero", () => {
    const r = evaluarCalidad(
      [
        item({ id: "sinInfra", health: 0.5, tags: [] }),
        item({ id: "conInfra", health: 0.9, visits_30d: 1, tags: ["under_infractions", "good_quality_thumbnail", "good_quality_picture", "cart_eligible", "loyalty_discount_eligible"] }),
      ],
      "2026-07-24T00:00:00.000Z",
    );
    expect(r.items[0].id).toBe("conInfra");
    expect(r.summary.conInfracciones).toBe(1);
  });

  it("acumula visitas en riesgo sólo de las que tienen gaps de calidad", () => {
    const r = evaluarCalidad(
      [
        item({ id: "gapCalidad", health: 0.6, visits_30d: 100, tags: ["good_quality_thumbnail", "good_quality_picture", "cart_eligible", "loyalty_discount_eligible"] }),
        item({ id: "soloOport", health: 1, visits_30d: 999, has_video: false }),
      ],
      "2026-07-24T00:00:00.000Z",
    );
    expect(r.summary.visitasEnRiesgo).toBe(100);
  });
});
