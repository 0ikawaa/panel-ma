import { describe, expect, it } from "vitest";
import { reindexarAlFinal, sanitizarIds } from "./moverProductos";

describe("sanitizarIds", () => {
  it("deja los strings no vacíos, sin repetidos y en orden", () => {
    expect(sanitizarIds(["b", "a", "b", " c ", "", "  "])).toEqual(["b", "a", "c"]);
  });

  it("descarta lo que no sea un array de strings", () => {
    expect(sanitizarIds(null)).toEqual([]);
    expect(sanitizarIds("abc")).toEqual([]);
    expect(sanitizarIds([1, {}, null, "ok"])).toEqual(["ok"]);
  });
});

describe("reindexarAlFinal", () => {
  it("los pone al final del destino conservando el orden del origen", () => {
    const movidos = reindexarAlFinal(
      [
        { id: "c", rowIndex: 9 },
        { id: "a", rowIndex: 3 },
        { id: "b", rowIndex: 7 },
      ],
      12,
    );
    expect(movidos).toEqual([
      { id: "a", rowIndex: 13 },
      { id: "b", rowIndex: 14 },
      { id: "c", rowIndex: 15 },
    ]);
  });

  it("arranca en 1 cuando el destino está vacío", () => {
    expect(reindexarAlFinal([{ id: "a", rowIndex: 5 }], 0)).toEqual([
      { id: "a", rowIndex: 1 },
    ]);
  });

  it("desempata por id para que el orden sea siempre el mismo", () => {
    const movidos = reindexarAlFinal(
      [
        { id: "z", rowIndex: 4 },
        { id: "a", rowIndex: 4 },
      ],
      0,
    );
    expect(movidos.map((m) => m.id)).toEqual(["a", "z"]);
  });

  it("no toca el array que recibe", () => {
    const items = [
      { id: "b", rowIndex: 2 },
      { id: "a", rowIndex: 1 },
    ];
    reindexarAlFinal(items, 0);
    expect(items.map((i) => i.id)).toEqual(["b", "a"]);
  });
});
