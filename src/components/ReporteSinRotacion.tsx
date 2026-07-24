"use client";

import { useCallback, useEffect, useState } from "react";
import { fmtInt, fmtDateTime } from "@/lib/format";
import { motivoLabel, type Motivo, type RotacionItem, type RotacionParams } from "@/lib/rotacion";

type Config = { params: RotacionParams };
type Summary = { total: number; sinStock: number; conStock: number; unidadesPerdidas: number };
type Ventana = { actualDesde: string; actualHasta: string; mesDesde: string; mesHasta: string; anioDesde: string; anioHasta: string };

const motivoTone: Record<Motivo, string> = {
  "sin-stock": "bg-red-500/15 text-red-300",
  "sin-stock-en-camino": "bg-sky-500/15 text-sky-300",
  "con-stock": "bg-violet-500/15 text-violet-300",
};

export default function ReporteSinRotacion() {
  const [items, setItems] = useState<RotacionItem[]>([]);
  const [summary, setSummary] = useState<Summary>({ total: 0, sinStock: 0, conStock: 0, unidadesPerdidas: 0 });
  const [ventana, setVentana] = useState<Ventana | null>(null);
  const [hayAnio, setHayAnio] = useState(true);
  const [generadoEn, setGeneradoEn] = useState<string | null>(null);
  const [p, setP] = useState<RotacionParams | null>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingCfg, setSavingCfg] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showCfg, setShowCfg] = useState(false);
  // Filtro por motivo (null = todos).
  const [filtro, setFiltro] = useState<Motivo | null>(null);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/reportes/sin-rotacion", { cache: "no-store", signal: AbortSignal.timeout(60000) });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || `Error ${res.status}`);
      setItems(j.report.items);
      setSummary(j.report.summary);
      setVentana(j.report.ventana);
      setHayAnio(j.report.hayDatosAnioPasado);
      setGeneradoEn(j.report.generadoEn);
      setP(j.config.params);
    } catch (e) {
      const err = e as Error;
      setError(err.name === "TimeoutError" ? "La consulta tardó demasiado (timeout)." : err.message);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await refresh();
      setLoading(false);
    })();
  }, [refresh]);

  async function guardarConfig() {
    if (!p) return;
    setSavingCfg(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/reportes/sin-rotacion/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ params: p }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || `Error ${res.status}`);
      setP(j.config.params);
      setNotice("Configuración guardada. Actualizá para recalcular.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSavingCfg(false);
    }
  }

  const setParam = (k: keyof RotacionParams, v: number) => setP((prev) => (prev ? { ...prev, [k]: v } : prev));

  const busy = loading || refreshing;
  const shown = filtro ? items.filter((r) => r.motivo === filtro) : items;
  const empty = !busy && items.length === 0;

  return (
    <div className="space-y-4">
      {/* ---------- Barra de acciones ---------- */}
      <div className="card flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
        <div className="min-w-0 text-sm text-zinc-400">
          {ventana ? (
            <>
              Actual <span className="text-zinc-300">{ventana.actualDesde} → {ventana.actualHasta}</span> · vs mes pasado y
              año pasado{generadoEn ? ` · ${fmtDateTime(generadoEn)}` : ""}
              {!hayAnio && <span className="ml-1 text-amber-400/80">(sin datos del año pasado)</span>}
            </>
          ) : (
            <span className="text-zinc-500">Generando…</span>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            onClick={refresh}
            disabled={busy}
            className="rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm font-semibold text-zinc-200 transition hover:bg-white/10 disabled:opacity-60"
          >
            {refreshing ? "Generando…" : "Actualizar"}
          </button>
          <a
            href="/api/reportes/sin-rotacion/export"
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

      {/* ---------- KPIs (clic para filtrar por motivo) ---------- */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Publicaciones sin rotación" value={fmtInt(summary.total)} active={filtro === null} onClick={() => setFiltro(null)} accent />
        <Kpi label="Sin stock (agotadas)" value={fmtInt(summary.sinStock)} active={filtro === "sin-stock"} onClick={() => setFiltro(filtro === "sin-stock" ? null : "sin-stock")} />
        <Kpi label="Con stock, no rotan" value={fmtInt(summary.conStock)} active={filtro === "con-stock"} onClick={() => setFiltro(filtro === "con-stock" ? null : "con-stock")} />
        <Kpi label="Unidades perdidas" value={fmtInt(summary.unidadesPerdidas)} />
      </div>

      {/* ---------- Config ---------- */}
      <div className="card overflow-hidden">
        <button
          onClick={() => setShowCfg((v) => !v)}
          className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold text-zinc-200 transition hover:bg-white/[0.03]"
        >
          <span>Umbrales de detección</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={`h-4 w-4 transition-transform ${showCfg ? "rotate-90" : ""}`}>
            <path d="m9 18 6-6-6-6" />
          </svg>
        </button>
        {showCfg && p && (
          <div className="space-y-4 border-t border-white/10 p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <NumField label="Ventana de cada período (días)" value={p.ventanaDias} onChange={(v) => setParam("ventanaDias", v)} />
              <NumField label="Mín. unidades que vendía antes" value={p.minUnidadesRef} onChange={(v) => setParam("minUnidadesRef", v)} />
              <NumField label="Caída mínima (%)" value={Math.round(p.caidaMin * 100)} step={5} onChange={(v) => setParam("caidaMin", Math.min(100, Math.max(0, v)) / 100)} />
            </div>
            <div className="flex items-center justify-end gap-2">
              <button onClick={refresh} className="rounded-lg px-3 py-2 text-sm text-zinc-400 transition hover:text-white">Deshacer</button>
              <button
                onClick={guardarConfig}
                disabled={savingCfg}
                className="brand-gradient rounded-xl px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
              >
                {savingCfg ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </div>
        )}
      </div>

      {busy && items.length === 0 ? (
        <div className="card px-4 py-12 text-center text-sm text-zinc-400">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="mx-auto mb-2 h-5 w-5 animate-spin text-zinc-500"><path d="M21 12a9 9 0 1 1-2.64-6.36" strokeLinecap="round" /></svg>
          Comparando ventas contra el mes pasado y el año pasado…
        </div>
      ) : empty ? (
        <div className="card px-4 py-12 text-center">
          <p className="text-sm text-zinc-300">✅ Ninguna publicación cayó por encima del umbral.</p>
          <p className="mt-1 text-xs text-zinc-500">Todos los productos que vendían siguen rotando a un ritmo similar o mayor.</p>
        </div>
      ) : (
        <>
          {/* ---------- Cards (celular) ---------- */}
          <div className="space-y-2.5 lg:hidden">
            {shown.map((r) => (
              <MobileCard key={r.codigo} r={r} />
            ))}
          </div>

          {/* ---------- Tabla (desktop) ---------- */}
          <div className="card hidden overflow-x-auto lg:block">
            <table className="w-full border-collapse text-sm">
              <thead className="border-b border-white/10 bg-white/[0.03] text-xs uppercase tracking-wide text-zinc-400">
                <tr>
                  <th className="px-3 py-3 text-left font-semibold">Código padre</th>
                  <th className="px-3 py-3 text-left font-semibold">Título</th>
                  <th className="px-3 py-3 text-right font-semibold">Actual</th>
                  <th className="px-3 py-3 text-right font-semibold">Mes pasado</th>
                  <th className="px-3 py-3 text-right font-semibold">Año pasado</th>
                  <th className="px-3 py-3 text-right font-semibold">Caída</th>
                  <th className="px-3 py-3 text-right font-semibold">Perdidas</th>
                  <th className="px-3 py-3 text-right font-semibold">Stock</th>
                  <th className="px-3 py-3 text-left font-semibold">Motivo probable</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {shown.map((r) => (
                  <tr key={r.codigo} className="transition hover:bg-white/[0.03]">
                    <td className="whitespace-nowrap px-3 py-2.5 font-mono font-medium text-zinc-100">{r.codigo}</td>
                    <td className="max-w-[240px] truncate px-3 py-2.5 text-zinc-300" title={r.titulo ?? ""}>
                      {r.titulo ?? <span className="text-zinc-600">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-zinc-100">{fmtInt(r.ventaActual)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-zinc-400">{fmtInt(r.ventaMesPasado)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-zinc-400">{r.ventaAnioPasado > 0 ? fmtInt(r.ventaAnioPasado) : "—"}</td>
                    <td className="px-3 py-2.5 text-right"><Caida mes={r.caidaMesPct} anio={r.caidaAnioPct} /></td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-bold text-amber-300">{fmtInt(r.unidadesPerdidas)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-zinc-300">
                      {r.stock === null ? <span className="text-zinc-600">—</span> : fmtInt(r.stock)}
                      {r.enCamino > 0 && <span className="ml-1 text-[11px] text-sky-300">+{fmtInt(r.enCamino)}</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`whitespace-nowrap rounded px-1.5 py-0.5 text-xs font-semibold ${motivoTone[r.motivo]}`}>{motivoLabel(r.motivo)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <p className="px-1 text-xs leading-relaxed text-zinc-500">
        Se marca un código padre cuando vendía al menos <b>{p?.minUnidadesRef ?? 5}</b> unidades (el mes pasado o el año pasado) y
        ahora vende <b>≥ {Math.round((p?.caidaMin ?? 0.5) * 100)}%</b> menos. «Motivo probable»: <b>Sin stock</b> = está agotado
        (probablemente por eso dejó de venderse); <b>Con stock — no rota</b> = tiene stock pero igual cayó, así que el tema es la
        publicación (precio, pausada, competencia) o la demanda. Ventas = ML + Odoo (local, mayorista y otros), sin duplicar ML.
      </p>
    </div>
  );
}

// ---------- Subcomponentes ----------
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

function NumField({ label, value, onChange, step = 1 }: { label: string; value: number; onChange: (v: number) => void; step?: number }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium text-zinc-500">{label}</span>
      <input type="number" min={0} step={step} value={value} onChange={(e) => onChange(Number(e.target.value) || 0)} className="field !py-2 text-sm" />
    </label>
  );
}

function Caida({ mes, anio }: { mes: number | null; anio: number | null }) {
  return (
    <div className="flex flex-col items-end gap-0.5 text-xs tabular-nums">
      <Delta label="m" v={mes} />
      <Delta label="a" v={anio} />
    </div>
  );
}

function Delta({ label, v }: { label: string; v: number | null }) {
  if (v === null) return <span className="text-zinc-600">{label}: —</span>;
  const pct = Math.round(Math.abs(v) * 100);
  // v > 0 = cayó (malo, rojo/ámbar); v < 0 = creció (verde tenue).
  if (v > 0) return <span className={v >= 0.5 ? "text-red-300" : "text-amber-300"}>{label}: ↓{pct}%</span>;
  if (v < 0) return <span className="text-emerald-300/80">{label}: ↑{pct}%</span>;
  return <span className="text-zinc-500">{label}: 0%</span>;
}

function MobileCard({ r }: { r: RotacionItem }) {
  return (
    <div className="card p-3">
      <div className="line-clamp-2 text-sm font-medium leading-snug text-zinc-100">
        {r.titulo ?? <span className="text-zinc-600">—</span>}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
        <span className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-zinc-300">{r.codigo}</span>
        <span className={`rounded px-1.5 py-0.5 font-semibold ${motivoTone[r.motivo]}`}>{motivoLabel(r.motivo)}</span>
      </div>
      <div className="mt-2.5 grid grid-cols-4 gap-2 border-t border-white/5 pt-2.5 text-center">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-zinc-500">Actual</div>
          <div className="text-sm font-semibold tabular-nums text-zinc-100">{fmtInt(r.ventaActual)}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-zinc-500">Mes pas.</div>
          <div className="text-sm font-semibold tabular-nums text-zinc-400">{fmtInt(r.ventaMesPasado)}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-zinc-500">Año pas.</div>
          <div className="text-sm font-semibold tabular-nums text-zinc-400">{r.ventaAnioPasado > 0 ? fmtInt(r.ventaAnioPasado) : "—"}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-amber-300/80">Perdidas</div>
          <div className="text-sm font-bold tabular-nums text-amber-300">{fmtInt(r.unidadesPerdidas)}</div>
        </div>
      </div>
    </div>
  );
}
