"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fmtInt, fmtDateTime } from "@/lib/format";
import type { CancelacionesReport, CancelPeriodo, Comparacion, Granularidad } from "@/lib/cancelaciones";

function pct(v: number, dec = 1): string {
  return `${(v * 100).toFixed(dec)}%`;
}
function fmtMonto(n: number | null): string {
  if (n == null) return "—";
  return "$ " + n.toLocaleString("es-UY", { maximumFractionDigits: 0 });
}

type DetalleItem = {
  id: string;
  fecha: string;
  sku: string | null;
  titulo: string | null;
  cantidad: number;
  monto: number | null;
  comprador: string | null;
  motivo: "fraude" | "no-pagada" | "otro";
  motivoLabel: string;
  flags: string[];
  envio: string | null;
  thumb: string | null;
};

const motivoTone: Record<string, string> = {
  fraude: "bg-red-500/15 text-red-300",
  "no-pagada": "bg-amber-500/15 text-amber-300",
  otro: "bg-zinc-500/15 text-zinc-300",
};

export default function ReporteCancelaciones() {
  const [gran, setGran] = useState<Granularidad>("semana");
  const [report, setReport] = useState<CancelacionesReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Detalle del período seleccionado (al clickear una barra).
  const [sel, setSel] = useState<CancelPeriodo | null>(null);
  const [detalle, setDetalle] = useState<DetalleItem[] | null>(null);
  const [detLoading, setDetLoading] = useState(false);
  const [detError, setDetError] = useState<string | null>(null);

  const load = useCallback(async (g: Granularidad) => {
    setLoading(true);
    setError(null);
    setSel(null);
    setDetalle(null);
    try {
      const res = await fetch(`/api/reportes/cancelaciones?granularidad=${g}`, {
        cache: "no-store",
        signal: AbortSignal.timeout(60000),
      });
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
    load(gran);
  }, [gran, load]);

  const verDetalle = useCallback(async (p: CancelPeriodo) => {
    if (sel?.key === p.key) {
      setSel(null);
      setDetalle(null);
      return;
    }
    setSel(p);
    setDetalle(null);
    setDetError(null);
    if (p.canceladas === 0) return;
    setDetLoading(true);
    try {
      const res = await fetch(`/api/reportes/cancelaciones/detalle?desde=${p.desde}&hasta=${p.hasta}`, {
        cache: "no-store",
        signal: AbortSignal.timeout(60000),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || `Error ${res.status}`);
      setDetalle(j.items);
    } catch (e) {
      setDetError((e as Error).message);
    } finally {
      setDetLoading(false);
    }
  }, [sel]);

  const maxCanc = useMemo(() => Math.max(1, ...(report?.series ?? []).map((s) => s.canceladas)), [report]);

  return (
    <div className="space-y-4">
      {/* ---------- Toolbar ---------- */}
      <div className="card flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
        <div className="inline-flex rounded-xl border border-white/10 bg-white/[0.02] p-1">
          {(["semana", "mes"] as Granularidad[]).map((g) => (
            <button
              key={g}
              onClick={() => setGran(g)}
              className={`rounded-lg px-4 py-1.5 text-sm font-semibold capitalize transition ${
                gran === g ? "brand-gradient text-white" : "text-zinc-400 hover:text-white"
              }`}
            >
              Por {g}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-sm text-zinc-400">
          {report && <span className="hidden sm:inline">{fmtDateTime(report.generadoEn)}</span>}
          <button
            onClick={() => load(gran)}
            disabled={loading}
            className="rounded-xl border border-white/10 bg-white/5 px-3.5 py-2 text-sm font-semibold text-zinc-200 transition hover:bg-white/10 disabled:opacity-60"
          >
            {loading ? "Cargando…" : "Actualizar"}
          </button>
          <a
            href={`/api/reportes/cancelaciones/export?granularidad=${gran}`}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3.5 py-2 text-sm font-semibold text-zinc-200 transition hover:bg-white/10"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 21h16" />
            </svg>
            Excel
          </a>
        </div>
      </div>

      {error && <div className="rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2.5 text-sm text-red-300">{error}</div>}

      {/* ---------- Comparación ---------- */}
      {report && <Comparativa c={report.comparacion} gran={gran} />}

      {/* ---------- KPIs del rango ---------- */}
      {report && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi label="Órdenes (rango)" value={fmtInt(report.totales.totalOrdenes)} />
          <Kpi label="Canceladas (rango)" value={fmtInt(report.totales.canceladas)} />
          <Kpi label="No pagadas" value={fmtInt(report.totales.noPagada)} />
          <Kpi label="Por fraude" value={fmtInt(report.totales.fraude)} />
        </div>
      )}

      {/* ---------- Serie (barras) ---------- */}
      <div className="card p-3 sm:p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">Canceladas por {gran}</h3>
          <span className="text-xs text-zinc-500">tasa = canceladas / órdenes</span>
        </div>
        {loading && !report ? (
          <div className="py-10 text-center text-sm text-zinc-400">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="mx-auto mb-2 h-5 w-5 animate-spin text-zinc-500"><path d="M21 12a9 9 0 1 1-2.64-6.36" strokeLinecap="round" /></svg>
            Cargando…
          </div>
        ) : (
          <div className="space-y-1.5">
            {report?.series.map((s) => (
              <Barra key={s.key} s={s} max={maxCanc} selected={sel?.key === s.key} onClick={() => verDetalle(s)} />
            ))}
            <p className="pt-1 text-[11px] text-zinc-500">Tocá una barra para ver el detalle de esas cancelaciones.</p>
          </div>
        )}
      </div>

      {/* ---------- Detalle del período ---------- */}
      {sel && (
        <Detalle
          periodo={sel}
          items={detalle}
          loading={detLoading}
          error={detError}
          onClose={() => { setSel(null); setDetalle(null); }}
        />
      )}

      <p className="px-1 text-xs leading-relaxed text-zinc-500">
        Cancelaciones de órdenes de MercadoLibre. <b className="text-zinc-400">No pagada</b> = el comprador generó la orden pero no
        completó el pago (la mayoría). <b className="text-zinc-400">Fraude</b> = ML la canceló por sospecha de fraude. La comparación
        toma el último período <b>cerrado</b> (el en curso se muestra aparte, marcado «en curso»). Los <b>reclamos</b> reales se
        sumarán acá cuando se habilite ese sync en MUNDO SHOP.
      </p>
    </div>
  );
}

// ---------- Subcomponentes ----------
function Comparativa({ c, gran }: { c: Comparacion; gran: Granularidad }) {
  if (!c.actual || !c.anterior) {
    return (
      <div className="card p-4 text-sm text-zinc-400">
        Todavía no hay dos {gran === "mes" ? "meses" : "semanas"} cerrados para comparar.
      </div>
    );
  }
  const subio = (c.deltaCanceladas ?? 0) > 0; // más cancelaciones = peor
  const igual = (c.deltaCanceladas ?? 0) === 0;
  const tone = igual ? "text-zinc-300" : subio ? "text-red-300" : "text-emerald-300";
  const flecha = igual ? "→" : subio ? "▲" : "▼";
  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-zinc-500">Último {gran} cerrado · {c.actual.label}</div>
          <div className="mt-0.5 flex items-baseline gap-2">
            <span className="text-3xl font-bold tabular-nums text-white">{fmtInt(c.actual.canceladas)}</span>
            <span className="text-sm text-zinc-400">canceladas · tasa {pct(c.actual.tasa)}</span>
          </div>
        </div>
        <div className="text-right">
          <div className={`text-lg font-bold tabular-nums ${tone}`}>
            {flecha} {c.deltaCanceladas! >= 0 ? "+" : ""}{fmtInt(c.deltaCanceladas!)}
            {c.deltaPct !== null && <span className="ml-1 text-sm">({c.deltaPct >= 0 ? "+" : ""}{pct(c.deltaPct, 0)})</span>}
          </div>
          <div className="text-[11px] text-zinc-500">vs {c.anterior.label} ({fmtInt(c.anterior.canceladas)} · {pct(c.anterior.tasa)})</div>
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-3 sm:p-4">
      <div className="text-[11px] text-zinc-500 sm:text-xs">{label}</div>
      <div className="text-xl font-bold tabular-nums text-white sm:text-2xl">{value}</div>
    </div>
  );
}

function Barra({ s, max, selected, onClick }: { s: CancelPeriodo; max: number; selected: boolean; onClick: () => void }) {
  const w = Math.round((s.canceladas / max) * 100);
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-lg px-1 py-0.5 text-left text-xs transition hover:bg-white/[0.04] ${selected ? "bg-white/[0.06] ring-1 ring-teal-500/40" : ""}`}
    >
      <div className={`w-24 shrink-0 truncate ${s.parcial ? "text-zinc-500" : "text-zinc-300"}`} title={s.label}>
        {s.label}
        {s.parcial && <span className="ml-1 text-[10px] text-amber-400/70">en curso</span>}
      </div>
      <div className="relative h-6 flex-1 overflow-hidden rounded bg-white/[0.03]">
        <div
          className={`h-full rounded ${s.parcial ? "bg-zinc-500/40" : "brand-gradient"}`}
          style={{ width: `${w}%`, minWidth: s.canceladas > 0 ? "2px" : "0" }}
        />
        <div className="absolute inset-y-0 left-2 flex items-center gap-2 text-[11px] font-semibold text-white">
          <span className="tabular-nums">{fmtInt(s.canceladas)}</span>
          <span className="font-normal text-white/70">de {fmtInt(s.totalOrdenes)}</span>
        </div>
      </div>
      <div className="w-14 shrink-0 text-right tabular-nums text-zinc-400">{pct(s.tasa)}</div>
    </button>
  );
}

function Detalle({
  periodo,
  items,
  loading,
  error,
  onClose,
}: {
  periodo: CancelPeriodo;
  items: DetalleItem[] | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
}) {
  return (
    <div className="card p-3 sm:p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-white">
          Detalle · {periodo.label}
          <span className="ml-2 text-xs font-normal text-zinc-400">{fmtInt(periodo.canceladas)} canceladas</span>
        </h3>
        <div className="flex items-center gap-2">
          {periodo.canceladas > 0 && (
            <a
              href={`/api/reportes/cancelaciones/detalle?desde=${periodo.desde}&hasta=${periodo.hasta}&format=xlsx`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-semibold text-zinc-200 transition hover:bg-white/10"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5"><path d="M12 3v12m0 0 4-4m-4 4-4-4M4 21h16" /></svg>
              Excel
            </a>
          )}
          <button onClick={onClose} className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-white/5 hover:text-white" aria-label="Cerrar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="h-4 w-4"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="py-8 text-center text-sm text-zinc-400">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="mx-auto mb-2 h-5 w-5 animate-spin text-zinc-500"><path d="M21 12a9 9 0 1 1-2.64-6.36" strokeLinecap="round" /></svg>
          Cargando detalle…
        </div>
      ) : error ? (
        <div className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</div>
      ) : !items || items.length === 0 ? (
        <div className="py-6 text-center text-sm text-zinc-500">Sin cancelaciones en este período.</div>
      ) : (
        <>
          {/* Lista (celular) */}
          <div className="space-y-2 lg:hidden">
            {items.map((it) => (
              <div key={it.id} className="rounded-lg border border-white/5 bg-white/[0.02] p-2.5">
                <div className="flex gap-2.5">
                  {it.thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={it.thumb} alt="" className="h-12 w-12 shrink-0 rounded object-cover" />
                  ) : (
                    <div className="h-12 w-12 shrink-0 rounded bg-white/5" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="line-clamp-2 text-xs font-medium text-zinc-100">{it.titulo ?? "—"}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-zinc-500">
                      <span className="font-mono">{it.sku ?? "—"}</span>
                      <span>· {it.fecha}</span>
                      <span>· {it.cantidad}u · {fmtMonto(it.monto)}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${motivoTone[it.motivo]}`}>{it.motivoLabel}</span>
                      {it.envio && <span className="text-[10px] text-zinc-500">envío: {it.envio}</span>}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Tabla (desktop) */}
          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full border-collapse text-sm">
              <thead className="border-b border-white/10 text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-2 py-2 text-left font-semibold">Fecha</th>
                  <th className="px-2 py-2 text-left font-semibold">Producto</th>
                  <th className="px-2 py-2 text-right font-semibold">Cant.</th>
                  <th className="px-2 py-2 text-right font-semibold">Monto</th>
                  <th className="px-2 py-2 text-left font-semibold">Comprador</th>
                  <th className="px-2 py-2 text-left font-semibold">Motivo</th>
                  <th className="px-2 py-2 text-left font-semibold">Envío</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {items.map((it) => (
                  <tr key={it.id} className="transition hover:bg-white/[0.03]">
                    <td className="whitespace-nowrap px-2 py-2 text-zinc-400">{it.fecha}</td>
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-2">
                        {it.thumb ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={it.thumb} alt="" className="h-8 w-8 shrink-0 rounded object-cover" />
                        ) : (
                          <div className="h-8 w-8 shrink-0 rounded bg-white/5" />
                        )}
                        <div className="min-w-0">
                          <div className="max-w-[320px] truncate text-zinc-200" title={it.titulo ?? ""}>{it.titulo ?? "—"}</div>
                          <div className="font-mono text-[11px] text-zinc-500">{it.sku ?? "—"}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-zinc-300">{it.cantidad}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-zinc-300">{fmtMonto(it.monto)}</td>
                    <td className="max-w-[140px] truncate px-2 py-2 text-zinc-400" title={it.comprador ?? ""}>{it.comprador ?? "—"}</td>
                    <td className="px-2 py-2">
                      <span className={`whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-semibold ${motivoTone[it.motivo]}`}>{it.motivoLabel}</span>
                    </td>
                    <td className="px-2 py-2 text-zinc-400">{it.envio ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {items.length >= 1000 && <p className="mt-2 text-[11px] text-amber-400/70">Mostrando las primeras 1000 cancelaciones del período.</p>}
        </>
      )}
    </div>
  );
}
