import { describe, it, expect } from "vitest";
import {
  agregarLineas,
  calcularLineas,
  cbmCajaDesdeUnidad,
  montoLinea,
  sanitizeDetalle,
  type LineaEditable,
} from "./productEdit";
import { cbmPorUnidad } from "./cost";

function linea(over: Partial<LineaEditable> = {}): LineaEditable {
  return {
    codigos: ["16000"],
    unidades: 100,
    precioChina: 2,
    cbmTotal: 5,
    remark: null,
    ...over,
  };
}

describe("montoLinea", () => {
  it("multiplica unidades por precio unitario", () => {
    expect(montoLinea(100, 2)).toBe(200);
    expect(montoLinea(620, 0.8)).toBe(496);
  });

  it("redondea a dos decimales", () => {
    expect(montoLinea(110, 11.317)).toBe(1244.87);
  });

  it("distingue 'sin precio' de 'precio cero'", () => {
    // El item 20112 de la base tiene precio 0: calcular da 0, no null.
    expect(montoLinea(160, 0)).toBe(0);
    expect(montoLinea(160, null)).toBeNull();
    expect(montoLinea(null, 5)).toBeNull();
  });

  it("no redondea a centavos: eso corre el total del ítem", () => {
    // Los montos guardados se sumaron con precisión completa (hay productos con
    // 3 decimales). Redondear cada línea a 2 y recién después sumar movía el
    // total de dos productos reales. El redondeo a centavos va una sola vez,
    // sobre el agregado.
    expect(montoLinea(3, 0.3333)).toBe(0.9999);
  });
});

describe("agregarLineas", () => {
  it("suma el lote de cada línea, no unidades x precio del ítem", () => {
    // Caso real (30201 +4): dos líneas con precios distintos. Multiplicar el
    // total de unidades por un precio representativo daría un número mal.
    const lineas = calcularLineas([
      linea({ unidades: 50, precioChina: 11.32, cbmTotal: 1.2 }),
      linea({ unidades: 60, precioChina: 11.31, cbmTotal: 2.02 }),
    ]);
    const ag = agregarLineas(lineas);
    expect(ag.unidades).toBe(110);
    expect(ag.montoTotal).toBe(1244.6); // 566.00 + 678.60
    expect(ag.cbmTotal).toBe(3.22);
    // Distinto de la fórmula a nivel ítem, que daría 110 * 11.32 = 1245.2
    expect(ag.montoTotal).not.toBe(1245.2);
  });

  it("toma como precio del ítem el de la primera línea que lo tenga", () => {
    const ag = agregarLineas(
      calcularLineas([
        linea({ precioChina: null }),
        linea({ precioChina: 7.5 }),
        linea({ precioChina: 9 }),
      ]),
    );
    expect(ag.precioChina).toBe(7.5);
  });

  it("devuelve null cuando ninguna línea tiene el dato", () => {
    const ag = agregarLineas(
      calcularLineas([linea({ unidades: null, precioChina: null, cbmTotal: null })]),
    );
    expect(ag).toEqual({
      unidades: null,
      montoTotal: null,
      cbmTotal: null,
      precioChina: null,
    });
  });

  it("ignora las líneas incompletas al sumar", () => {
    const ag = agregarLineas(
      calcularLineas([
        linea({ unidades: 100, precioChina: 2 }),
        linea({ unidades: 50, precioChina: null }),
      ]),
    );
    expect(ag.unidades).toBe(150); // las unidades sí suman
    expect(ag.montoTotal).toBe(200); // el monto sólo de la línea con precio
  });

  it("tolera un producto sin líneas", () => {
    expect(agregarLineas([])).toEqual({
      unidades: null,
      montoTotal: null,
      cbmTotal: null,
      precioChina: null,
    });
  });
});

describe("calcularLineas y el CBM", () => {
  it("deriva el CBM de cada línea del CBM por unidad", () => {
    const lineas = calcularLineas(
      [linea({ unidades: 500, cbmTotal: 50 }), linea({ unidades: 200, cbmTotal: 20 })],
      0.01,
    );
    expect(lineas[0].cbmTotal).toBe(5);
    expect(lineas[1].cbmTotal).toBe(2);
    expect(agregarLineas(lineas).cbmTotal).toBe(7);
  });

  it("respeta el CBM existente si no hay CBM por unidad", () => {
    // Sin el dato no se puede calcular; borrarlo sería perder información.
    const lineas = calcularLineas([linea({ cbmTotal: 5 })], null);
    expect(lineas[0].cbmTotal).toBe(5);
  });

  it("cambiar el CBM por unidad arrastra el total del ítem", () => {
    const antes = agregarLineas(calcularLineas([linea({ unidades: 500 })], 0.01));
    const despues = agregarLineas(calcularLineas([linea({ unidades: 500 })], 0.02));
    expect(antes.cbmTotal).toBe(5);
    expect(despues.cbmTotal).toBe(10);
  });
});

describe("cbmCajaDesdeUnidad", () => {
  it("es el inverso exacto de cbmPorUnidad", () => {
    const { cbmUnitario, cantidadPorCaja } = cbmCajaDesdeUnidad(0.05, 10);
    expect(cbmUnitario).toBe(0.5);
    expect(cbmPorUnidad(cbmUnitario, cantidadPorCaja)).toBe(0.05);
  });

  it("asume 1 por caja si el producto no la tiene cargada", () => {
    // Así el valor tecleado se conserva en vez de perderse.
    const r = cbmCajaDesdeUnidad(0.037, null);
    expect(r).toEqual({ cbmUnitario: 0.037, cantidadPorCaja: 1 });
    expect(cbmPorUnidad(r.cbmUnitario, r.cantidadPorCaja)).toBe(0.037);
  });

  it("limpiar el campo no inventa unidades por caja", () => {
    expect(cbmCajaDesdeUnidad(null, 12)).toEqual({
      cbmUnitario: null,
      cantidadPorCaja: 12,
    });
  });
});

describe("sanitizeDetalle", () => {
  it("normaliza lo que manda la pantalla", () => {
    const lineas = sanitizeDetalle([
      { codigos: [" 16000 ", "", "16001"], unidades: "100.4", precioChina: "2.5", remark: "  " },
    ]);
    expect(lineas).toEqual([
      {
        codigos: ["16000", "16001"],
        unidades: 100,
        precioChina: 2.5,
        cbmTotal: null,
        remark: null,
      },
    ]);
  });

  it("un alta sin detalle no rompe: no hay líneas y los agregados quedan vacíos", () => {
    // El alta manual puede llegar sin nada cargado todavía.
    expect(sanitizeDetalle(undefined)).toEqual([]);
    expect(agregarLineas(calcularLineas(sanitizeDetalle(null), null))).toEqual({
      unidades: null,
      montoTotal: null,
      cbmTotal: null,
      precioChina: null,
    });
  });
});
