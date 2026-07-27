import { describe, it, expect } from "vitest";
import {
  PESTANA_RESUMEN,
  buildSheetPayload,
  nombrePestanaUnico,
  sanitizarNombrePestana,
  type ContainerInput,
  type ProductoInput,
} from "./sheets";

function producto(over: Partial<ProductoInput> = {}): ProductoInput {
  return {
    rowIndex: 1,
    codigo: "16000",
    photo: null,
    unidades: 100,
    unidad: "pc",
    precioChina: 2,
    cantidadPorCaja: 10,
    cbmUnitario: 0.5,
    cbmTotal: 5,
    montoTotal: 200,
    remark: null,
    ...over,
  };
}

function contenedor(over: Partial<ContainerInput> = {}): ContainerInput {
  return {
    id: "c1",
    name: "Contenedor 1",
    supplier: null,
    eta: null,
    notes: null,
    totalPrice: null,
    freightCost: 6800,
    origin: "china",
    status: "transito",
    receivedAt: null,
    products: [producto()],
    ...over,
  };
}

describe("sanitizarNombrePestana", () => {
  it("saca los caracteres que Google Sheets no acepta", () => {
    expect(sanitizarNombrePestana("Cont [1] / Julio: *2026*?")).toBe(
      "Cont 1 Julio 2026",
    );
  });

  it("recorta a 90 y nunca devuelve vacío", () => {
    expect(sanitizarNombrePestana("x".repeat(200))).toHaveLength(90);
    expect(sanitizarNombrePestana("  ///  ")).toBe("Embarque");
  });

  it("saca comillas simples de los extremos", () => {
    expect(sanitizarNombrePestana("'Contenedor'")).toBe("Contenedor");
  });
});

describe("nombrePestanaUnico", () => {
  it("desambigua nombres repetidos", () => {
    const tomados = new Set<string>();
    expect(nombrePestanaUnico("Cont 1", tomados)).toBe("Cont 1");
    expect(nombrePestanaUnico("Cont 1", tomados)).toBe("Cont 1 (2)");
    expect(nombrePestanaUnico("Cont 1", tomados)).toBe("Cont 1 (3)");
  });

  it("no pisa la pestaña de resumen", () => {
    const tomados = new Set<string>([PESTANA_RESUMEN]);
    expect(nombrePestanaUnico(PESTANA_RESUMEN, tomados)).toBe(`${PESTANA_RESUMEN} (2)`);
  });
});

describe("buildSheetPayload", () => {
  it("marca como arribado lo que tiene receivedAt", () => {
    const p = buildSheetPayload([
      contenedor({ id: "a", name: "En camino" }),
      contenedor({ id: "b", name: "Llegó", receivedAt: new Date("2026-07-01") }),
    ]);
    const porId = Object.fromEntries(p.embarques.map((e) => [e.id, e]));
    expect(porId.a.arribado).toBe(false);
    expect(porId.b.arribado).toBe(true);
    expect(porId.b.estado).toBe("deposito");
    expect(p.enCamino).toBe(1);
    expect(p.arribados).toBe(1);
  });

  it("respeta receivedAt aunque el status haya quedado viejo", () => {
    // Mismo criterio que estadoEfectivo: la fecha manda sobre la columna.
    const [e] = buildSheetPayload([
      contenedor({ status: "produccion", receivedAt: new Date("2026-07-01") }),
    ]).embarques;
    expect(e.arribado).toBe(true);
  });

  it("ordena: en camino por ETA, después los arribados", () => {
    const p = buildSheetPayload([
      contenedor({ id: "recibido", name: "R", receivedAt: new Date("2026-06-01") }),
      contenedor({ id: "sin-eta", name: "S", eta: null }),
      contenedor({ id: "tarde", name: "T", eta: new Date("2026-09-01") }),
      contenedor({ id: "pronto", name: "P", eta: new Date("2026-08-01") }),
    ]);
    expect(p.embarques.map((e) => e.id)).toEqual([
      "pronto",
      "tarde",
      "sin-eta",
      "recibido",
    ]);
  });

  it("calcula el costo final nacionalizado por ítem", () => {
    // China: ((6800/68) * 0.05 + 2) * 1.33 * 1.22
    const [e] = buildSheetPayload([contenedor()]).embarques;
    expect(e.items[0].cbmUnitario).toBe(0.05);
    expect(e.items[0].costoFinal).toBeCloseTo(11.36, 2);
  });

  it("suma los totales del embarque", () => {
    const [e] = buildSheetPayload([
      contenedor({
        products: [
          producto({ rowIndex: 1, unidades: 100, cbmTotal: 5, montoTotal: 200 }),
          producto({ rowIndex: 2, unidades: 50, cbmTotal: 2.5, montoTotal: 100 }),
        ],
      }),
    ]).embarques;
    expect(e.totales).toEqual({ items: 2, unidades: 150, cbm: 7.5, monto: 300 });
  });

  it("no manda fotos en base64, solo URLs http", () => {
    // =IMAGE() de Sheets no renderiza data URLs; mandarlas solo infla el payload.
    const [e] = buildSheetPayload([
      contenedor({
        products: [
          producto({ rowIndex: 1, photo: "data:image/png;base64,AAAA" }),
          producto({ rowIndex: 2, photo: "https://x.public.blob.vercel-storage.com/a.png" }),
        ],
      }),
    ]).embarques;
    expect(e.items[0].foto).toBe("");
    expect(e.items[1].foto).toBe("https://x.public.blob.vercel-storage.com/a.png");
  });

  it("asigna una pestaña única por embarque", () => {
    const p = buildSheetPayload([
      contenedor({ id: "a", name: "Contenedor 1" }),
      contenedor({ id: "b", name: "Contenedor 1" }),
    ]);
    const pestanas = p.embarques.map((e) => e.pestana);
    expect(new Set(pestanas).size).toBe(2);
    expect(pestanas).toContain("Contenedor 1");
  });

  it("tolera un contenedor sin productos", () => {
    const [e] = buildSheetPayload([contenedor({ products: [] })]).embarques;
    expect(e.items).toEqual([]);
    expect(e.totales).toEqual({ items: 0, unidades: 0, cbm: 0, monto: 0 });
  });
});
