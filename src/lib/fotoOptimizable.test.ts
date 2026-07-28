import { describe, it, expect } from "vitest";
import { esOptimizable } from "./fotoOptimizable";

describe("esOptimizable", () => {
  it("acepta las fotos de Vercel Blob", () => {
    expect(esOptimizable("https://abc123.public.blob.vercel-storage.com/x/photo.png")).toBe(true);
  });

  it("acepta las miniaturas de MercadoLibre", () => {
    expect(esOptimizable("https://http2.mlstatic.com/D_NQ_NP_1-O.jpg")).toBe(true);
  });

  it("rechaza cualquier otro host", () => {
    // Si next/image recibe un host que no está en next.config.ts, la imagen no
    // carga: mejor servirla sin optimizar que dejar el hueco.
    expect(esOptimizable("https://ejemplo.com/foto.jpg")).toBe(false);
    expect(esOptimizable("https://blob.vercel-storage.com.atacante.com/x.png")).toBe(false);
  });

  it("rechaza http, porque la config sólo permite https", () => {
    expect(esOptimizable("http://http2.mlstatic.com/D_NQ_NP_1-O.jpg")).toBe(false);
  });

  it("rechaza data URLs, rutas relativas y vacíos sin explotar", () => {
    expect(esOptimizable("data:image/png;base64,AAAA")).toBe(false);
    expect(esOptimizable("/logo-ma.png")).toBe(false);
    expect(esOptimizable("")).toBe(false);
    expect(esOptimizable(null)).toBe(false);
    expect(esOptimizable(undefined)).toBe(false);
  });
});
