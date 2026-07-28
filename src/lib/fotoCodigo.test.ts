import { describe, it, expect } from "vitest";
import { claveCodigo } from "./claveCodigo";

describe("claveCodigo", () => {
  it("usa el código base: las variantes comparten foto", () => {
    expect(claveCodigo("48108-BEI-39")).toBe("48108");
    expect(claveCodigo("16214-NEG")).toBe("16214");
    expect(claveCodigo("13405")).toBe("13405");
  });

  it("saca el ' +N' de los ítems que agrupan varios códigos", () => {
    expect(claveCodigo("48108 +2")).toBe("48108");
    expect(claveCodigo("48108-BEI +3")).toBe("48108");
  });

  it("normaliza espacios y mayúsculas", () => {
    expect(claveCodigo("ab123-x")).toBe("AB123");
  });

  it("no recorta cuando la raíz no tiene números: 'pz-' es un prefijo genérico", () => {
    // Recortar dejaría "PZ" y "pz-espejo" compartiría foto con "pz-mesa".
    expect(claveCodigo("  pz-espejo ")).toBe("PZ-ESPEJO");
    expect(claveCodigo("pz-mesa")).toBe("PZ-MESA");
  });

  it("descarta lo que no es un código", () => {
    // Los ítems sin código se identifican con la descripción: cruzarles la foto
    // entre embarques distintos sería un error.
    expect(claveCodigo("Silla Eames acolchonada")).toBeNull();
    expect(claveCodigo("—")).toBeNull();
    expect(claveCodigo("-")).toBeNull();
    expect(claveCodigo("s/c")).toBeNull();
    expect(claveCodigo("")).toBeNull();
    expect(claveCodigo("   ")).toBeNull();
    expect(claveCodigo(null)).toBeNull();
    expect(claveCodigo(undefined)).toBeNull();
  });
});
