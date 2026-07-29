import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { computeExperiencia } from "@/lib/experiencia.server";
import { EXPERIENCIA_MAX } from "@/lib/experiencia";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

// GET /api/reportes/experiencia/export → descarga el reporte como Excel.
// Dos hojas: una fila por SKU unificado y otra con el detalle publicación por
// publicación (para poder filtrar y repartir el trabajo).
export async function GET() {
  let report;
  try {
    report = await computeExperiencia();
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message || "No se pudo generar el reporte." },
      { status: 502 },
    );
  }

  const { items, summary, reputacion } = report;
  const wb = XLSX.utils.book_new();

  // ---------------------------------------------------- hoja 1: SKU unificados
  const info = [
    ["Reporte: Publicaciones con mala experiencia de compra"],
    [
      `Activas: ${summary.activas} · Por debajo de ${report.params.umbral}%: ${summary.aMejorar} ` +
        `· SKU unificados: ${summary.codigos} · Puntaje promedio: ${summary.scorePromedio ?? "—"}%`,
    ],
    [
      `Semáforo — rojo: ${summary.rojo} · naranja: ${summary.naranja} · amarillo: ${summary.amarillo} · verde: ${summary.verde}` +
        ` · con infracciones: ${summary.conInfracciones}`,
    ],
    [`Puntos en juego (suma de lo que falta para 100): ${summary.puntosEnJuego}`],
    reputacion
      ? [
          `Reputación del vendedor (120 días): reclamos ${reputacion.reclamos120d} (${reputacion.reclamosTasaPct ?? "—"})` +
            ` · demoras ${reputacion.demoras120d} (${reputacion.demorasTasaPct ?? "—"})` +
            ` · cancelaciones ${reputacion.cancelaciones120d} (${reputacion.cancelacionesTasaPct ?? "—"})`,
        ]
      : ["Reputación del vendedor: no se pudo leer."],
    report.reclamosPorSkuDisponibles
      ? []
      : ["Reclamos por publicación: MercadoLibre todavía no habilita ese permiso (solo hay el total del vendedor)."],
    [],
  ];

  const header = [
    "Código (SKU unificado)", "Título", "Semáforo", "Puntaje peor", "Puntaje promedio", "Nivel",
    "Problema principal", "Cómo mejorar (ML)", "Tipos de problema", "Publicaciones", "SKUs",
    "Visitas 30d", "Unidades 30d", "Unidades 90d", "Órdenes 90d", "Canceladas 90d", "Reclamos 90d",
    "Opiniones", "Estrellas", "Vendidas (histórico)", "Puntos en juego",
  ];
  const semaforoTxt: Record<string, string> = {
    rojo: "🔴 Rojo",
    naranja: "🟠 Naranja",
    amarillo: "🟡 Amarillo",
    verde: "🟢 Verde",
  };
  const rows = items.map((it) => [
    it.codigo + (it.sinSku ? " (sin SKU)" : ""),
    it.titulo,
    semaforoTxt[it.semaforo] ?? it.semaforo,
    it.scorePeor,
    it.scorePromedio,
    it.nivel,
    it.problemaPrincipal ? `${it.problemaPrincipal.label}: ${it.problemaPrincipal.detalle}` : "",
    it.problemaPrincipal?.comoMejorar ?? "",
    it.problemas
      .map(
        (p) =>
          `• ${p.label} (${p.status === "bad" ? "crítico" : "a mejorar"}): ${p.detalle}` +
          (p.publicaciones > 1 ? ` [${p.publicaciones} publicaciones]` : ""),
      )
      .join("\n"),
    it.publicaciones.length,
    it.skus.join(", "),
    it.visitas30d,
    it.ventas.unidades30d,
    it.ventas.unidades90d,
    it.ventas.ordenes90d,
    it.ventas.canceladas90d,
    report.reclamosPorSkuDisponibles ? it.ventas.reclamos90d : "s/d",
    it.reviews.total,
    it.reviews.promedio ?? "",
    it.vendidasHistorico,
    EXPERIENCIA_MAX - it.scorePeor,
  ]);

  const ws = XLSX.utils.aoa_to_sheet([...info, header, ...rows]);
  ws["!cols"] = [
    { wch: 20 }, { wch: 48 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 11 },
    { wch: 42 }, { wch: 70 }, { wch: 60 }, { wch: 13 }, { wch: 24 },
    { wch: 11 }, { wch: 12 }, { wch: 12 }, { wch: 11 }, { wch: 13 }, { wch: 12 },
    { wch: 10 }, { wch: 9 }, { wch: 18 }, { wch: 14 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, "SKU unificados");

  // ------------------------------------------- hoja 2: detalle por publicación
  const detHeader = [
    "Código", "MLU", "SKU", "Título", "Puntaje", "Nivel", "Problema principal",
    "Tipos de problema", "Precio", "Stock ML", "Visitas 30d", "Opiniones", "Estrellas", "Link",
  ];
  const detRows = items.flatMap((it) =>
    it.publicaciones.map((p) => [
      it.codigo,
      p.id,
      p.sku ?? "",
      p.titulo,
      p.score,
      p.nivel,
      p.problemas[0] ? `${p.problemas[0].label}: ${p.problemas[0].detalle}` : "",
      p.problemas
        .map((pr) => `• ${pr.label} (${pr.status === "bad" ? "crítico" : "a mejorar"}): ${pr.detalle}`)
        .join("\n"),
      p.precio ?? "",
      p.disponibles ?? "",
      p.visitas30d ?? "",
      p.reviews.total,
      p.reviews.promedio ?? "",
      p.permalink ?? "",
    ]),
  );
  const wsDet = XLSX.utils.aoa_to_sheet([detHeader, ...detRows]);
  wsDet["!cols"] = [
    { wch: 16 }, { wch: 15 }, { wch: 16 }, { wch: 48 }, { wch: 9 }, { wch: 11 }, { wch: 42 },
    { wch: 60 }, { wch: 11 }, { wch: 10 }, { wch: 11 }, { wch: 10 }, { wch: 9 }, { wch: 40 },
  ];
  XLSX.utils.book_append_sheet(wb, wsDet, "Publicaciones");

  const buf: Buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="experiencia-de-compra.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
