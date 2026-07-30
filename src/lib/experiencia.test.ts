import { describe, it, expect } from "vitest";
import {
  EXPERIENCIA_MAX,
  SEMAFORO_TEXTO,
  TEXTO_SITUACION,
  VENTANA_DIAS,
  agruparPorSku,
  asuntoCambios,
  compararCapturas,
  compararSkus,
  cuerpoCambios,
  evaluarExperiencia,
  experienciaEstado,
  experienciaToText,
  normalizarSku,
  normalizeExperienciaParams,
  parseCantidad,
  parseCaptura,
  parseResumen,
  resumirExperiencia,
  semaforoDe,
  type CapturaPub,
  type ExperienciaSku,
} from "./experiencia";

// ------------------------------------------------------------------- helpers
//
// Los textos son los que devuelve MercadoLibre de verdad: salieron de la captura
// del panel del 29/07/2026 (249 publicaciones por debajo de 100).

const SOLUCION_PARTES =
  "Revisa que lo que te compraron coincida con lo que envías, verifica que todo esté completo y que el embalaje esté en buen estado.";
const SOLUCION_DAÑADO =
  "Asegúrate de vender productos de buena calidad. Si tu producto tiene defectos de fábrica, reemplázalos lo antes posible.";

/** Una entrada del listado del panel, tal como viene en el JSON de la captura. */
function crudoListado(over: Record<string, unknown> = {}) {
  return {
    id: "MLU869662504",
    titulo: "Ropero 3 Puertas Corredizas Bariloche Dormitorio Con Espejo Color Blanco",
    sku: "16214-BLA",
    estado: "active",
    catalogo: true,
    stock: "161 u.",
    precio: "$ 12.990",
    cal: 93,
    exp: 30,
    expGoals: "Con problemas",
    reco: "Mejora tu experiencia",
    url: "https://www.mercadolibre.com.uy/publicaciones/MLU869662504/modificar",
    ...over,
  };
}

/** Una entrada del diagnóstico: la de arriba más el detalle `ml` de la pantalla. */
function crudoDiagnostico(over: Record<string, unknown> = {}, ml: Record<string, unknown> = {}) {
  return {
    ...crudoListado(over),
    ml: {
      score: 30,
      nivel: "Mala",
      color: "red",
      resumen:
        `En los últimos ${VENTANA_DIAS} días hiciste 422 ventas y tuviste 17 problemas. Revisa los consejos sobre cómo mejorar.`,
      aviso: "Podríamos anular tu publicación si continúa brindando mala experiencia.",
      dist: ["Con el producto entregado: 100%"],
      problemas: [
        {
          codigo: "good_packing_but_missing_accessories",
          categoria: "Faltaban partes o accesorios del producto",
          detalle: "El embalaje llegó bien pero faltaban partes o accesorios del producto",
          cantidad: "8 problemas",
          principal: true,
          reclamos: 8,
          cancelaciones: 0,
          solucion: SOLUCION_PARTES,
          accion: "Modificar publicación",
        },
        {
          codigo: "good_packing_but_product_broken",
          categoria: "El producto estaba dañado",
          detalle: "El embalaje llegó bien pero el producto estaba dañado",
          cantidad: "6 problemas",
          principal: false,
          reclamos: 6,
          cancelaciones: 1,
          solucion: SOLUCION_DAÑADO,
          accion: "Pausar desde el listado",
        },
        {
          codigo: "different_from_ordered",
          categoria: "Era diferente a lo pedido",
          detalle: "El comprador recibió otro tipo de producto",
          cantidad: "3 problemas",
          principal: false,
          reclamos: 3,
          cancelaciones: 0,
          solucion: "Asegúrate de que tu publicación coincida con el producto que envías.",
          accion: "Modificar publicación",
        },
      ],
      ...ml,
    },
  };
}

const params = normalizeExperienciaParams(null);
const opts = {
  capturadoEn: "2026-07-29T20:53:00.000Z",
  generadoEn: "2026-07-30T12:00:00.000Z",
  params,
};

// ------------------------------------------------------------- parseCantidad

describe("parseCantidad", () => {
  it("lee las dos formas que usa ML", () => {
    expect(parseCantidad("8 problemas")).toBe(8);
    expect(parseCantidad("1 problema")).toBe(1);
  });

  it("entiende la cantidad escrita en palabras", () => {
    expect(parseCantidad("un problema")).toBe(1);
    expect(parseCantidad("una venta")).toBe(1);
  });

  it("aguanta el separador de miles y la basura", () => {
    expect(parseCantidad("1.234 problemas")).toBe(1234);
    expect(parseCantidad("")).toBe(0);
    expect(parseCantidad(null)).toBe(0);
    expect(parseCantidad("sin datos")).toBe(0);
  });
});

// -------------------------------------------------------------- parseResumen

describe("parseResumen", () => {
  it("saca ventas y problemas del texto del panel", () => {
    const r = parseResumen(
      "En los últimos 180 días hiciste 422 ventas y tuviste 17 problemas. Revisa los consejos sobre cómo mejorar.",
    );
    expect(r).toEqual({ ventas180d: 422, problemas180d: 17, situacion: "con-problemas" });
  });

  it("entiende «un problema» y «una venta» en singular", () => {
    expect(
      parseResumen(
        "En los últimos 180 días hiciste una venta y tuviste un problema. Para calcular la experiencia que brindas, consideramos también tu desempeño en otras publicaciones de la misma categoría.",
      ),
    ).toEqual({ ventas180d: 1, problemas180d: 1, situacion: "con-problemas" });
  });

  it("distingue «sin problemas» de «sin ventas», que no es lo mismo", () => {
    // Vendió y no tuvo problemas: no hay nada que arreglar, pero ML no dice cuánto vendió.
    expect(parseResumen("No tuviste problemas con este producto.")).toEqual({
      ventas180d: null,
      problemas180d: 0,
      situacion: "sin-problemas",
    });
    // Sin ventas ML no calcula nada: el SKU no tiene puntaje que mejorar.
    expect(
      parseResumen(
        "Aún no la calculamos porque tu publicación no tuvo ventas en los últimos 180 días.",
      ),
    ).toEqual({ ventas180d: 0, problemas180d: 0, situacion: "sin-ventas" });
  });

  it("no inventa un cero cuando el texto vino vacío o desconocido", () => {
    expect(parseResumen("")).toEqual({
      ventas180d: null,
      problemas180d: null,
      situacion: "sin-datos",
    });
    expect(parseResumen(null).situacion).toBe("sin-datos");
    expect(parseResumen("Texto nuevo que ML todavía no usaba").situacion).toBe("sin-datos");
  });
});

// --------------------------------------------------------------- parseCaptura

describe("parseCaptura", () => {
  it("normaliza una entrada del listado", () => {
    const [p] = parseCaptura([crudoListado()]);
    expect(p.id).toBe("MLU869662504");
    expect(p.sku).toBe("16214-BLA");
    expect(p.experiencia).toBe(30);
    expect(p.calidad).toBe(93);
    expect(p.catalogo).toBe(true);
    expect(p.detalle).toBeNull(); // el listado no trae el detalle
  });

  it("parsea el detalle y ordena los problemas con el principal primero", () => {
    const [p] = parseCaptura([crudoDiagnostico()]);
    expect(p.detalle?.nivel).toBe("Mala");
    expect(p.detalle?.ventas180d).toBe(422);
    expect(p.detalle?.problemas180d).toBe(17);
    expect(p.detalle?.situacion).toBe("con-problemas");
    expect(p.detalle?.problemas[0].principal).toBe(true);
    expect(p.detalle?.problemas[0].cantidad).toBe(8);
    expect(p.detalle?.problemas[0].comoMejorar).toBe(SOLUCION_PARTES);
  });

  it("mergea el listado con el diagnóstico por id de publicación", () => {
    // Así llega de verdad: el listado trae las 2200 con su %, el diagnóstico solo
    // el detalle de las que están por debajo de 100.
    const pubs = parseCaptura(
      [crudoListado(), crudoListado({ id: "MLU2", sku: "99999", exp: 100 })],
      [{ id: crudoListado().id, ml: crudoDiagnostico().ml }],
    );
    expect(pubs).toHaveLength(2);
    const conDetalle = pubs.find((p) => p.id === "MLU869662504");
    expect(conDetalle?.experiencia).toBe(30); // vino del listado
    expect(conDetalle?.detalle?.problemas).toHaveLength(3); // vino del diagnóstico
    expect(pubs.find((p) => p.id === "MLU2")?.detalle).toBeNull();
  });

  it("trata el -1 de ML como «no hay puntaje»", () => {
    const [p] = parseCaptura([
      crudoDiagnostico({}, {
        score: -1,
        nivel: "",
        resumen: `Aún no la calculamos porque tu publicación no tuvo ventas en los últimos ${VENTANA_DIAS} días.`,
        problemas: [],
      }),
    ]);
    expect(p.detalle?.score).toBeNull();
    expect(p.detalle?.nivel).toBeNull();
    expect(p.detalle?.situacion).toBe("sin-ventas");
  });

  it("descarta lo que no tiene id y aguanta basura", () => {
    expect(parseCaptura([{ titulo: "sin id" }, null, 42, "x"], null, undefined)).toEqual([]);
  });

  it("normaliza el SKU a mayúsculas para que agrupe parejo", () => {
    expect(normalizarSku(" 16214-bla ")).toBe("16214-BLA");
    expect(normalizarSku("")).toBeNull();
    expect(normalizarSku(undefined)).toBeNull();
  });
});

// ------------------------------------------------------------------ semáforo

describe("semaforoDe", () => {
  it("marca rojo hasta 30, que es donde ML avisa que puede pausar", () => {
    expect(semaforoDe(30)).toBe("rojo");
    expect(semaforoDe(0)).toBe("rojo");
    expect(semaforoDe(31)).toBe("amarillo");
  });

  it("solo el 100 es verde", () => {
    expect(semaforoDe(99)).toBe("amarillo");
    expect(semaforoDe(EXPERIENCIA_MAX)).toBe("verde");
  });

  it("sin dato va amarillo: no saber es peor que estar en 100", () => {
    expect(semaforoDe(null)).toBe("amarillo");
  });
});

// ------------------------------------------------------------- agruparPorSku

describe("agruparPorSku", () => {
  it("cuenta los reclamos UNA vez por SKU y no los suma entre publicaciones hermanas", () => {
    // Dos publicaciones del mismo SKU: ML les informa los mismos 17 problemas.
    const pubs = parseCaptura([
      crudoDiagnostico({ id: "MLU1" }),
      crudoDiagnostico({ id: "MLU2" }),
    ]);
    const [sku] = agruparPorSku(pubs);
    expect(sku.publicaciones).toHaveLength(2);
    expect(sku.reclamos).toBe(17); // 8 + 6 + 3, no el doble
    expect(sku.ventas180d).toBe(422);
    expect(sku.problemas180d).toBe(17);
  });

  it("no une variantes distintas del mismo código padre", () => {
    // ML calcula la experiencia por producto: "16214-BLA" y "16214-NOG" son dos.
    const pubs = parseCaptura([
      crudoDiagnostico({ id: "MLU1", sku: "16214-BLA" }),
      crudoDiagnostico({ id: "MLU2", sku: "16214-NOG" }),
    ]);
    expect(agruparPorSku(pubs).map((s) => s.sku).sort()).toEqual(["16214-BLA", "16214-NOG"]);
  });

  it("deja cada publicación sin SKU como su propia fila", () => {
    const pubs = parseCaptura([
      crudoDiagnostico({ id: "MLU1", sku: "" }),
      crudoDiagnostico({ id: "MLU2", sku: null }),
    ]);
    const grupos = agruparPorSku(pubs);
    expect(grupos).toHaveLength(2);
    expect(grupos.every((g) => g.sinSku)).toBe(true);
    expect(grupos.map((g) => g.clave).sort()).toEqual(["MLU1", "MLU2"]);
  });

  it("elige la hermana que más información trae", () => {
    // Pasa de verdad: a una publicación del par no se le pudo leer el detalle.
    const pubs = parseCaptura([
      crudoDiagnostico({ id: "MLU1" }),
      crudoDiagnostico({ id: "MLU2" }, { resumen: "", problemas: [], score: null, nivel: "" }),
    ]);
    const [sku] = agruparPorSku(pubs);
    expect(sku.reclamos).toBe(17);
    expect(sku.situacion).toBe("con-problemas");
  });

  it("toma el peor % del listado entre las hermanas", () => {
    const pubs = parseCaptura([
      crudoDiagnostico({ id: "MLU1", exp: 75 }),
      crudoDiagnostico({ id: "MLU2", exp: 30 }),
    ]);
    expect(agruparPorSku(pubs)[0].experiencia).toBe(30);
  });

  it("expone el problema principal y su consejo de ML", () => {
    const [sku] = agruparPorSku(parseCaptura([crudoDiagnostico()]));
    expect(sku.problemaPrincipal?.categoria).toBe("Faltaban partes o accesorios del producto");
    expect(sku.problemaPrincipalTexto).toBe("Faltaban partes o accesorios del producto");
    expect(sku.comoMejorar).toBe(SOLUCION_PARTES);
    expect(sku.tiposProblema).toBe(3);
    expect(sku.cancelaciones).toBe(1);
  });

  it("explica en la columna por qué un SKU no tiene problema principal", () => {
    const sinProblemas = agruparPorSku(
      parseCaptura([
        crudoDiagnostico({}, { resumen: "No tuviste problemas con este producto.", problemas: [] }),
      ]),
    )[0];
    expect(sinProblemas.problemaPrincipal).toBeNull();
    expect(sinProblemas.problemaPrincipalTexto).toBe(TEXTO_SITUACION["sin-problemas"]);

    const sinVentas = agruparPorSku(
      parseCaptura([
        crudoDiagnostico({}, {
          resumen: `Aún no la calculamos porque tu publicación no tuvo ventas en los últimos ${VENTANA_DIAS} días.`,
          problemas: [],
          score: -1,
        }),
      ]),
    )[0];
    expect(sinVentas.problemaPrincipalTexto).toBe(TEXTO_SITUACION["sin-ventas"]);
  });

  it("usa las ventas de nuestra base cuando ML no las informa", () => {
    const pubs = parseCaptura([
      crudoDiagnostico({}, { resumen: "No tuviste problemas con este producto.", problemas: [] }),
    ]);
    const [sku] = agruparPorSku(pubs, new Map([["16214-BLA", 137]]));
    expect(sku.ventas180d).toBeNull(); // ML no dijo nada
    expect(sku.ventasBd180d).toBe(137);
  });

  it("no le pega ventas de la base a las publicaciones sin SKU", () => {
    const pubs = parseCaptura([crudoDiagnostico({ sku: "" })]);
    expect(agruparPorSku(pubs, new Map([["16214-BLA", 137]]))[0].ventasBd180d).toBeNull();
  });
});

// -------------------------------------------------------------- compararSkus

describe("compararSkus", () => {
  const sku = (over: Partial<ExperienciaSku>): ExperienciaSku =>
    ({
      clave: "X",
      sku: "X",
      sinSku: false,
      titulo: "t",
      experiencia: 65,
      semaforo: "amarillo",
      nivel: "Media",
      score: 65,
      situacion: "con-problemas",
      ventas180d: 0,
      ventasBd180d: null,
      problemas180d: 0,
      reclamos: 0,
      cancelaciones: 0,
      tiposProblema: 0,
      problemaPrincipal: null,
      problemaPrincipalTexto: "",
      comoMejorar: null,
      problemas: [],
      dist: [],
      aviso: null,
      publicaciones: [],
      ...over,
    }) as ExperienciaSku;

  it("pone los rojos primero, incluso con menos reclamos", () => {
    const rojo = sku({ clave: "rojo", semaforo: "rojo", reclamos: 1 });
    const amarillo = sku({ clave: "amarillo", reclamos: 9 });
    expect([amarillo, rojo].sort(compararSkus).map((s) => s.clave)).toEqual(["rojo", "amarillo"]);
  });

  it("a igual semáforo manda el que más reclamos tiene", () => {
    const a = sku({ clave: "a", reclamos: 2 });
    const b = sku({ clave: "b", reclamos: 7 });
    expect([a, b].sort(compararSkus).map((s) => s.clave)).toEqual(["b", "a"]);
  });

  it("a igual reclamos manda el que más vende", () => {
    const poco = sku({ clave: "poco", reclamos: 2, ventas180d: 5 });
    const mucho = sku({ clave: "mucho", reclamos: 2, ventas180d: 400 });
    expect([poco, mucho].sort(compararSkus).map((s) => s.clave)).toEqual(["mucho", "poco"]);
  });
});

// ---------------------------------------------------------- evaluarExperiencia

describe("evaluarExperiencia", () => {
  it("deja afuera lo que ya está en 100", () => {
    const pubs = parseCaptura([
      crudoDiagnostico({ id: "MLU1", sku: "A", exp: 30 }),
      crudoListado({ id: "MLU2", sku: "B", exp: 100 }),
    ]);
    const rep = evaluarExperiencia(pubs, opts);
    expect(rep.items.map((i) => i.sku)).toEqual(["A"]);
    expect(rep.summary.publicacionesCapturadas).toBe(2); // el total sí se informa
    expect(rep.summary.publicaciones).toBe(1);
  });

  it("deja afuera las que ML no puntuó, pero dice cuántas son", () => {
    // El -1 del listado no es un puntaje malísimo: es «no lo calculé porque no
    // vendiste». Meterlas las mostraría como las peores del catálogo.
    const pubs = parseCaptura([
      crudoDiagnostico({ id: "MLU1", sku: "A", exp: 30 }),
      crudoListado({ id: "MLU2", sku: "B", exp: -1 }),
      crudoListado({ id: "MLU3", sku: "C", exp: null }),
    ]);
    const rep = evaluarExperiencia(pubs, opts);
    expect(rep.items.map((i) => i.sku)).toEqual(["A"]);
    expect(rep.summary.sinPuntaje).toBe(1); // el -1
    expect(rep.summary.noLeidas).toBe(1); // la que no se pudo leer
    expect(rep.summary.publicacionesCapturadas).toBe(3);
  });

  it("el -1 no llega al reporte ni como experiencia ni como semáforo", () => {
    const [p] = parseCaptura([crudoListado({ exp: -1 })]);
    expect(p.experiencia).toBeNull();
    expect(p.sinCalcular).toBe(true);
    const [q] = parseCaptura([crudoListado({ exp: null })]);
    expect(q.experiencia).toBeNull();
    expect(q.sinCalcular).toBe(false); // no es lo mismo: esta no se pudo leer
  });

  it("el listado no le pisa el puntaje al diagnóstico cuando manda -1", () => {
    // Pasó de verdad: una publicación quedó en -1 en el listado y con detalle en
    // el diagnóstico. Si el -1 pisara el 30, el SKU desaparecía del reporte.
    const pubs = parseCaptura(
      [crudoListado({ id: "MLU1", exp: 30 })],
      [crudoListado({ id: "MLU1", exp: -1 })],
    );
    expect(pubs[0].experiencia).toBe(30);
    expect(evaluarExperiencia(pubs, opts).items).toHaveLength(1);
  });

  it("respeta el umbral configurado", () => {
    const pubs = parseCaptura([
      crudoDiagnostico({ id: "MLU1", sku: "A", exp: 30 }),
      crudoDiagnostico({ id: "MLU2", sku: "B", exp: 75 }),
    ]);
    const rep = evaluarExperiencia(pubs, {
      ...opts,
      params: normalizeExperienciaParams({ umbral: 50 }),
    });
    expect(rep.items.map((i) => i.sku)).toEqual(["A"]);
  });

  it("conserva de qué captura salió", () => {
    const rep = evaluarExperiencia(parseCaptura([crudoDiagnostico()]), opts);
    expect(rep.capturadoEn).toBe(opts.capturadoEn);
    expect(rep.generadoEn).toBe(opts.generadoEn);
  });
});

// ------------------------------------------------------- resumirExperiencia

describe("resumirExperiencia", () => {
  const armar = () => {
    const pubs = parseCaptura([
      // rojo con 17 reclamos, problema principal "faltaban partes"
      crudoDiagnostico({ id: "MLU1", sku: "A", exp: 30 }),
      // otro con el mismo problema principal, 1 reclamo
      crudoDiagnostico({ id: "MLU2", sku: "B", exp: 65 }, {
        score: 65,
        nivel: "Media",
        resumen: `En los últimos ${VENTANA_DIAS} días hiciste 100 ventas y tuviste un problema. Revisa los consejos sobre cómo mejorar.`,
        problemas: [
          {
            codigo: "good_packing_but_missing_accessories",
            categoria: "Faltaban partes o accesorios del producto",
            cantidad: "1 problema",
            principal: true,
            reclamos: 1,
            cancelaciones: 0,
            solucion: SOLUCION_PARTES,
          },
        ],
      }),
      // sin problemas
      crudoDiagnostico({ id: "MLU3", sku: "C", exp: 75 }, {
        score: 100,
        nivel: "Buena",
        resumen: "No tuviste problemas con este producto.",
        problemas: [],
      }),
      // sin ventas
      crudoDiagnostico({ id: "MLU4", sku: "D", exp: 75 }, {
        score: -1,
        nivel: "",
        resumen: `Aún no la calculamos porque tu publicación no tuvo ventas en los últimos ${VENTANA_DIAS} días.`,
        problemas: [],
      }),
    ]);
    return evaluarExperiencia(pubs, opts).summary;
  };

  it("cuenta el semáforo, los reclamos y las situaciones", () => {
    const s = armar();
    expect(s.skus).toBe(4);
    expect(s.rojo).toBe(1);
    expect(s.amarillo).toBe(3);
    expect(s.conReclamos).toBe(2);
    expect(s.sinReclamos).toBe(2);
    expect(s.reclamosTotales).toBe(18); // 17 + 1
    expect(s.sinVentas).toBe(1);
    expect(s.ventasConReclamos).toBe(522); // 422 + 100
  });

  it("agrupa los SKU por su problema principal, sumando los reclamos del SKU entero", () => {
    const s = armar();
    expect(s.ranking[0]).toEqual({
      categoria: "Faltaban partes o accesorios del producto",
      skus: 2,
      reclamos: 18,
      ventas180d: 522,
      comoMejorar: SOLUCION_PARTES,
    });
  });

  it("no rankea los SKU que no tienen problema principal", () => {
    expect(armar().ranking).toHaveLength(1);
  });

  it("con la lista vacía devuelve ceros y no explota", () => {
    const s = resumirExperiencia([], { publicacionesCapturadas: 0 });
    expect(s.skus).toBe(0);
    expect(s.reclamosTotales).toBe(0);
    expect(s.ranking).toEqual([]);
  });
});

// ------------------------------------------------------------ compararCapturas

describe("compararCapturas", () => {
  const conReclamos = (clave: string, reclamos: number, exp = 65): ExperienciaSku[] =>
    agruparPorSku(
      parseCaptura([
        crudoDiagnostico({ id: `MLU-${clave}`, sku: clave, exp }, {
          score: exp,
          resumen: `En los últimos ${VENTANA_DIAS} días hiciste 50 ventas y tuviste ${reclamos} problemas.`,
          problemas: [
            {
              codigo: "good_packing_but_missing_accessories",
              categoria: "Faltaban partes o accesorios del producto",
              cantidad: `${reclamos} problemas`,
              principal: true,
              reclamos,
              cancelaciones: 0,
              solucion: SOLUCION_PARTES,
            },
          ],
        }),
      ]),
    );

  it("avisa el SKU que sumó reclamos", () => {
    const cambios = compararCapturas(conReclamos("A", 5), conReclamos("A", 2));
    expect(cambios).toHaveLength(1);
    expect(cambios[0].reclamosAntes).toBe(2);
    expect(cambios[0].reclamos).toBe(5);
    expect(cambios[0].deltaReclamos).toBe(3);
    expect(cambios[0].nuevo).toBe(false);
  });

  it("no avisa el que quedó igual ni el que mejoró", () => {
    expect(compararCapturas(conReclamos("A", 2), conReclamos("A", 2))).toEqual([]);
    expect(compararCapturas(conReclamos("A", 1), conReclamos("A", 4))).toEqual([]);
  });

  it("avisa cuando cayó el puntaje aunque los reclamos no se muevan", () => {
    const cambios = compararCapturas(conReclamos("A", 2, 30), conReclamos("A", 2, 65));
    expect(cambios).toHaveLength(1);
    expect(cambios[0].deltaExperiencia).toBe(-35);
    expect(cambios[0].cayoEnRojo).toBe(true);
  });

  it("respeta el mínimo de reclamos nuevos", () => {
    expect(compararCapturas(conReclamos("A", 3), conReclamos("A", 2), 2)).toEqual([]);
    expect(compararCapturas(conReclamos("A", 4), conReclamos("A", 2), 2)).toHaveLength(1);
  });

  it("la primera comparación no avisa de todo el catálogo", () => {
    // Sin captura anterior solo se avisan los que YA vienen con reclamos.
    const sinReclamos = agruparPorSku(
      parseCaptura([
        crudoDiagnostico({ sku: "Z" }, { resumen: "No tuviste problemas con este producto.", problemas: [] }),
      ]),
    );
    expect(compararCapturas(sinReclamos, null)).toEqual([]);
    expect(compararCapturas(conReclamos("A", 3), null)[0].nuevo).toBe(true);
  });

  it("ordena lo que cayó a rojo primero y después lo que más sumó", () => {
    const actual = [...conReclamos("A", 9), ...conReclamos("B", 3, 30)];
    const anterior = [...conReclamos("A", 1), ...conReclamos("B", 2, 65)];
    expect(compararCapturas(actual, anterior).map((c) => c.clave)).toEqual(["B", "A"]);
  });
});

// -------------------------------------------------------------------- el mail

describe("mail de cambios", () => {
  const cambio = (over: Record<string, unknown> = {}) => ({
    clave: "16214-BLA",
    sku: "16214-BLA",
    titulo: "Ropero 3 Puertas Corredizas Bariloche",
    url: "https://www.mercadolibre.com.uy/p/MLU123",
    reclamosAntes: 12,
    reclamos: 17,
    deltaReclamos: 5,
    experienciaAntes: 65,
    experiencia: 30,
    deltaExperiencia: -35,
    nivelAntes: "Media",
    nivel: "Mala",
    problemaPrincipal: "Faltaban partes o accesorios del producto",
    comoMejorar: SOLUCION_PARTES,
    nuevo: false,
    cayoEnRojo: true,
    ...over,
  });

  it("el asunto avisa cuántos cayeron a rojo", () => {
    expect(asuntoCambios([cambio()])).toContain("1 SKU con mala experiencia");
  });

  it("el asunto de un solo cambio nombra el producto", () => {
    const a = asuntoCambios([cambio({ cayoEnRojo: false })]);
    expect(a).toContain("Ropero 3 Puertas");
    expect(a).toContain("+5 reclamos");
  });

  it("el cuerpo trae el problema y el consejo de ML en texto y HTML", () => {
    const { text, html } = cuerpoCambios([cambio()], { panelUrl: "https://panel/reportes/experiencia" });
    expect(text).toContain("16214-BLA");
    expect(text).toContain("Reclamos: 12 → 17 (+5)");
    expect(text).toContain(SOLUCION_PARTES);
    expect(text).toContain("https://panel/reportes/experiencia");
    expect(html).toContain("+5");
    expect(html).toContain("pasó a rojo");
    expect(html).toContain("Ver el reporte");
  });

  it("escapa el HTML de los títulos", () => {
    const { html } = cuerpoCambios([cambio({ titulo: '<script>alert("x")</script>' })]);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("corta la lista larga y dice cuántos faltan", () => {
    const muchos = Array.from({ length: 30 }, (_, i) => cambio({ clave: `SKU${i}` }));
    const { text, html } = cuerpoCambios(muchos, { max: 5 });
    expect(text).toContain("… y 25 más.");
    expect(html).toContain("… y 25 más.");
  });
});

// --------------------------------------------------------------------- varios

describe("normalizeExperienciaParams", () => {
  it("usa los defaults cuando no hay nada guardado", () => {
    expect(normalizeExperienciaParams(null)).toEqual({
      umbral: 100,
      rojoHasta: 30,
      minReclamos: 1,
    });
  });

  it("acota los valores fuera de rango y la basura", () => {
    expect(normalizeExperienciaParams({ umbral: 999 }).umbral).toBe(100);
    expect(normalizeExperienciaParams({ umbral: 0 }).umbral).toBe(1);
    expect(normalizeExperienciaParams({ minReclamos: 0 }).minReclamos).toBe(1);
    expect(normalizeExperienciaParams({ rojoHasta: -5 }).rojoHasta).toBe(0);
    expect(
      normalizeExperienciaParams({ umbral: "x" as unknown as number }).umbral,
    ).toBe(100);
  });
});

describe("experienciaEstado", () => {
  const base = agruparPorSku(parseCaptura([crudoDiagnostico()]))[0];

  it("distingue mala, con problemas y sin problemas", () => {
    expect(experienciaEstado(base).label).toBe("Mala");
    expect(experienciaEstado({ ...base, semaforo: "amarillo" }).label).toBe("Con problemas");
    expect(
      experienciaEstado({ ...base, semaforo: "amarillo", reclamos: 0 }).label,
    ).toBe("Sin problemas");
  });

  it("no muestra como buena una publicación que no tiene datos", () => {
    expect(experienciaEstado({ ...base, situacion: "sin-ventas" }).label).toBe("Sin ventas");
    expect(experienciaEstado({ ...base, situacion: "sin-datos" }).label).toBe("Sin datos");
  });
});

describe("experienciaToText", () => {
  it("resume el reporte para el log", () => {
    const rep = evaluarExperiencia(parseCaptura([crudoDiagnostico()]), opts);
    const txt = experienciaToText(rep);
    expect(txt).toContain("1 SKU");
    expect(txt).toContain("17 problemas");
    expect(txt).toContain("Faltaban partes");
  });

  it("avisa cuántos quedaron sin mostrar", () => {
    const pubs: CapturaPub[] = parseCaptura(
      Array.from({ length: 20 }, (_, i) => crudoDiagnostico({ id: `MLU${i}`, sku: `SKU${i}` })),
    );
    expect(experienciaToText(evaluarExperiencia(pubs, opts), 5)).toContain("y 15 más");
  });
});

describe("etiquetas", () => {
  it("el semáforo del Excel es el mismo que el de la pantalla", () => {
    expect(SEMAFORO_TEXTO.rojo).toContain("Rojo");
    expect(Object.keys(SEMAFORO_TEXTO).sort()).toEqual(["amarillo", "rojo", "verde"]);
  });

  it("cada situación tiene un texto para la columna", () => {
    expect(TEXTO_SITUACION["sin-ventas"]).toBe(`Sin ventas en ${VENTANA_DIAS} días`);
    expect(Object.keys(TEXTO_SITUACION)).toHaveLength(4);
  });
});
