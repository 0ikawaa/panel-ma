import { describe, it, expect } from "vitest";
import {
  estadoAnterior,
  estadoEfectivo,
  faltantes,
  isBlobUrl,
  isDocType,
  isEstado,
} from "./embarques";

describe("estadoEfectivo", () => {
  it("usa la columna status cuando no está recibido", () => {
    expect(estadoEfectivo({ status: "transito", receivedAt: null })).toBe("transito");
  });

  it("manda receivedAt por encima de status", () => {
    // Un contenedor recibido siempre va a la columna "en depósito", aunque la
    // columna status haya quedado vieja.
    expect(estadoEfectivo({ status: "produccion", receivedAt: new Date() })).toBe("deposito");
  });

  it("cae en produccion si el status es desconocido o falta", () => {
    expect(estadoEfectivo({ status: null, receivedAt: null })).toBe("produccion");
    expect(estadoEfectivo({ status: "cualquiera", receivedAt: null })).toBe("produccion");
    expect(estadoEfectivo({})).toBe("produccion");
  });
});

describe("estadoAnterior", () => {
  it("retrocede una etapa", () => {
    expect(estadoAnterior("deposito")).toBe("aduana");
    expect(estadoAnterior("embarcado")).toBe("produccion");
  });

  it("no retrocede más allá de la primera", () => {
    expect(estadoAnterior("produccion")).toBe("produccion");
  });
});

describe("faltantes", () => {
  it("no exige nada mientras está en producción", () => {
    expect(faltantes("produccion", [])).toEqual([]);
  });

  it("exige factura y packing al embarcar", () => {
    expect(faltantes("embarcado", [])).toEqual(["factura", "packing"]);
    expect(faltantes("embarcado", ["factura"])).toEqual(["packing"]);
    expect(faltantes("embarcado", ["factura", "packing"])).toEqual([]);
  });

  it("suma el BL en tránsito y el DUA al llegar al depósito", () => {
    expect(faltantes("transito", ["factura", "packing"])).toEqual(["bl"]);
    expect(faltantes("deposito", ["factura", "packing", "bl"])).toEqual(["dua"]);
  });

  it("ignora los documentos que no son obligatorios", () => {
    expect(faltantes("embarcado", ["otro", "seguro"])).toEqual(["factura", "packing"]);
  });
});

describe("validaciones", () => {
  it("reconoce estados y tipos de documento válidos", () => {
    expect(isEstado("aduana")).toBe(true);
    expect(isEstado("perdido")).toBe(false);
    expect(isDocType("dua")).toBe(true);
    expect(isDocType("contrato")).toBe(false);
  });

  it("solo acepta URLs https de Vercel Blob", () => {
    expect(isBlobUrl("https://abc123.public.blob.vercel-storage.com/x.pdf")).toBe(true);
    expect(isBlobUrl("http://abc123.public.blob.vercel-storage.com/x.pdf")).toBe(false);
    expect(isBlobUrl("https://evil.com/x.pdf")).toBe(false);
    expect(isBlobUrl("no-es-una-url")).toBe(false);
  });
});
