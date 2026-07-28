import { describe, it, expect } from "vitest";
import { csvCell, csvRow } from "./csv";

describe("csvCell", () => {
  it("entrecomilla siempre", () => {
    expect(csvCell("hola")).toBe('"hola"');
    expect(csvCell(42)).toBe('"42"');
  });

  it("no rompe la fila cuando el texto trae comas", () => {
    // Los títulos de MercadoLibre vienen llenos de comas.
    expect(csvCell("Zapatilla negra, talle 39")).toBe('"Zapatilla negra, talle 39"');
  });

  it("duplica las comillas de adentro", () => {
    expect(csvCell('Camisa 15"')).toBe('"Camisa 15"""');
  });

  it("los saltos de línea quedan dentro de la celda entrecomillada", () => {
    expect(csvCell("linea1\nlinea2")).toBe('"linea1\nlinea2"');
  });

  it("null y undefined salen como celda vacía", () => {
    expect(csvCell(null)).toBe('""');
    expect(csvCell(undefined)).toBe('""');
    expect(csvCell("")).toBe('""');
  });
});

describe("csvRow", () => {
  it("junta las celdas con comas", () => {
    expect(csvRow(["a", 1, null])).toBe('"a","1",""');
  });

  it("una fila con comas y comillas sigue teniendo las columnas que corresponde", () => {
    const fila = csvRow(["SKU-1", 'Buzo "oversize", gris', 1200]);
    expect(fila).toBe('"SKU-1","Buzo ""oversize"", gris","1200"');
  });
});
