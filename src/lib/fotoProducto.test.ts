import { describe, it, expect } from "vitest";
import {
  fotoMostrada,
  fotoParaSheets,
  fotoPorSku,
  indexarFotosPorCodigo,
  mapasVacios,
  renderizableEnSheets,
} from "./fotoProducto";
import type { MlPhotoMaps } from "./mundoshop";

const ML: MlPhotoMaps = {
  bySku: new Map([["16214-NEG", "https://ml/16214-neg.jpg"]]),
  byBase: new Map([["16214", "https://ml/16214.jpg"]]),
};

describe("fotoMostrada", () => {
  it("la foto manual le gana a la de MercadoLibre", () => {
    expect(
      fotoMostrada(
        { codigo: "16214-NEG", photo: "https://blob/mia.png", fotoManual: true },
        ML,
      ),
    ).toBe("https://blob/mia.png");
  });

  it("sin foto manual manda la de MercadoLibre por SKU y, si no, por código base", () => {
    expect(
      fotoMostrada({ codigo: "16214-NEG", photo: "https://blob/excel.png" }, ML),
    ).toBe("https://ml/16214-neg.jpg");
    expect(
      fotoMostrada({ codigo: "16214-BLA", photo: "https://blob/excel.png" }, ML),
    ).toBe("https://ml/16214.jpg");
  });

  it("sin foto de ML queda la del Excel", () => {
    expect(fotoMostrada({ codigo: "99999", photo: "https://blob/excel.png" }, ML)).toBe(
      "https://blob/excel.png",
    );
    expect(fotoMostrada({ codigo: "99999", photo: null }, ML)).toBeNull();
  });

  it("marcado como manual pero sin foto, sigue el orden normal", () => {
    // Quitar la foto a mano no puede dejar el ítem sin ninguna imagen si ML tiene una.
    expect(fotoMostrada({ codigo: "16214", photo: null, fotoManual: true }, ML)).toBe(
      "https://ml/16214.jpg",
    );
  });

  it("con los mapas vacíos siempre queda la guardada", () => {
    expect(
      fotoMostrada({ codigo: "16214", photo: "https://blob/excel.png" }, mapasVacios()),
    ).toBe("https://blob/excel.png");
  });
});

describe("fotoParaSheets", () => {
  it("si la manual es .webp baja a la de MercadoLibre, que sí se ve", () => {
    // Caso real: las fotos que se bajan de ML vienen en .webp y =IMAGE() las
    // deja en blanco. La de ML es la misma imagen en .jpg.
    const p = { codigo: "16214-NEG", photo: "https://blob/mia.webp", fotoManual: true };
    expect(fotoMostrada(p, ML)).toBe("https://blob/mia.webp");
    expect(fotoParaSheets(p, ML)).toBe("https://ml/16214-neg.jpg");
  });

  it("sin candidata renderizable devuelve null, no una celda rota", () => {
    expect(
      fotoParaSheets(
        { codigo: "99999", photo: "https://blob/mia.webp", fotoManual: true },
        ML,
      ),
    ).toBeNull();
    expect(
      fotoParaSheets({ codigo: "99999", photo: "data:image/png;base64,AA" }, ML),
    ).toBeNull();
  });

  it("con una foto manual que se ve, esa manda igual que en el panel", () => {
    const p = { codigo: "16214-NEG", photo: "https://blob/mia.png", fotoManual: true };
    expect(fotoParaSheets(p, ML)).toBe("https://blob/mia.png");
  });
});

describe("renderizableEnSheets", () => {
  it("acepta los formatos que muestra =IMAGE()", () => {
    expect(renderizableEnSheets("https://x/a.jpg")).toBe(true);
    expect(renderizableEnSheets("https://x/a.PNG")).toBe(true);
    expect(renderizableEnSheets("https://x/a.gif")).toBe(true);
    expect(renderizableEnSheets("https://x/a.bmp")).toBe(true);
  });

  it("rechaza .webp, los data URL y lo vacío", () => {
    expect(renderizableEnSheets("https://x/a.webp")).toBe(false);
    expect(renderizableEnSheets("data:image/png;base64,AAAA")).toBe(false);
    expect(renderizableEnSheets(null)).toBe(false);
    expect(renderizableEnSheets("")).toBe(false);
  });

  it("ignora la query al mirar la extensión y deja pasar lo que no la tiene", () => {
    expect(renderizableEnSheets("https://x/a.jpg?v=2")).toBe(true);
    expect(renderizableEnSheets("https://x/a.webp?v=2")).toBe(false);
    expect(renderizableEnSheets("https://http2.mlstatic.com/D_NQ_NP_1-O")).toBe(true);
  });
});

describe("fotoPorSku", () => {
  const idx = (ps: Parameters<typeof indexarFotosPorCodigo>[0]) => indexarFotosPorCodigo(ps);

  it("respeta la misma prioridad que la tabla: manual > ML > Excel", () => {
    const i = idx([{ codigo: "16214-NEG", photo: "https://blob/mia.png", fotoManual: true }]);
    expect(fotoPorSku(i, ML, "16214-NEG")).toBe("https://blob/mia.png");
  });

  it("una foto manual cargada en otra variante vale para todo el código base", () => {
    // Alguien corrigió la foto en el ítem "48108-BEI-39"; la venta llega como
    // "48108-NEG" y tiene que mostrar la misma.
    const i = idx([{ codigo: "48108-BEI-39", photo: "https://blob/mia.png", fotoManual: true }]);
    expect(fotoPorSku(i, ML, "48108-NEG")).toBe("https://blob/mia.png");
  });

  it("sin foto manual gana la de MercadoLibre, no la del Excel", () => {
    const i = idx([{ codigo: "16214-NEG", photo: "https://blob/excel.png" }]);
    expect(fotoPorSku(i, ML, "16214-NEG")).toBe("https://ml/16214-neg.jpg");
  });

  it("cae a la del Excel cuando ML no tiene nada", () => {
    const i = idx([{ codigo: "99999", photo: "https://blob/excel.png" }]);
    expect(fotoPorSku(i, ML, "99999")).toBe("https://blob/excel.png");
    expect(fotoPorSku(i, ML, "99999-ROJ")).toBe("https://blob/excel.png");
  });

  it("gana el embarque más reciente (el primero de la lista)", () => {
    const i = idx([
      { codigo: "70001", photo: "https://blob/nueva.png" },
      { codigo: "70001", photo: "https://blob/vieja.png" },
    ]);
    expect(fotoPorSku(i, ML, "70001")).toBe("https://blob/nueva.png");
  });

  it("una manual vieja le gana a una del Excel más nueva", () => {
    const i = idx([
      { codigo: "70002", photo: "https://blob/excel-nueva.png" },
      { codigo: "70002", photo: "https://blob/mia-vieja.png", fotoManual: true },
    ]);
    expect(fotoPorSku(i, ML, "70002")).toBe("https://blob/mia-vieja.png");
  });

  it("no se cuelga con SKU vacío, códigos raros o productos sin foto", () => {
    const i = idx([
      { codigo: null, photo: "https://blob/x.png" },
      { codigo: "s/c", photo: "https://blob/y.png" },
      { codigo: "70003", photo: null },
    ]);
    expect(fotoPorSku(i, ML, null)).toBeNull();
    expect(fotoPorSku(i, ML, "")).toBeNull();
    expect(fotoPorSku(i, ML, "70003")).toBeNull();
    expect(fotoPorSku(i, mapasVacios(), "s/c")).toBeNull();
  });

  it("encuentra el código sin importar mayúsculas", () => {
    const i = idx([{ codigo: "pz-espejo", photo: "https://blob/pz.png", fotoManual: true }]);
    expect(fotoPorSku(i, ML, "PZ-ESPEJO")).toBe("https://blob/pz.png");
  });
});
