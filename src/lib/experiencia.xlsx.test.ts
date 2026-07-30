import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { evaluarExperiencia, normalizeExperienciaParams, parseCaptura } from "./experiencia";
import { COLUMNAS_POR_SKU, experienciaWorkbook, experienciaXlsxBuffer } from "./experiencia.xlsx";

const SOLUCION =
  "Revisa que lo que te compraron coincida con lo que envías, verifica que todo esté completo y que el embalaje esté en buen estado.";

function captura(over: Record<string, unknown> = {}, ml: Record<string, unknown> | null = {}) {
  return {
    id: "MLU1",
    titulo: "Ropero 3 Puertas Corredizas Bariloche",
    sku: "16214-BLA",
    estado: "active",
    catalogo: true,
    stock: "161 u.",
    precio: "$ 12.990",
    cal: 93,
    exp: 30,
    url: "https://www.mercadolibre.com.uy/publicaciones/MLU1/modificar",
    ...over,
    ...(ml === null
      ? {}
      : {
          ml: {
            score: 30,
            nivel: "Mala",
            resumen:
              "En los últimos 180 días hiciste 422 ventas y tuviste 17 problemas. Revisa los consejos sobre cómo mejorar.",
            aviso: "Podríamos anular tu publicación si continúa brindando mala experiencia.",
            dist: ["Con el producto entregado: 100%"],
            problemas: [
              {
                codigo: "good_packing_but_missing_accessories",
                categoria: "Faltaban partes o accesorios del producto",
                detalle: "El embalaje llegó bien pero faltaban partes o accesorios del producto",
                cantidad: "17 problemas",
                principal: true,
                reclamos: 17,
                cancelaciones: 2,
                solucion: SOLUCION,
                accion: "Modificar publicación",
              },
            ],
            ...ml,
          },
        }),
  };
}

const armar = (crudos: Record<string, unknown>[] = [captura()], extra = {}) => ({
  ...evaluarExperiencia(parseCaptura(crudos), {
    capturadoEn: "2026-07-29T20:53:00.000Z",
    generadoEn: "2026-07-30T12:00:00.000Z",
    params: normalizeExperienciaParams(null),
  }),
  ...extra,
});

/** Lee una hoja del workbook como matriz, igual que la vería Excel. */
const hoja = (wb: XLSX.WorkBook, nombre: string): string[][] =>
  XLSX.utils.sheet_to_json(wb.Sheets[nombre], { header: 1, defval: "", raw: false });

describe("experienciaWorkbook", () => {
  it("arma las dos hojas", () => {
    expect(experienciaWorkbook(armar()).SheetNames).toEqual(["Por SKU", "Resumen"]);
  });

  it("la hoja por SKU tiene los títulos y una fila por SKU", () => {
    const filas = hoja(experienciaWorkbook(armar()), "Por SKU");
    expect(filas[0]).toEqual(COLUMNAS_POR_SKU);
    expect(filas).toHaveLength(2); // títulos + 1 SKU
  });

  it("pone los datos que se piden en la fila: SKU, ventas, problema y consejo", () => {
    const [, fila] = hoja(experienciaWorkbook(armar()), "Por SKU");
    const col = (nombre: string) => fila[COLUMNAS_POR_SKU.indexOf(nombre)];
    expect(col("Semáforo")).toContain("Rojo");
    expect(col("SKU")).toBe("16214-BLA");
    expect(col("Reclamos")).toBe("17");
    expect(col("Ventas 180 d")).toBe("422");
    expect(col("Problema principal")).toBe("Faltaban partes o accesorios del producto");
    expect(col("Cómo mejorar — según Mercado Libre")).toBe(SOLUCION);
    expect(col("Nivel ML")).toBe("Mala");
    expect(col("Cancelaciones")).toBe("2");
    expect(col("Link")).toContain("mercadolibre");
  });

  it("marca las publicaciones sin SKU en vez de dejar la celda vacía", () => {
    const [, fila] = hoja(experienciaWorkbook(armar([captura({ sku: "" })])), "Por SKU");
    expect(fila[COLUMNAS_POR_SKU.indexOf("SKU")]).toBe("(sin SKU)");
  });

  it("deja el autofiltro cubriendo los títulos y todas las filas", () => {
    const wb = experienciaWorkbook(armar([captura(), captura({ id: "MLU2", sku: "OTRO" })]));
    expect(wb.Sheets["Por SKU"]["!autofilter"]).toEqual({ ref: "A1:Q3" });
  });

  it("el resumen trae el semáforo, los totales y el ranking con el consejo", () => {
    const texto = hoja(experienciaWorkbook(armar()), "Resumen")
      .map((f) => f.join(" | "))
      .join("\n");
    expect(texto).toContain("Total de reclamos (180 días) | 17");
    expect(texto).toContain("SKU con reclamos | 1");
    expect(texto).toContain("Problema principal por SKU");
    expect(texto).toContain(SOLUCION);
    expect(texto).toContain("Cómo se agrupó");
  });

  it("el resumen dice qué quedó afuera y los números cierran", () => {
    // 1 a mejorar + 1 sin puntaje (el -1) + 1 ya en 100 = 3 capturadas.
    const wb = experienciaWorkbook(
      armar([
        captura(),
        captura({ id: "MLU2", sku: "B", exp: -1 }, null),
        captura({ id: "MLU3", sku: "C", exp: 100 }, null),
      ]),
    );
    const texto = hoja(wb, "Resumen").map((f) => f.join(" | ")).join("\n");
    expect(texto).toContain("de 3 revisadas");
    expect(texto).toContain("Publicaciones sin puntaje (ML no lo calcula sin ventas en 180 días) | 1");
    expect(texto).toContain("Publicaciones ya en 100 % | 1");
  });

  it("agrega la comparación con la captura anterior sólo si hubo una", () => {
    const sin = hoja(experienciaWorkbook(armar()), "Resumen").map((f) => f.join()).join("\n");
    expect(sin).not.toContain("Cambios contra la captura anterior");

    const con = hoja(
      experienciaWorkbook(
        armar([captura()], {
          comparadoCon: { capturadoEn: "2026-07-22T20:00:00.000Z" },
          cambios: [
            {
              clave: "16214-BLA",
              sku: "16214-BLA",
              titulo: "Ropero",
              url: null,
              reclamosAntes: 12,
              reclamos: 17,
              deltaReclamos: 5,
              experienciaAntes: 65,
              experiencia: 30,
              deltaExperiencia: -35,
              nivelAntes: "Media",
              nivel: "Mala",
              problemaPrincipal: "Faltaban partes o accesorios del producto",
              comoMejorar: SOLUCION,
              nuevo: false,
              cayoEnRojo: true,
            },
          ],
        }),
      ),
      "Resumen",
    )
      .map((f) => f.join(" | "))
      .join("\n");
    expect(con).toContain("Cambios contra la captura anterior");
    expect(con).toContain("SKU que empeoraron | 1");
    expect(con).toContain("16214-BLA | 12 | 17");
  });

  it("aguanta un reporte sin ningún SKU", () => {
    const wb = experienciaWorkbook(armar([captura({ exp: 100 }, null)]));
    expect(hoja(wb, "Por SKU")).toHaveLength(1); // sólo los títulos
    expect(wb.Sheets["Por SKU"]["!autofilter"]).toEqual({ ref: "A1:Q1" });
  });

  it("el buffer que se descarga se puede volver a abrir", () => {
    const buf = experienciaXlsxBuffer(armar());
    const releido = XLSX.read(buf);
    expect(releido.SheetNames).toEqual(["Por SKU", "Resumen"]);
    expect(hoja(releido, "Por SKU")[1][2]).toBe("16214-BLA");
  });
});
