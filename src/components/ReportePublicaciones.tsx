"use client";

import { useCallback, useEffect, useState } from "react";
import { fmtInt, fmtDateTime } from "@/lib/format";
import type { InactivaItem, MotivoInactiva, PublicacionesParams, PublicacionesReport, SinVentasItem, VentanaUnidad } from "@/lib/publicaciones";

type Tab = "inactivas" | "sin-ventas";

const motivoTone: Record<MotivoInactiva, string> = {
  "sin-stock": "bg-red-500/15 text-red-300",
  "pausada-vendedor": "bg-amber-500/15 text-amber-300",
  cerrada: "bg-zinc-500/15 text-zinc-300",
  otra: "bg-violet-500/15 text-violet-300",
};

export default function ReportePublicaciones() {
  const [report, setReport] = useState<PublicacionesReport | null>(null);
  const [p, setP] = useState<PublicacionesParams | null>(null);
  const [tab, setTab] = useState<Tab>("inactivas");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [savingCfg, setSavingCfg] = useState(false);
  const [showCfg, setShowCfg] = useState(false);

  // Al abrir la pantalla vale el reporte cacheado (es instantáneo); apretar
  // «Actualizar» pide explícitamente que se rehaga con los datos de ahora.
  const load = useCallback(async (forzar = false) => {
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const url = forzar
        ? "/api/reportes/publicaciones?forzar=1"
        : "/api/reportes/publicaciones";
      const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(60000) });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || `Error ${res.status}`);
      setReport(j.report);
      setP(j.config.params);
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

  async function guardarConfig() {
    if (!p) return;
    setSavingCfg(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/reportes/publicaciones/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ params: p }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || `Error ${res.status}`);
      setP(j.config.params);
      setNotice("Ventana guardada. Actualizá para recalcular.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSavingCfg(false);
    }
  }

  const s = report?.summary;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="card flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
        <div className="min-w-0 text-sm text-zinc-400">
          {report ? (
            <>Ventana «sin ventas»: <span className="font-semibold text-zinc-200">{report.ventana.label}</span> · {fmtDateTime(report.generadoEn)}</>
          ) : (
            <span className="text-zinc-500">Generando…</span>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            onClick={() => void load(true)}
            disabled={loading}
            className="rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm font-semibold text-zinc-200 transition hover:bg-white/10 disabled:opacity-60"
          >
            {loading ? "Generando…" : "Actualizar"}
          </button>
          <a
            href="/api/reportes/publicaciones/export"
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
      {notice && <div className="rounded-xl border border-teal-500/25 bg-teal-500/10 px-3 py-2.5 text-sm text-teal-200">{notice}</div>}

      {/* Tabs */}
      <div className="inline-flex rounded-xl border border-white/10 bg-white/[0.02] p-1">
        <TabBtn active={tab === "inactivas"} onClick={() => setTab("inactivas")}>
          Inactivas con stock {s ? <span className="ml-1 opacity-70">({fmtInt(s.inactivasConStock)})</span> : null}
        </TabBtn>
        <TabBtn active={tab === "sin-ventas"} onClick={() => setTab("sin-ventas")}>
          Sin ventas {s ? <span className="ml-1 opacity-70">({fmtInt(s.sinVentasTotal)})</span> : null}
        </TabBtn>
      </div>

      {loading && !report ? (
        <div className="card px-4 py-12 text-center text-sm text-zinc-400">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="mx-auto mb-2 h-5 w-5 animate-spin text-zinc-500"><path d="M21 12a9 9 0 1 1-2.64-6.36" strokeLinecap="round" /></svg>
          Consultando publicaciones y cruzando con el stock de Odoo…
        </div>
      ) : tab === "inactivas" ? (
        <Inactivas report={report!} />
      ) : (
        <SinVentas report={report!} p={p} setP={setP} showCfg={showCfg} setShowCfg={setShowCfg} savingCfg={savingCfg} onGuardar={guardarConfig} onRefresh={load} />
      )}
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition ${active ? "brand-gradient text-white" : "text-zinc-400 hover:text-white"}`}
    >
      {children}
    </button>
  );
}

// ---------- Tab A: inactivas con stock ----------
function Inactivas({ report }: { report: PublicacionesReport }) {
  const { inactivas, summary } = report;
  if (inactivas.length === 0) {
    return (
      <div className="card px-4 py-12 text-center">
        <p className="text-sm text-zinc-300">✅ No hay publicaciones inactivas con stock en Odoo.</p>
        <p className="mt-1 text-xs text-zinc-500">
          Se revisaron {fmtInt(summary.inactivasTotal)} inactivas ({fmtInt(summary.inactivasSinMapa)} sin SKU mapeable a Odoo).
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <p className="px-1 text-xs text-zinc-500">
        {fmtInt(inactivas.length)} publicaciones pausadas o cerradas en ML que <b className="text-zinc-400">todavía tienen stock en Odoo</b>.
        De {fmtInt(summary.inactivasTotal)} inactivas en total; {fmtInt(summary.inactivasSinMapa)} no se pudieron cruzar (nunca vendieron, sin SKU).
      </p>
      {summary.inactivasNoLeidas > 0 && (
        <p className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-300/80">
          MercadoLibre sólo permite leer 1000 publicaciones por estado: quedaron {fmtInt(summary.inactivasNoLeidas)} inactivas sin
          analizar (de {fmtInt(summary.inactivasReales)} en total). Se priorizaron las primeras que devuelve ML.
        </p>
      )}
      {inactivas.map((it) => (
        <InactivaCard key={it.id} it={it} />
      ))}
    </div>
  );
}

function InactivaCard({ it }: { it: InactivaItem }) {
  return (
    <div className="card p-3 sm:p-4">
      <div className="flex gap-3">
        {it.thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={it.thumbnail} alt="" className="h-14 w-14 shrink-0 rounded object-cover" />
        ) : (
          <div className="h-14 w-14 shrink-0 rounded bg-white/5" />
        )}
        <div className="min-w-0 flex-1">
          <div className="line-clamp-2 text-sm font-medium leading-snug text-zinc-100">{it.titulo}</div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="font-mono text-zinc-400">{it.skus.join(", ") || it.id}</span>
            <span className={`rounded px-1.5 py-0.5 font-semibold ${motivoTone[it.motivo]}`}>{it.motivoLabel}</span>
            <span className="rounded bg-white/5 px-1.5 py-0.5 text-zinc-400">{it.status === "closed" ? "cerrada" : "pausada"}</span>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-lg font-bold tabular-nums text-teal-300">{fmtInt(it.stockOdoo)}</div>
          <div className="text-[10px] uppercase tracking-wide text-zinc-500">stock Odoo</div>
          {it.enCamino > 0 && <div className="text-[11px] text-sky-300">+{fmtInt(it.enCamino)} en camino</div>}
        </div>
      </div>
      <div className="mt-2.5 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2 text-sm text-zinc-300">
        {it.explicacion}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-zinc-500">
        {it.permalink && (
          <a href={it.permalink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-teal-300 hover:text-teal-200">
            Ver publicación
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5"><path d="M7 17 17 7M7 7h10v10" /></svg>
          </a>
        )}
        {it.mlDisponible !== null && <span>Stock en ML: {fmtInt(it.mlDisponible)}</span>}
        {it.vendidas !== null && <span>Vendidas (histórico): {fmtInt(it.vendidas)}</span>}
      </div>
    </div>
  );
}

// ---------- Tab B: sin ventas ----------
function SinVentas({
  report,
  p,
  setP,
  showCfg,
  setShowCfg,
  savingCfg,
  onGuardar,
  onRefresh,
}: {
  report: PublicacionesReport;
  p: PublicacionesParams | null;
  setP: (u: (prev: PublicacionesParams | null) => PublicacionesParams | null) => void;
  showCfg: boolean;
  setShowCfg: (v: (prev: boolean) => boolean) => void;
  savingCfg: boolean;
  onGuardar: () => void;
  onRefresh: () => void;
}) {
  const { sinVentas, summary, ventana } = report;
  return (
    <div className="space-y-3">
      {/* Config de la ventana */}
      <div className="card overflow-hidden">
        <button onClick={() => setShowCfg((v) => !v)} className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold text-zinc-200 transition hover:bg-white/[0.03]">
          <span>Ventana sin ventas · <span className="text-zinc-400">{ventana.label}</span></span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={`h-4 w-4 transition-transform ${showCfg ? "rotate-90" : ""}`}>
            <path d="m9 18 6-6-6-6" />
          </svg>
        </button>
        {showCfg && p && (
          <div className="space-y-4 border-t border-white/10 p-4">
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block text-[11px] font-medium text-zinc-500">Cantidad</span>
                <input type="number" min={1} value={p.ventanaCantidad} onChange={(e) => setP((prev) => (prev ? { ...prev, ventanaCantidad: Math.max(1, Number(e.target.value) || 1) } : prev))} className="field !py-2 text-sm" />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-medium text-zinc-500">Unidad</span>
                <select value={p.ventanaUnidad} onChange={(e) => setP((prev) => (prev ? { ...prev, ventanaUnidad: e.target.value as VentanaUnidad } : prev))} className="field !py-2 text-sm">
                  <option value="semana">Semanas</option>
                  <option value="mes">Meses</option>
                </select>
              </label>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button onClick={onRefresh} className="rounded-lg px-3 py-2 text-sm text-zinc-400 transition hover:text-white">Deshacer</button>
              <button onClick={onGuardar} disabled={savingCfg} className="brand-gradient rounded-xl px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60">
                {savingCfg ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="card p-3 sm:p-4">
          <div className="text-[11px] text-zinc-500 sm:text-xs">Sin ventas en {ventana.label}</div>
          <div className="text-xl font-bold tabular-nums text-white sm:text-2xl">{fmtInt(summary.sinVentasTotal)}</div>
        </div>
        <div className="card p-3 sm:p-4">
          <div className="text-[11px] text-zinc-500 sm:text-xs">De esas, con stock (plata quieta)</div>
          <div className="text-xl font-bold tabular-nums text-amber-300 sm:text-2xl">{fmtInt(summary.sinVentasConStock)}</div>
        </div>
      </div>

      {sinVentas.length === 0 ? (
        <div className="card px-4 py-12 text-center">
          <p className="text-sm text-zinc-300">✅ Todas las publicaciones activas vendieron algo en {ventana.label}.</p>
        </div>
      ) : (
        <>
          {/* Cards (celular) */}
          <div className="space-y-2.5 lg:hidden">
            {sinVentas.map((it) => (
              <SinVentaCard key={it.id} it={it} />
            ))}
          </div>
          {/* Tabla (desktop) */}
          <div className="card hidden overflow-x-auto lg:block">
            <table className="w-full border-collapse text-sm">
              <thead className="border-b border-white/10 bg-white/[0.03] text-xs uppercase tracking-wide text-zinc-400">
                <tr>
                  <th className="px-3 py-3 text-left font-semibold">Publicación</th>
                  <th className="px-3 py-3 text-left font-semibold">SKU</th>
                  <th className="px-3 py-3 text-right font-semibold">Stock</th>
                  <th className="px-3 py-3 text-right font-semibold">Vendidas</th>
                  <th className="px-3 py-3 text-left font-semibold">Última venta</th>
                  <th className="px-3 py-3 text-right font-semibold">Días sin vender</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {sinVentas.map((it) => (
                  <tr key={it.id} className="transition hover:bg-white/[0.03]">
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        {it.thumbnail ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={it.thumbnail} alt="" className="h-8 w-8 shrink-0 rounded object-cover" />
                        ) : (
                          <div className="h-8 w-8 shrink-0 rounded bg-white/5" />
                        )}
                        <a href={it.permalink ?? "#"} target="_blank" rel="noopener noreferrer" className="max-w-[320px] truncate text-zinc-200 hover:text-teal-200" title={it.titulo}>{it.titulo}</a>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[11px] text-zinc-400">{it.sku ?? "—"}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {it.stock === null ? <span className="text-zinc-600">—</span> : <span className={it.conStock ? "font-semibold text-amber-300" : "text-zinc-400"}>{fmtInt(it.stock)}</span>}
                      {it.stockOrigen === "ml" && <span className="ml-1 text-[10px] text-zinc-600">ML</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-zinc-400">{fmtInt(it.vendidas)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-zinc-400">{it.ultimaVenta ?? <span className="text-zinc-600">nunca</span>}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-zinc-300">{it.diasSinVenta ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <p className="px-1 text-xs leading-relaxed text-zinc-500">
        Publicaciones <b className="text-zinc-400">activas</b> que no vendieron ninguna unidad desde {ventana.desde}. «Stock» es el de
        Odoo cuando se puede mapear el SKU; si no, el disponible en ML (marcado «ML»). Las que tienen stock son las más importantes:
        están publicadas, con inventario, y no rotan.
      </p>
    </div>
  );
}

function SinVentaCard({ it }: { it: SinVentasItem }) {
  return (
    <div className="card p-3">
      <div className="flex gap-2.5">
        {it.thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={it.thumbnail} alt="" className="h-12 w-12 shrink-0 rounded object-cover" />
        ) : (
          <div className="h-12 w-12 shrink-0 rounded bg-white/5" />
        )}
        <div className="min-w-0 flex-1">
          <a href={it.permalink ?? "#"} target="_blank" rel="noopener noreferrer" className="line-clamp-2 text-sm font-medium leading-snug text-zinc-100 hover:text-teal-200">{it.titulo}</a>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-zinc-500">
            <span className="font-mono">{it.sku ?? "—"}</span>
            <span>· última venta: {it.ultimaVenta ?? "nunca"}</span>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className={`text-base font-bold tabular-nums ${it.conStock ? "text-amber-300" : "text-zinc-400"}`}>{fmtInt(it.stock)}</div>
          <div className="text-[10px] uppercase tracking-wide text-zinc-500">stock{it.stockOrigen === "ml" ? " ML" : ""}</div>
        </div>
      </div>
    </div>
  );
}
