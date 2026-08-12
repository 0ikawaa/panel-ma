// Excel del reporte semanal: una fila por variante, con la foto embebida.
//
// La planilla se arma con SheetJS y después `xlsxFotos.inyectarFotos` le mete
// las imágenes ancladas a la columna A. Las fotos se pasan ya descargadas
// (`bytesPorSku`) porque este módulo no toca la red: bajarlas es trabajo de
// `semanal.server.ts`.

import * as XLSX from "xlsx";
import { inyectarFotos, type FotoCelda } from "@/lib/xlsxFotos";
import { fmtCobertura, type SemanalReport } from "@/lib/semanal";

export type FotoBytes = { data: Uint8Array; ext: "jpeg" | "png" };

const COLUMNAS = [
  "Foto",
  "SKU",
  "Producto",
  "Categoría",
  "Código padre",
  "Vendidas en la semana",
  "Ritmo (u/día)",
  "Stock",
  "En camino",
  "Cubre",
  "Meses de cobertura",
  "Pedir",
];

// Alto de fila y ancho de la columna de fotos, en píxeles. La caja de la imagen
// va un poco más chica para que quede aire alrededor.
const FILA_PX = 76;
const COL_FOTO_PX = 92;
const CAJA = { w: COL_FOTO_PX - 8, h: FILA_PX - 8 };

/**
 * Arma el .xlsx del reporte y devuelve los bytes listos para adjuntar.
 * `bytesPorSku` es opcional: sin fotos la planilla sale igual, sólo que vacía
 * la columna A.
 */
export async function buildSemanalXlsx(
  report: SemanalReport,
  bytesPorSku: Map<string, FotoBytes> = new Map(),
): Promise<Uint8Array> {
  const { items, ventana, params, summary } = report;
  const wb = XLSX.utils.book_new();

  // ------------------------------------------------------ hoja 1: por variante
  const info = [
    [`Reporte semanal · ${ventana.label}`],
    [`Semana ${ventana.desde} a ${ventana.hasta} · generado ${report.generadoEn.slice(0, 10)}`],
    [
      `Ritmo medido sobre los últimos ${params.ritmoDias} días (desde ${ventana.ritmoDesde}); ` +
        `"Pedir" son las unidades para cubrir ${params.mesesObjetivo} meses` +
        (params.descontarEnCamino ? ", descontando lo que ya viene en camino." : "."),
    ],
    [],
  ];

  const filas = items.map((it) => [
    "", // columna de la foto: la imagen se ancla acá
    it.sku,
    it.titulo ?? "",
    it.categoria ?? "",
    it.codigoBase,
    it.unidadesSemana,
    Number(it.velDia.toFixed(2)),
    it.stock,
    it.enCamino,
    fmtCobertura(it.mesesCobertura),
    // El número crudo aparte del texto, para poder ordenar y filtrar por él.
    it.mesesCobertura === null ? "" : Number(it.mesesCobertura.toFixed(2)),
    it.pedir,
  ]);

  const ws = XLSX.utils.aoa_to_sheet([...info, COLUMNAS, ...filas]);
  ws["!cols"] = [
    { wpx: COL_FOTO_PX }, { wch: 14 }, { wch: 60 }, { wch: 26 }, { wch: 13 },
    { wch: 20 }, { wch: 13 }, { wch: 9 }, { wch: 11 }, { wch: 10 }, { wch: 18 }, { wch: 10 },
  ];

  // Las filas de datos van altas para que entre la foto; las del encabezado no.
  const headerRow = info.length; // 0-based: fila de los títulos de columna
  const primeraFila = headerRow + 1;
  ws["!rows"] = [
    ...Array.from({ length: primeraFila }, () => ({})),
    ...items.map(() => ({ hpx: FILA_PX })),
  ];

  ws["!autofilter"] = {
    ref: XLSX.utils.encode_range({
      s: { r: headerRow, c: 0 },
      e: { r: headerRow + filas.length, c: COLUMNAS.length - 1 },
    }),
  };
  // Congelar el encabezado: son cientos de filas y sin esto se pierde de vista.
  ws["!freeze"] = { xSplit: 0, ySplit: primeraFila };
  XLSX.utils.book_append_sheet(wb, ws, "Por variante");

  // -------------------------------------------------------- hoja 2: resumen
  const resumen = [
    ["Reporte semanal", ventana.label],
    ["Semana", `${ventana.desde} a ${ventana.hasta}`],
    [],
    ["Unidades vendidas", summary.unidadesSemana],
    ["Variantes vendidas", summary.variantes],
    ["Productos distintos", summary.productos],
    [],
    [`Variantes que no llegan a ${params.mesesObjetivo} meses`, summary.aReponer],
    ["Unidades a pedir", summary.unidadesAPedir],
    ["Vendieron y están sin stock", summary.sinStock],
    [],
    ["Meses objetivo", params.mesesObjetivo],
    ["Días de ritmo", params.ritmoDias],
    ["Descuenta lo que viene en camino", params.descontarEnCamino ? "sí" : "no"],
  ];
  const wsResumen = XLSX.utils.aoa_to_sheet(resumen);
  wsResumen["!cols"] = [{ wch: 40 }, { wch: 24 }];
  XLSX.utils.book_append_sheet(wb, wsResumen, "Resumen");

  const base = new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer);

  // Las fotos se anclan a la columna A de cada fila de datos.
  const fotos: FotoCelda[] = [];
  items.forEach((it, i) => {
    const f = bytesPorSku.get(it.sku);
    if (f) fotos.push({ row: primeraFila + i, col: 0, data: f.data, ext: f.ext });
  });

  return inyectarFotos(base, fotos, { hoja: 0, caja: CAJA });
}
