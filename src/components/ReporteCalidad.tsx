"use client";

import { useCallback, useEffect, useState } from "react";
import { fmtInt, fmtDateTime } from "@/lib/format";
import { calidadEstado, type CalidadItem, type CalidadReport, type Severidad } from "@/lib/calidad";

type Filtro = "todas" | "infracciones" | "sin-foto";

const sevTone: Record<Severidad, string> = {
  alta: "bg-red-500/15 text-red-300",
  media: "bg-amber-500/15 text-amber-300",
  baja: "bg-zinc-500/15 text-zinc-300",
};
const sevLabel: Record<Severidad, string> = { alta: "Alta", media: "Media", baja: "Baja" };

export default function ReporteCalidad() {
  const [report, setReport] = useState<CalidadReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [abierta, setAbierta] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/reportes/calidad", { cache: "no-store", signal: AbortSignal.timeout(60000) });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || `Error ${res.status}`);
      setReport(j.report);
    } catch (e) {
      const err = e as Error;
      setError(err.name === "TimeoutError" ? "La consulta tardó demasiado (timeout)." : err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  const s = report?.summary;
  const items = (report?.items ?? []).filter((it) => {
    if (filtro === "infracciones") return it.infracciones;
    if (filtro === "sin-foto") return it.objetivos.some((o) => o.code === "foto_principal");
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="card flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
        <div className="min-w-0 text-sm text-zinc-400">
          {s ? (
            <>
              <span className="font-semibold text-zinc-200">{fmtInt(s.activas)}</span> publicaciones activas ·{" "}
              calidad promedio{" "}
              <span className="font-semibold text-zinc-200">
                {s.healthPromedio === null ? "—" : `${Math.round(s.healthPromedio * 100)}%`}
              </span>
              {report ? ` · ${fmtDateTime(report.generadoEn)}` : ""}
            </>
          ) : (
            <span className="text-zinc-500">Evaluando…</span>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            onClick={load}
            disabled={loading}
            className="rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm font-semibold text-zinc-200 transition hover:bg-white/10 disabled:opacity-60"
          >
            {loading ? "Evaluando…" : "Actualizar"}
          </button>
          <a
            href="/api/reportes/calidad/export"
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm font-semibold text-zinc-200 transition hover:bg-white/10"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 21h16" />
            </svg>
            Excel
          </a>
        </div>
      </div>

      {error && <div className="rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2.5 text-sm text-red-300">{error}</div>}

      {/* KPIs (clic para filtrar) */}
      {s && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi label="A mejorar" value={fmtInt(s.aMejorar)} accent active={filtro === "todas"} onClick={() => setFiltro("todas")} />
          <Kpi label="Al máximo" value={fmtInt(s.maxima)} />
          <Kpi label="Con infracciones" value={fmtInt(s.conInfracciones)} active={filtro === "infracciones"} onClick={() => setFiltro(filtro === "infracciones" ? "todas" : "infracciones")} />
          <Kpi label="Sin foto principal buena" value={fmtInt(s.sinFotoPrincipal)} active={filtro === "sin-foto"} onClick={() => setFiltro(filtro === "sin-foto" ? "todas" : "sin-foto")} />
        </div>
      )}

      {loading && !report ? (
        <div className="card px-4 py-12 text-center text-sm text-zinc-400">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="mx-auto mb-2 h-5 w-5 animate-spin text-zinc-500"><path d="M21 12a9 9 0 1 1-2.64-6.36" strokeLinecap="round" /></svg>
          Consultando la calidad de las publicaciones en MercadoLibre…
        </div>
      ) : items.length === 0 ? (
        <div className="card px-4 py-12 text-center">
          <p className="text-sm text-zinc-300">✅ No hay publicaciones para mejorar con este filtro.</p>
          <p className="mt-1 text-xs text-zinc-500">Todas las activas están en su calidad máxima.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {items.map((it) => (
            <Fila key={it.id} it={it} abierta={abierta === it.id} onToggle={() => setAbierta(abierta === it.id ? null : it.id)} />
          ))}
        </div>
      )}

      <p className="px-1 text-xs leading-relaxed text-zinc-500">
        La <b className="text-zinc-400">calidad</b> es el <i>health</i> que calcula MercadoLibre (0–100%). Se listan las
        publicaciones activas que no están al máximo, con los objetivos que ML permite accionar: foto principal, resto de fotos,
        ficha técnica/atributos, carrito, descuentos de fidelidad, infracciones y visibilidad. El principal motor del puntaje suele
        ser la <b className="text-zinc-400">ficha técnica</b> completa. Datos en vivo de MUNDO SHOP.
      </p>
    </div>
  );
}

function Kpi({ label, value, accent, active, onClick }: { label: string; value: string; accent?: boolean; active?: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`card p-3 text-left transition sm:p-4 ${onClick ? "cursor-pointer hover:bg-white/[0.04]" : "cursor-default"} ${active && onClick ? "ring-2 ring-teal-500/40" : accent ? "ring-1 ring-teal-500/25" : ""}`}
    >
      <div className="text-[11px] text-zinc-500 sm:text-xs">{label}</div>
      <div className={`text-xl font-bold tabular-nums sm:text-2xl ${accent ? "text-teal-300" : "text-white"}`}>{value}</div>
    </button>
  );
}

function Fila({ it, abierta, onToggle }: { it: CalidadItem; abierta: boolean; onToggle: () => void }) {
  const est = calidadEstado(it.calidadPct);
  return (
    <div className="card overflow-hidden">
      <button onClick={onToggle} className="flex w-full items-center gap-3 p-3 text-left transition hover:bg-white/[0.03]">
        {it.thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={it.thumbnail} alt="" className="h-12 w-12 shrink-0 rounded object-cover" />
        ) : (
          <div className="h-12 w-12 shrink-0 rounded bg-white/5" />
        )}
        <div className="min-w-0 flex-1">
          <div className="line-clamp-2 text-sm font-medium leading-snug text-zinc-100">{it.titulo}</div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="font-mono text-zinc-500">{it.sku ?? it.id}</span>
            {it.infracciones && <span className="rounded bg-red-500/15 px-1.5 py-0.5 font-semibold text-red-300">Infracción</span>}
            {it.visibilidadReducida && <span className="rounded bg-amber-500/15 px-1.5 py-0.5 font-semibold text-amber-300">Visibilidad ↓</span>}
            <span className="text-zinc-500">{it.objetivos.length} objetivo{it.objetivos.length === 1 ? "" : "s"}</span>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className={`text-lg font-bold tabular-nums ${est.tone}`}>{it.calidadPct === null ? "—" : `${it.calidadPct}%`}</div>
          <div className="text-[10px] uppercase tracking-wide text-zinc-500">{est.label}</div>
        </div>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={`h-4 w-4 shrink-0 text-zinc-500 transition-transform ${abierta ? "rotate-90" : ""}`}>
          <path d="m9 18 6-6-6-6" />
        </svg>
      </button>

      {abierta && (
        <div className="border-t border-white/10 p-3 sm:p-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Objetivos para llevar la calidad al máximo</div>
          <ul className="space-y-1.5">
            {it.objetivos.map((o) => (
              <li key={o.code} className="flex items-start gap-2 text-sm text-zinc-200">
                <span className="mt-0.5 h-4 w-4 shrink-0 rounded-full border border-white/20" />
                <span className="flex-1">{o.label}</span>
                <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${sevTone[o.severidad]}`}>{sevLabel[o.severidad]}</span>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-zinc-400">
            {it.permalink && (
              <a href={it.permalink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-teal-300 hover:text-teal-200">
                Ver publicación
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5"><path d="M7 17 17 7M7 7h10v10" /></svg>
              </a>
            )}
            {it.price !== null && <span>Precio: $ {it.price.toLocaleString("es-UY")}</span>}
            {it.disponibles !== null && <span>Stock ML: {fmtInt(it.disponibles)}</span>}
            {it.vendidas !== null && <span>Vendidas: {fmtInt(it.vendidas)}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
