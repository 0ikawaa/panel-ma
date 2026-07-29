import { describe, it, expect } from "vitest";
import {
  ASPECTOS,
  EXPERIENCIA_MAX,
  PESO_TOTAL_ASPECTOS,
  agruparPorSku,
  aspectoDe,
  asuntoCaidas,
  codigoBase,
  confirmarPendientes,
  cuerpoCaidas,
  detectarCaidas,
  evaluarExperiencia,
  normalizeExperienciaParams,
  problemasDe,
  semaforoDe,
  toPublicacion,
  type PubExperiencia,
  type VentasReclamos,
} from "./experiencia";
import { parseSellerSku, type MlCheck, type MlExperiencia, type MlItem } from "./mundoshop";

// ------------------------------------------------------------------- helpers

const check = (item: string, status: MlCheck["status"], detail = ""): MlCheck => ({ item, status, detail });

/** Los nueve aspectos en verde: el punto de partida de una publicación perfecta. */
const CHECKS_OK: MlCheck[] = ASPECTOS.map((a) => check(a.apiItem, "ok", "ok"));

function mlItem(over: Partial<MlItem> = {}): MlItem {
  return {
    id: "MLU1",
    title: "Producto X",
    status: "active",
    sub_status: [],
    health: 1,
    price: 500,
    available_quantity: 10,
    sold_quantity: 20,
    listing_type: "gold_special",
    catalog_listing: true,
    permalink: "https://articulo.mercadolibre.com.uy/MLU-1",
    thumbnail: "https://http2.mlstatic.com/x.jpg",
    seller_sku: "48000-NEG-40",
    tags: [],
    ...over,
  };
}

function mlExp(over: Partial<MlExperiencia> = {}): MlExperiencia {
  return {
    id: "MLU1",
    title: "Producto X",
    status: "active",
    price: 500,
    permalink: "https://articulo.mercadolibre.com.uy/MLU-1",
    experience_score: 100,
    experience_level: "EXCELENTE",
    checks: CHECKS_OK,
    reviews_summary: { total: 10, avg: 4.5, last_reviews: [] },
    visits_30d: 100,
    sold_quantity: 20,
    available_quantity: 10,
    ...over,
  };
}

/** Publicación ya evaluada, para los tests de agrupado y caídas. */
function pub(over: Partial<PubExperiencia> = {}): PubExperiencia {
  return {
    id: "MLU1",
    titulo: "Producto X",
    sku: "48000-NEG-40",
    permalink: null,
    thumbnail: null,
    score: 60,
    nivel: "BUENA",
    semaforo: "amarillo",
    precio: 500,
    disponibles: 10,
    vendidasHistorico: 20,
    visitas30d: 50,
    reviews: { total: 5, promedio: 4 },
    problemas: [],
    ...over,
  };
}

// -------------------------------------------------------------------- aspectos

describe("catálogo de aspectos", () => {
  it("los nueve aspectos suman exactamente 100 puntos", () => {
    expect(PESO_TOTAL_ASPECTOS).toBe(EXPERIENCIA_MAX);
    expect(ASPECTOS).toHaveLength(9);
  });

  it("todos los aspectos traen una recomendación concreta", () => {
    for (const a of ASPECTOS) {
      expect(a.comoMejorar.length).toBeGreaterThan(30);
      expect(a.label).not.toBe("");
    }
  });

  it("encuentra el aspecto por el nombre que manda la API, sin importar el caso", () => {
    expect(aspectoDe("Health ML").code).toBe("health");
    expect(aspectoDe("  envio gratis  ").code).toBe("envio_gratis");
    expect(aspectoDe("Catalogo ML").peso).toBe(10);
  });

  it("un aspecto que ML agregue no se pierde: queda como desconocido con peso 0", () => {
    const a = aspectoDe("Preguntas sin responder");
    expect(a.code).toBe("otro:preguntas_sin_responder");
    expect(a.peso).toBe(0);
    expect(a.label).toBe("Preguntas sin responder");
  });
});

// ------------------------------------------------------------------- problemas

describe("problemasDe", () => {
  it("una publicación con los nueve aspectos en verde no tiene problemas", () => {
    expect(problemasDe(CHECKS_OK)).toHaveLength(0);
  });

  it("las infracciones van primero aunque valgan menos puntos que el resto", () => {
    const problemas = problemasDe([
      check("Health ML", "warn", "75%"),
      check("Infracciones", "bad", "tiene infracciones pendientes"),
      check("Envio gratis", "bad", "no tiene"),
    ]);
    expect(problemas[0].code).toBe("infracciones");
  });

  it("sin infracciones ordena por puntos en juego", () => {
    const problemas = problemasDe([
      check("Video", "warn", "sin video"), // 5 × 0.5 = 2.5
      check("Envio gratis", "bad", "no tiene"), // 10 × 1 = 10
      check("Health ML", "warn", "80%"), // 25 × 0.5 = 12.5
    ]);
    expect(problemas.map((p) => p.code)).toEqual(["health", "envio_gratis", "video"]);
  });

  it("un aspecto en bad pone en juego todo su peso y en warn la mitad", () => {
    const [bad] = problemasDe([check("Fotos", "bad", "1 fotos — minimo 6")]);
    const [warn] = problemasDe([check("Fotos", "warn", "3 fotos")]);
    expect(bad.puntosEnJuego).toBe(15);
    expect(warn.puntosEnJuego).toBe(7.5);
  });

  it("arrastra el detalle que informa ML y la recomendación del aspecto", () => {
    const [p] = problemasDe([check("Descripcion", "warn", "187 chars — ampliar")]);
    expect(p.detalle).toBe("187 chars — ampliar");
    expect(p.comoMejorar).toContain("500 caracteres");
  });
});

// -------------------------------------------------------------------- semáforo

describe("semaforoDe", () => {
  it("usa los mismos cortes que los niveles de ML", () => {
    expect(semaforoDe(100)).toBe("verde");
    expect(semaforoDe(80)).toBe("verde");
    expect(semaforoDe(79)).toBe("amarillo");
    expect(semaforoDe(60)).toBe("amarillo");
    expect(semaforoDe(59)).toBe("naranja");
    expect(semaforoDe(40)).toBe("naranja");
    expect(semaforoDe(39)).toBe("rojo");
    expect(semaforoDe(0)).toBe("rojo");
  });
});

// ---------------------------------------------------------------- SKU y grupos

describe("codigoBase", () => {
  it("recorta la variante y el talle", () => {
    expect(codigoBase("48000-NEG-40")).toBe("48000");
    expect(codigoBase("22108-BEI")).toBe("22108");
    expect(codigoBase("23019")).toBe("23019");
    expect(codigoBase("16214-BLA")).toBe("16214");
  });

  it("normaliza a mayúsculas y limpia espacios", () => {
    expect(codigoBase(" 48000-neg ")).toBe("48000");
    expect(codigoBase("ab12/x")).toBe("AB12");
  });
});

describe("parseSellerSku", () => {
  it("devuelve el SKU tal cual cuando ya es un SKU", () => {
    expect(parseSellerSku("48000-NEG-40")).toBe("48000-NEG-40");
  });

  it("saca el SKU de adentro del JSON que manda el ERP", () => {
    expect(parseSellerSku('{"PrId":"257","PrMPC":"1","SKU":"831-0"}')).toBe("831-0");
  });

  it("vacío, nulo o JSON roto no dan SKU", () => {
    expect(parseSellerSku(null)).toBeNull();
    expect(parseSellerSku("   ")).toBeNull();
    expect(parseSellerSku('{"PrId":"1"')).toBeNull();
    expect(parseSellerSku('{"PrId":"1"}')).toBeNull();
  });
});

describe("agruparPorSku", () => {
  it("junta las variantes del mismo código base en una sola fila", () => {
    const items = agruparPorSku([
      pub({ id: "MLU1", sku: "48000-NEG-40", score: 70 }),
      pub({ id: "MLU2", sku: "48000-BLA-41", score: 45 }),
      pub({ id: "MLU3", sku: "22108-BEI", score: 65 }),
    ]);
    expect(items).toHaveLength(2);
    const g48 = items.find((i) => i.codigo === "48000")!;
    expect(g48.publicaciones).toHaveLength(2);
    expect(g48.skus).toEqual(["48000-BLA-41", "48000-NEG-40"]);
  });

  it("el semáforo lo manda la publicación más floja del grupo", () => {
    const [g] = agruparPorSku([
      pub({ id: "MLU1", sku: "48000-NEG", score: 75 }),
      pub({ id: "MLU2", sku: "48000-BLA", score: 30 }),
    ]);
    expect(g.scorePeor).toBe(30);
    expect(g.scorePromedio).toBe(53); // (75+30)/2 = 52.5 → 53
    expect(g.semaforo).toBe("rojo");
    expect(g.publicaciones[0].id).toBe("MLU2"); // la peor primero
  });

  it("una publicación sin SKU queda en su propio grupo, identificada por el MLU", () => {
    const items = agruparPorSku([pub({ id: "MLU9", sku: null })]);
    expect(items).toHaveLength(1);
    expect(items[0].codigo).toBe("MLU9");
    expect(items[0].sinSku).toBe(true);
    expect(items[0].skus).toEqual([]);
  });

  it("no marca sinSku si al menos una publicación del grupo tiene SKU", () => {
    const [g] = agruparPorSku([
      pub({ id: "MLU1", sku: "48000-NEG" }),
      pub({ id: "MLU2", sku: "48000-BLA" }),
    ]);
    expect(g.sinSku).toBe(false);
  });

  it("cuenta a cuántas publicaciones del grupo afecta cada problema", () => {
    const conVideo = problemasDe([check("Video", "warn", "sin video")]);
    const conVideoYFotos = problemasDe([
      check("Video", "warn", "sin video"),
      check("Fotos", "bad", "1 fotos — minimo 6"),
    ]);
    const [g] = agruparPorSku([
      pub({ id: "MLU1", sku: "48000-NEG", problemas: conVideo }),
      pub({ id: "MLU2", sku: "48000-BLA", problemas: conVideoYFotos }),
    ]);
    const video = g.problemas.find((p) => p.code === "video")!;
    const fotos = g.problemas.find((p) => p.code === "fotos")!;
    expect(video.publicaciones).toBe(2);
    expect(fotos.publicaciones).toBe(1);
    // Fotos (15 pts en bad) pesa más que Video (5 en warn), así que va primero.
    expect(g.problemaPrincipal?.code).toBe("fotos");
  });

  it("cuando un aspecto está peor en una publicación, el grupo muestra el peor caso", () => {
    const [g] = agruparPorSku([
      pub({ id: "MLU1", sku: "48000-NEG", problemas: problemasDe([check("Fotos", "warn", "3 fotos")]) }),
      pub({ id: "MLU2", sku: "48000-BLA", problemas: problemasDe([check("Fotos", "bad", "1 fotos")]) }),
    ]);
    const fotos = g.problemas.find((p) => p.code === "fotos")!;
    expect(fotos.status).toBe("bad");
    expect(fotos.publicaciones).toBe(2);
  });

  it("pega las ventas del SKU unificado y promedia las estrellas ponderando por opiniones", () => {
    const ventas = new Map<string, VentasReclamos>([
      ["48000", { unidades30d: 12, unidades90d: 30, ordenes90d: 25, canceladas90d: 2, reclamos90d: 1 }],
    ]);
    const [g] = agruparPorSku(
      [
        pub({ id: "MLU1", sku: "48000-NEG", reviews: { total: 10, promedio: 5 }, visitas30d: 40 }),
        pub({ id: "MLU2", sku: "48000-BLA", reviews: { total: 10, promedio: 3 }, visitas30d: 60 }),
      ],
      ventas,
    );
    expect(g.ventas.unidades30d).toBe(12);
    expect(g.ventas.canceladas90d).toBe(2);
    expect(g.reviews).toEqual({ total: 20, promedio: 4 });
    expect(g.visitas30d).toBe(100);
  });

  it("un SKU sin ventas registradas queda en cero, no en undefined", () => {
    const [g] = agruparPorSku([pub({ sku: "99999-XXX" })]);
    expect(g.ventas.unidades30d).toBe(0);
    expect(g.ventas.reclamos90d).toBe(0);
  });

  it("prioriza lo que tiene más para recuperar y más movimiento", () => {
    const items = agruparPorSku([
      // Muy floja pero que nadie mira.
      pub({ id: "MLU1", sku: "111-A", score: 20, visitas30d: 0 }),
      // Menos floja pero con mucho tráfico.
      pub({ id: "MLU2", sku: "222-A", score: 55, visitas30d: 5000 }),
    ]);
    expect(items[0].codigo).toBe("222");
  });
});

// ------------------------------------------------------------- toPublicacion

describe("toPublicacion", () => {
  it("arma la publicación combinando el item de la lista y su experiencia", () => {
    const p = toPublicacion(
      mlItem({ seller_sku: '{"PrId":"257","SKU":"831-0"}' }),
      mlExp({ experience_score: 45, experience_level: "REGULAR", checks: [check("Video", "warn", "sin video")] }),
    );
    expect(p.sku).toBe("831-0");
    expect(p.score).toBe(45);
    expect(p.nivel).toBe("REGULAR");
    expect(p.semaforo).toBe("naranja");
    expect(p.problemas).toHaveLength(1);
    expect(p.thumbnail).toBe("https://http2.mlstatic.com/x.jpg"); // solo lo trae la lista
  });

  it("si ML no manda el nivel, se deduce del puntaje", () => {
    const p = toPublicacion(mlItem(), mlExp({ experience_score: 30, experience_level: "" }));
    expect(p.nivel).toBe("MALA");
  });

  it("sin seller_sku toma el SKU del puente de ventas", () => {
    const puente = new Map([["MLU7", "16214-BLA"]]);
    const p = toPublicacion(mlItem({ id: "MLU7", seller_sku: null }), mlExp({ id: "MLU7" }), puente);
    expect(p.sku).toBe("16214-BLA");
  });

  it("el seller_sku de ML le gana al puente", () => {
    const puente = new Map([["MLU7", "99999-VIEJO"]]);
    const p = toPublicacion(
      mlItem({ id: "MLU7", seller_sku: "16214-BLA" }),
      mlExp({ id: "MLU7" }),
      puente,
    );
    expect(p.sku).toBe("16214-BLA");
  });

  it("sin seller_sku ni puente la publicación queda sin SKU", () => {
    const p = toPublicacion(mlItem({ id: "MLU7", seller_sku: null }), mlExp({ id: "MLU7" }), new Map());
    expect(p.sku).toBeNull();
  });
});

// --------------------------------------------------------------------- reporte

describe("evaluarExperiencia", () => {
  const opts = { generadoEn: "2026-07-29T12:00:00.000Z", params: normalizeExperienciaParams(null) };

  it("deja afuera las perfectas y las cuenta aparte", () => {
    const r = evaluarExperiencia(
      [
        { item: mlItem({ id: "MLU1", seller_sku: "111-A" }), exp: mlExp({ id: "MLU1", experience_score: 100 }) },
        {
          item: mlItem({ id: "MLU2", seller_sku: "222-A" }),
          exp: mlExp({ id: "MLU2", experience_score: 60, checks: [check("Video", "warn", "sin video")] }),
        },
      ],
      opts,
    );
    expect(r.summary.activas).toBe(2);
    expect(r.summary.perfectas).toBe(1);
    expect(r.summary.aMejorar).toBe(1);
    expect(r.items).toHaveLength(1);
    expect(r.items[0].codigo).toBe("222");
  });

  it("las publicaciones cuya experiencia no se pudo leer no se evalúan", () => {
    const r = evaluarExperiencia(
      [
        { item: mlItem({ id: "MLU1" }), exp: null },
        { item: mlItem({ id: "MLU2", seller_sku: "222-A" }), exp: mlExp({ id: "MLU2", experience_score: 50 }) },
      ],
      { ...opts, fallidos: 1 },
    );
    expect(r.summary.activas).toBe(1);
    expect(r.fallidos).toBe(1);
  });

  it("suma los puntos en juego y reparte el semáforo", () => {
    const r = evaluarExperiencia(
      [
        { item: mlItem({ id: "MLU1", seller_sku: "111-A" }), exp: mlExp({ id: "MLU1", experience_score: 30 }) },
        { item: mlItem({ id: "MLU2", seller_sku: "222-A" }), exp: mlExp({ id: "MLU2", experience_score: 50 }) },
        { item: mlItem({ id: "MLU3", seller_sku: "333-A" }), exp: mlExp({ id: "MLU3", experience_score: 70 }) },
      ],
      opts,
    );
    expect(r.summary.rojo).toBe(1);
    expect(r.summary.naranja).toBe(1);
    expect(r.summary.amarillo).toBe(1);
    expect(r.summary.puntosEnJuego).toBe(70 + 50 + 30);
    expect(r.summary.scorePromedio).toBe(50);
  });

  it("cuenta los SKU con infracciones", () => {
    const r = evaluarExperiencia(
      [
        {
          item: mlItem({ id: "MLU1", seller_sku: "111-A" }),
          exp: mlExp({ id: "MLU1", experience_score: 50, checks: [check("Infracciones", "bad", "tiene")] }),
        },
      ],
      opts,
    );
    expect(r.summary.conInfracciones).toBe(1);
  });

  it("un umbral más bajo lista solo lo que está peor que eso", () => {
    const rows = [
      { item: mlItem({ id: "MLU1", seller_sku: "111-A" }), exp: mlExp({ id: "MLU1", experience_score: 85 }) },
      { item: mlItem({ id: "MLU2", seller_sku: "222-A" }), exp: mlExp({ id: "MLU2", experience_score: 40 }) },
    ];
    const r = evaluarExperiencia(rows, { ...opts, params: { umbral: 60, minCaida: 5 } });
    expect(r.items).toHaveLength(1);
    expect(r.items[0].codigo).toBe("222");
  });

  it("el puente item→SKU permite unificar publicaciones que ML devuelve sin seller_sku", () => {
    const rows = [
      { item: mlItem({ id: "MLU1", seller_sku: null }), exp: mlExp({ id: "MLU1", experience_score: 60 }) },
      { item: mlItem({ id: "MLU2", seller_sku: null }), exp: mlExp({ id: "MLU2", experience_score: 40 }) },
    ];
    // Sin puente: dos grupos sueltos identificados por el MLU.
    const sinPuente = evaluarExperiencia(rows, opts);
    expect(sinPuente.items).toHaveLength(2);
    expect(sinPuente.items.every((i) => i.sinSku)).toBe(true);

    // Con puente: las dos son variantes del mismo código base.
    const conPuente = evaluarExperiencia(rows, {
      ...opts,
      skuPorItem: new Map([
        ["MLU1", "48000-NEG"],
        ["MLU2", "48000-BLA"],
      ]),
    });
    expect(conPuente.items).toHaveLength(1);
    expect(conPuente.items[0].codigo).toBe("48000");
    expect(conPuente.items[0].publicaciones).toHaveLength(2);
    expect(conPuente.items[0].sinSku).toBe(false);
  });

  it("sin reclamos por SKU el flag queda en false para poder avisarlo", () => {
    const r = evaluarExperiencia([], opts);
    expect(r.reclamosPorSkuDisponibles).toBe(false);
    expect(r.summary.scorePromedio).toBeNull();
  });
});

// ------------------------------------------------------------------- params

describe("normalizeExperienciaParams", () => {
  it("sin config guardada usa los defaults", () => {
    // minCaida 14 está calibrado por encima de la inconsistencia de ±13 pts que
    // devuelve la API según cómo se lea la publicación (ver DEFAULT_EXPERIENCIA_PARAMS).
    expect(normalizeExperienciaParams(null)).toEqual({ umbral: 100, minCaida: 14 });
  });

  it("acota los valores fuera de rango y redondea", () => {
    expect(normalizeExperienciaParams({ umbral: 500, minCaida: 0 })).toEqual({ umbral: 100, minCaida: 1 });
    expect(normalizeExperienciaParams({ umbral: -3, minCaida: 7.6 })).toEqual({ umbral: 1, minCaida: 8 });
  });

  it("la basura cae al default en vez de romper", () => {
    expect(normalizeExperienciaParams({ umbral: "hola" as unknown as number })).toEqual({
      umbral: 100,
      minCaida: 14,
    });
  });
});

// -------------------------------------------------------------------- caídas

describe("detectarCaidas", () => {
  const grupo = (over: Partial<PubExperiencia>) => agruparPorSku([pub(over)]);

  it("la primera vez que se ve una publicación no hay caída", () => {
    const items = grupo({ id: "MLU1", score: 40 });
    expect(detectarCaidas(items, [], 5)).toHaveLength(0);
  });

  it("avisa cuando el puntaje bajó más que el umbral", () => {
    const items = grupo({ id: "MLU1", sku: "48000-NEG", score: 50 });
    const caidas = detectarCaidas(items, [{ itemId: "MLU1", score: 65 }], 5);
    expect(caidas).toHaveLength(1);
    expect(caidas[0]).toMatchObject({
      itemId: "MLU1",
      codigo: "48000",
      scoreAnterior: 65,
      score: 50,
      delta: 15,
      nivelAnterior: "BUENA",
      cruzo100: false,
    });
  });

  it("una caída chica no molesta", () => {
    const items = grupo({ id: "MLU1", score: 63 });
    expect(detectarCaidas(items, [{ itemId: "MLU1", score: 65 }], 5)).toHaveLength(0);
  });

  it("dejar de estar en 100% se avisa aunque sea de un punto", () => {
    const items = grupo({ id: "MLU1", score: 99 });
    const caidas = detectarCaidas(items, [{ itemId: "MLU1", score: 100 }], 5);
    expect(caidas).toHaveLength(1);
    expect(caidas[0].cruzo100).toBe(true);
    expect(caidas[0].delta).toBe(1);
  });

  it("mejorar o quedar igual no es una caída", () => {
    const items = grupo({ id: "MLU1", score: 70 });
    expect(detectarCaidas(items, [{ itemId: "MLU1", score: 70 }], 5)).toHaveLength(0);
    expect(detectarCaidas(items, [{ itemId: "MLU1", score: 50 }], 5)).toHaveLength(0);
  });

  it("el cruce del 100% va antes que una caída más grande", () => {
    const items = agruparPorSku([
      pub({ id: "MLU1", sku: "111-A", score: 99 }),
      pub({ id: "MLU2", sku: "222-A", score: 20 }),
    ]);
    const caidas = detectarCaidas(
      items,
      [
        { itemId: "MLU1", score: 100 },
        { itemId: "MLU2", score: 60 },
      ],
      5,
    );
    expect(caidas.map((c) => c.itemId)).toEqual(["MLU1", "MLU2"]);
  });

  it("arrastra el problema principal del momento de la caída", () => {
    const items = agruparPorSku([
      pub({ id: "MLU1", score: 50, problemas: problemasDe([check("Fotos", "bad", "1 fotos — minimo 6")]) }),
    ]);
    const [c] = detectarCaidas(items, [{ itemId: "MLU1", score: 70 }], 5);
    expect(c.problemaPrincipal).toBe("Fotos");
  });
});

// ------------------------------------------------------- confirmar caídas

describe("confirmarPendientes", () => {
  /** Índice de lo que leyó la corrida de hoy. */
  const hoy = (score: number, over: Partial<PubExperiencia> = {}) =>
    new Map([
      [
        "MLU1",
        pub({
          id: "MLU1",
          sku: "48000-NEG",
          score,
          nivel: score >= 60 ? "BUENA" : score >= 40 ? "REGULAR" : "MALA",
          problemas: problemasDe([check("Fotos", "bad", "1 fotos")]),
          ...over,
        }),
      ],
    ]);
  const pendiente = { itemId: "MLU1", bajoDe: 70, score: 50 };

  it("si hoy sigue caída, se confirma y sale el mail", () => {
    const out = confirmarPendientes([pendiente], hoy(50), 5);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      itemId: "MLU1",
      codigo: "48000",
      scoreAnterior: 70,
      score: 50,
      delta: 20,
      nivelAnterior: "BUENA",
    });
  });

  it("si hoy volvió al puntaje original, era un artefacto de lectura y no se avisa", () => {
    expect(confirmarPendientes([pendiente], hoy(70), 5)).toHaveLength(0);
  });

  it("si hoy está aún peor, el delta se actualiza al de hoy", () => {
    const [c] = confirmarPendientes([pendiente], hoy(35), 5);
    expect(c.score).toBe(35);
    expect(c.delta).toBe(35);
    expect(c.nivel).toBe("MALA");
  });

  it("si hoy recuperó casi todo y quedó por debajo del mínimo, no se avisa", () => {
    // 70 → 67 son 3 puntos: por debajo de minCaida 5.
    expect(confirmarPendientes([pendiente], hoy(67), 5)).toHaveLength(0);
  });

  it("una publicación que ya no está activa no se avisa", () => {
    expect(confirmarPendientes([pendiente], new Map(), 5)).toHaveLength(0);
  });

  it("el cruce del 100% se confirma aunque sea de un punto", () => {
    const out = confirmarPendientes([{ itemId: "MLU1", bajoDe: 100, score: 99 }], hoy(99), 5);
    expect(out).toHaveLength(1);
    expect(out[0].cruzo100).toBe(true);
    expect(out[0].delta).toBe(1);
  });

  it("una publicación sin SKU se agrupa por su MLU", () => {
    const [c] = confirmarPendientes([pendiente], hoy(50, { sku: null }), 5);
    expect(c.codigo).toBe("MLU1");
    expect(c.sku).toBeNull();
  });

  it("ordena: primero el cruce del 100%, después la peor caída", () => {
    const actual = new Map([
      ["MLU1", pub({ id: "MLU1", sku: "111-A", score: 99 })],
      ["MLU2", pub({ id: "MLU2", sku: "222-A", score: 20 })],
    ]);
    const out = confirmarPendientes(
      [
        { itemId: "MLU1", bajoDe: 100, score: 99 },
        { itemId: "MLU2", bajoDe: 60, score: 20 },
      ],
      actual,
      5,
    );
    expect(out.map((c) => c.itemId)).toEqual(["MLU1", "MLU2"]);
  });
});

// ---------------------------------------------------------------------- mail

describe("asuntoCaidas", () => {
  const caida = (over: Record<string, unknown> = {}) =>
    ({
      itemId: "MLU1",
      codigo: "48000",
      sku: "48000-NEG",
      titulo: "Silla de madera",
      permalink: null,
      scoreAnterior: 70,
      score: 50,
      delta: 20,
      nivelAnterior: "BUENA",
      nivel: "REGULAR",
      cruzo100: false,
      problemaPrincipal: "Fotos",
      ...over,
    }) as Parameters<typeof asuntoCaidas>[0][number];

  it("una sola caída nombra la publicación y el salto", () => {
    expect(asuntoCaidas([caida()])).toContain("Silla de madera");
    expect(asuntoCaidas([caida()])).toContain("70% → 50%");
  });

  it("varias caídas se resumen en la cantidad", () => {
    expect(asuntoCaidas([caida(), caida({ itemId: "MLU2" })])).toContain("2 publicaciones");
  });

  it("cuando todas cruzaron el 100% lo dice explícito", () => {
    const s = asuntoCaidas([caida({ cruzo100: true, scoreAnterior: 100, score: 95, delta: 5 })]);
    expect(s).toContain("dejó de estar en 100%");
  });
});

describe("cuerpoCaidas", () => {
  const caidas = Array.from({ length: 30 }, (_, i) => ({
    itemId: `MLU${i}`,
    codigo: `${1000 + i}`,
    sku: `${1000 + i}-NEG`,
    titulo: `Producto ${i}`,
    permalink: `https://articulo.mercadolibre.com.uy/MLU-${i}`,
    scoreAnterior: 80,
    score: 60,
    delta: 20,
    nivelAnterior: "EXCELENTE",
    nivel: "BUENA",
    cruzo100: false,
    problemaPrincipal: "Fotos",
  }));

  it("arma texto y HTML con el detalle de cada caída", () => {
    const { text, html } = cuerpoCaidas(caidas.slice(0, 2));
    expect(text).toContain("Producto 0");
    expect(text).toContain("80% → 60%");
    expect(text).toContain("Problema principal: Fotos");
    expect(html).toContain("Producto 0");
    expect(html).toContain("−20 pts");
  });

  it("corta la lista larga y dice cuántas quedaron afuera", () => {
    const { text, html } = cuerpoCaidas(caidas, { max: 25 });
    expect(text).toContain("… y 5 más.");
    expect(html).toContain("… y 5 más.");
  });

  it("incluye el link al panel cuando se sabe la URL", () => {
    const { text, html } = cuerpoCaidas(caidas.slice(0, 1), { panelUrl: "https://panel.test/reportes/experiencia" });
    expect(text).toContain("https://panel.test/reportes/experiencia");
    expect(html).toContain('href="https://panel.test/reportes/experiencia"');
  });

  it("escapa el HTML de los títulos para no romper el mail", () => {
    const { html } = cuerpoCaidas([
      { ...caidas[0], titulo: 'Silla <b>"grande"</b> & co', permalink: null },
    ]);
    expect(html).toContain("Silla &lt;b&gt;&quot;grande&quot;&lt;/b&gt; &amp; co");
    expect(html).not.toContain("<b>\"grande\"</b>");
  });
});
