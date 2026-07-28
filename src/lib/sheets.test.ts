import { describe, it, expect } from "vitest";
import {
  PESTANA_RESUMEN,
  buildSheetPayload,
  diasHasta,
  nombreParaPlanilla,
  nombrePestanaUnico,
  origenDe,
  sanitizarNombrePestana,
  type ContainerInput,
  type ProductoInput,
} from "./sheets";

function producto(over: Partial<ProductoInput> = {}): ProductoInput {
  return {
    codigo: "16000",
    photo: null,
    unidades: 100,
    remark: null,
    ...over,
  };
}

function contenedor(over: Partial<ContainerInput> = {}): ContainerInput {
  return {
    id: "c1",
    name: "Contenedor 1",
    eta: null,
    notes: null,
    status: "transito",
    receivedAt: null,
    products: [producto()],
    ...over,
  };
}

const HOY = new Date("2026-07-27T13:00:00Z");

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

describe("origenDe", () => {
  it("solo 'brasil' es Brasil; lo demás (incluso vacío) es China", () => {
    expect(origenDe("brasil")).toBe("brasil");
    expect(origenDe(" BRASIL ")).toBe("brasil");
    expect(origenDe("china")).toBe("china");
    expect(origenDe(null)).toBe("china");
    expect(origenDe(undefined)).toBe("china");
  });
});

describe("nombreParaPlanilla", () => {
  it("marca los de Brasil con - BR", () => {
    expect(nombreParaPlanilla("Trevisul 1993", "brasil")).toBe("Trevisul 1993 - BR");
  });

  it("no toca los de China", () => {
    expect(nombreParaPlanilla("Contenedor 32", "china")).toBe("Contenedor 32");
    expect(nombreParaPlanilla("Contenedor 32", null)).toBe("Contenedor 32");
  });

  it("no repite la marca si el nombre ya la trae", () => {
    expect(nombreParaPlanilla("Trevisul - BR", "brasil")).toBe("Trevisul - BR");
    expect(nombreParaPlanilla("Trevisul (BR)", "brasil")).toBe("Trevisul (BR)");
    expect(nombreParaPlanilla("Trevisul br", "brasil")).toBe("Trevisul br");
  });
});

describe("diasHasta", () => {
  it("cuenta días de calendario, ignorando la hora", () => {
    // La ETA a las 00:00 y "hoy" a las 13:00 siguen siendo el mismo día.
    expect(diasHasta(new Date("2026-07-27T00:00:00Z"), HOY)).toBe(0);
    expect(diasHasta(new Date("2026-07-28T00:00:00Z"), HOY)).toBe(1);
    expect(diasHasta(new Date("2026-08-26T00:00:00Z"), HOY)).toBe(30);
  });

  it("devuelve negativo cuando la fecha ya pasó", () => {
    expect(diasHasta(new Date("2026-07-25T00:00:00Z"), HOY)).toBe(-2);
  });

  it("de noche sigue contando desde el día uruguayo, no el UTC", () => {
    // 22:00 del 27 en Montevideo: en UTC ya es el 28, pero faltan 3 días.
    const deNoche = new Date("2026-07-28T01:00:00Z");
    expect(diasHasta(new Date("2026-07-30T00:00:00Z"), deNoche)).toBe(3);
    expect(diasHasta(new Date("2026-07-27T00:00:00Z"), deNoche)).toBe(0);
  });

  it("devuelve null sin ETA o con fecha inválida", () => {
    expect(diasHasta(null, HOY)).toBeNull();
    expect(diasHasta("no es fecha", HOY)).toBeNull();
  });
});

describe("buildSheetPayload", () => {
  it("marca como arribado lo que tiene receivedAt", () => {
    const p = buildSheetPayload(
      [
        contenedor({ id: "a", name: "En camino" }),
        contenedor({ id: "b", name: "Llegó", receivedAt: new Date("2026-07-01") }),
      ],
      HOY,
    );
    const porId = Object.fromEntries(p.embarques.map((e) => [e.id, e]));
    expect(porId.a.arribado).toBe(false);
    expect(porId.b.arribado).toBe(true);
    expect(porId.b.estado).toBe("deposito");
    expect(p.enCamino).toBe(1);
    expect(p.arribados).toBe(1);
  });

  it("respeta receivedAt aunque el status haya quedado viejo", () => {
    const [e] = buildSheetPayload(
      [contenedor({ status: "produccion", receivedAt: new Date("2026-07-01") })],
      HOY,
    ).embarques;
    expect(e.arribado).toBe(true);
  });

  it("no cuenta días para llegar de algo ya recibido", () => {
    const [e] = buildSheetPayload(
      [contenedor({ eta: new Date("2026-08-10"), receivedAt: new Date("2026-07-01") })],
      HOY,
    ).embarques;
    expect(e.diasParaLlegar).toBeNull();
  });

  it("calcula los días que faltan para la ETA", () => {
    const p = buildSheetPayload(
      [
        contenedor({ id: "manana", eta: new Date("2026-07-28T00:00:00Z") }),
        contenedor({ id: "vencido", eta: new Date("2026-07-20T00:00:00Z") }),
        contenedor({ id: "sin-eta", eta: null }),
      ],
      HOY,
    );
    const porId = Object.fromEntries(p.embarques.map((e) => [e.id, e]));
    expect(porId.manana.diasParaLlegar).toBe(1);
    expect(porId.vencido.diasParaLlegar).toBe(-7);
    expect(porId["sin-eta"].diasParaLlegar).toBeNull();
  });

  it("ordena: en camino por ETA, después los arribados", () => {
    const p = buildSheetPayload(
      [
        contenedor({ id: "recibido", name: "R", receivedAt: new Date("2026-06-01") }),
        contenedor({ id: "sin-eta", name: "S", eta: null }),
        contenedor({ id: "tarde", name: "T", eta: new Date("2026-09-01") }),
        contenedor({ id: "pronto", name: "P", eta: new Date("2026-08-01") }),
      ],
      HOY,
    );
    expect(p.embarques.map((e) => e.id)).toEqual([
      "pronto",
      "tarde",
      "sin-eta",
      "recibido",
    ]);
  });

  it("expone sólo código, foto, cantidad y observaciones", () => {
    // El feed es deliberadamente no comercial: si alguna vez vuelve a aparecer
    // un precio o un costo acá, este test tiene que fallar.
    const [e] = buildSheetPayload(
      [contenedor({ products: [producto({ remark: "Sin caja" })] })],
      HOY,
    ).embarques;
    expect(Object.keys(e.items[0]).sort()).toEqual([
      "cantidad",
      "codigo",
      "foto",
      "observaciones",
    ]);
    expect(JSON.stringify(e)).not.toMatch(/precio|costo|monto|cbm|flete|fob/i);
  });

  it("suma los totales del embarque", () => {
    const [e] = buildSheetPayload(
      [
        contenedor({
          products: [producto({ unidades: 100 }), producto({ unidades: 50 })],
        }),
      ],
      HOY,
    ).embarques;
    expect(e.totales).toEqual({ items: 2, unidades: 150 });
  });

  it("no manda fotos en base64, solo URLs http", () => {
    // =IMAGE() de Sheets no renderiza data URLs; mandarlas solo infla el payload.
    const [e] = buildSheetPayload(
      [
        contenedor({
          products: [
            producto({ photo: "data:image/png;base64,AAAA" }),
            producto({ photo: "https://x.public.blob.vercel-storage.com/a.png" }),
          ],
        }),
      ],
      HOY,
    ).embarques;
    expect(e.items[0].foto).toBe("");
    expect(e.items[1].foto).toBe("https://x.public.blob.vercel-storage.com/a.png");
  });

  it("no manda fotos .webp: =IMAGE() no las renderiza", () => {
    const [e] = buildSheetPayload(
      [
        contenedor({
          products: [
            producto({ photo: "https://x.public.blob.vercel-storage.com/a.webp" }),
            producto({ photo: "https://http2.mlstatic.com/D_NQ_NP_1-O.jpg" }),
          ],
        }),
      ],
      HOY,
    ).embarques;
    expect(e.items[0].foto).toBe("");
    expect(e.items[1].foto).toBe("https://http2.mlstatic.com/D_NQ_NP_1-O.jpg");
  });

  it("marca el origen y le agrega - BR al nombre y a la pestaña de los de Brasil", () => {
    const p = buildSheetPayload(
      [
        contenedor({ id: "br", name: "Trevisul 1993", origin: "brasil" }),
        contenedor({ id: "cn", name: "Contenedor 32", origin: "china" }),
      ],
      HOY,
    );
    const porId = Object.fromEntries(p.embarques.map((e) => [e.id, e]));
    expect(porId.br.origen).toBe("brasil");
    expect(porId.br.origenLabel).toContain("Brasil");
    expect(porId.br.nombre).toBe("Trevisul 1993 - BR");
    expect(porId.br.pestana).toBe("Trevisul 1993 - BR");
    expect(porId.cn.origen).toBe("china");
    expect(porId.cn.origenLabel).toContain("China");
    expect(porId.cn.nombre).toBe("Contenedor 32");
  });

  it("asigna una pestaña única por embarque", () => {
    const p = buildSheetPayload(
      [
        contenedor({ id: "a", name: "Contenedor 1" }),
        contenedor({ id: "b", name: "Contenedor 1" }),
      ],
      HOY,
    );
    const pestanas = p.embarques.map((e) => e.pestana);
    expect(new Set(pestanas).size).toBe(2);
    expect(pestanas).toContain("Contenedor 1");
  });

  it("tolera un contenedor sin productos", () => {
    const [e] = buildSheetPayload([contenedor({ products: [] })], HOY).embarques;
    expect(e.items).toEqual([]);
    expect(e.totales).toEqual({ items: 0, unidades: 0 });
  });
});
