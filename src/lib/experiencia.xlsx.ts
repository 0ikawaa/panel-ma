// El Excel del reporte de experiencia de compra.
//
// Vive acá y no en la ruta para poder testearlo y para poder generarlo desde un
// script sin levantar la app: es el entregable que más se usa (se reparte para
// trabajar), así que conviene poder mirarlo sin depender de la base.

import * as XLSX from "xlsx";
import {
  SEMAFORO_TEXTO,
  VENTANA_DIAS,
  type CambioSku,
  type ExperienciaReport,
} from "@/lib/experiencia";

/**
 * Lo que necesita el Excel: el reporte, y si hubo captura anterior, los cambios
 * contra esa. Se pide estructural (y no el tipo del server) para que este módulo
 * no arrastre Prisma.
 */
export type ReportParaExcel = ExperienciaReport & {
  comparadoCon?: { capturadoEn: string } | null;
  cambios?: CambioSku[];
};

export const COLUMNAS_POR_SKU = [
  "Semáforo",
  "Experiencia listado %",
  "SKU",
  "Título",
  "Reclamos",
  `Ventas ${VENTANA_DIAS} d`,
  "Problema principal",
  "Cómo mejorar — según Mercado Libre",
  "Nivel ML",
  `Problemas ${VENTANA_DIAS} d`,
  "Tipos de problema",
  `Ventas ${VENTANA_DIAS} d (nuestra base)`,
  "Publicaciones",
  "Cancelaciones",
  "Todos los tipos de problema",
  "Aviso de ML",
  "Link",
];

const fechaUy = (iso: string) =>
  new Date(iso).toLocaleString("es-UY", { timeZone: "America/Montevideo" });

/** Arma el workbook completo: hoja "Por SKU" + hoja "Resumen". */
export function experienciaWorkbook(report: ReportParaExcel): XLSX.WorkBook {
  const { items, summary } = report;
  const wb = XLSX.utils.book_new();

  // -------------------------------------------------------- hoja 1: por SKU
  const rows = items.map((it) => [
    SEMAFORO_TEXTO[it.semaforo],
    it.experiencia ?? "",
    it.sku ?? "(sin SKU)",
    it.titulo,
    it.reclamos || "",
    it.ventas180d ?? "",
    it.problemaPrincipalTexto,
    it.comoMejorar ?? "",
    it.nivel ?? "",
    it.problemas180d || "",
    it.tiposProblema || "",
    it.ventasBd180d ?? "",
    it.publicaciones.length,
    it.cancelaciones || "",
    it.problemas
      .map(
        (p) =>
          `• ${p.categoria}: ${p.cantidad} problema${p.cantidad === 1 ? "" : "s"}` +
          (p.principal ? " [PRINCIPAL]" : ""),
      )
      .join("\n"),
    it.aviso ?? "",
    it.publicaciones[0]?.url ?? "",
  ]);

  const ws = XLSX.utils.aoa_to_sheet([COLUMNAS_POR_SKU, ...rows]);
  ws["!cols"] = [
    { wch: 12 }, { wch: 20 }, { wch: 16 }, { wch: 60 }, { wch: 10 }, { wch: 13 },
    { wch: 40 }, { wch: 80 }, { wch: 10 }, { wch: 15 }, { wch: 17 },
    { wch: 22 }, { wch: 13 }, { wch: 14 }, { wch: 55 }, { wch: 60 }, { wch: 40 },
  ];
  // Autofiltro en la fila de títulos: la hoja se usa para repartir trabajo, así
  // que conviene poder filtrar por problema o por semáforo sin armarlo a mano.
  ws["!autofilter"] = {
    ref: XLSX.utils.encode_range({
      s: { r: 0, c: 0 },
      e: { r: rows.length, c: COLUMNAS_POR_SKU.length - 1 },
    }),
  };
  XLSX.utils.book_append_sheet(wb, ws, "Por SKU");

  // -------------------------------------------------------- hoja 2: resumen
  const yaEn100 =
    summary.publicacionesCapturadas -
    summary.publicaciones -
    summary.sinPuntaje -
    summary.noLeidas;

  const resumen: (string | number)[][] = [
    [`Experiencia de compra por SKU — publicaciones por debajo del ${report.params.umbral} %`],
    [
      `Captura del panel de vendedor: ${fechaUy(report.capturadoEn)} · ${summary.skus} SKU ` +
        `(${summary.publicaciones} publicaciones) de ${summary.publicacionesCapturadas} revisadas`,
    ],
    [],
    ["Semáforo"],
    [SEMAFORO_TEXTO.rojo, `Experiencia de ${report.params.rojoHasta} % o menos`, summary.rojo, "SKU"],
    [
      SEMAFORO_TEXTO.amarillo,
      `Experiencia por debajo de ${report.params.umbral} % (${report.params.rojoHasta + 1} a ${report.params.umbral - 1} %)`,
      summary.amarillo,
      "SKU",
    ],
    [],
    ["Problemas de compradores"],
    ["SKU con reclamos", summary.conReclamos],
    ["SKU sin reclamos registrados", summary.sinReclamos],
    [`Total de reclamos (${VENTANA_DIAS} días)`, summary.reclamosTotales],
    ["Cancelaciones informadas", summary.cancelacionesTotales],
    [`Unidades vendidas por los SKU con reclamos (${VENTANA_DIAS} d)`, summary.ventasConReclamos],
    [`SKU sin ventas en ${VENTANA_DIAS} días`, summary.sinVentas],
    ...(summary.sinDatos > 0 ? [["SKU que no se pudieron leer del panel", summary.sinDatos]] : []),
    [],
    ["Problema principal por SKU — ordenado por reclamos"],
    ["Problema principal", "SKU", "Reclamos", "Cómo mejorar — según Mercado Libre"],
    ...summary.ranking.map((r) => [r.categoria, r.skus, r.reclamos, r.comoMejorar ?? ""]),
    [],
    ["Qué quedó afuera"],
    [
      `Publicaciones sin puntaje (ML no lo calcula sin ventas en ${VENTANA_DIAS} días)`,
      summary.sinPuntaje,
    ],
    ...(summary.noLeidas > 0
      ? [["Publicaciones cuya fila del listado no se pudo leer", summary.noLeidas]]
      : []),
    [`Publicaciones ya en ${report.params.umbral} %`, yaEn100],
    [],
    ["Cómo se agrupó"],
    [
      "Mercado Libre calcula la experiencia a nivel producto: las publicaciones que comparten SKU traen los mismos reclamos, las mismas ventas y el mismo consejo.",
    ],
    [
      "Por eso los reclamos y las ventas se toman UNA vez por SKU y no se suman entre publicaciones hermanas. La columna «Publicaciones» dice cuántas comparten ese SKU.",
    ],
    [
      "Las publicaciones sin SKU cargado en Mercado Libre aparecen como filas propias, marcadas «(sin SKU)».",
    ],
    [
      `Las ventas de «Ventas ${VENTANA_DIAS} d» son las que informa Mercado Libre. Cuando el panel no las dice (los SKU sin problemas), está la columna de nuestra base.`,
    ],
  ];

  if (report.comparadoCon) {
    const cambios = report.cambios ?? [];
    resumen.push(
      [],
      ["Cambios contra la captura anterior"],
      [`Captura anterior: ${fechaUy(report.comparadoCon.capturadoEn)}`],
      ["SKU que empeoraron", cambios.length],
    );
    if (cambios.length > 0) {
      resumen.push(
        ["SKU", "Reclamos antes", "Reclamos ahora", "Problema principal"],
        ...cambios.map((c) => [
          c.sku ?? c.clave,
          c.reclamosAntes,
          c.reclamos,
          c.problemaPrincipal,
        ]),
      );
    }
  }

  const wsRes = XLSX.utils.aoa_to_sheet(resumen);
  wsRes["!cols"] = [{ wch: 52 }, { wch: 46 }, { wch: 12 }, { wch: 90 }];
  XLSX.utils.book_append_sheet(wb, wsRes, "Resumen");

  return wb;
}

/** El workbook serializado, listo para responder o escribir a disco. */
export function experienciaXlsxBuffer(report: ReportParaExcel): Buffer {
  return XLSX.write(experienciaWorkbook(report), { type: "buffer", bookType: "xlsx" });
}
