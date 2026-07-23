"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fmtPeso, fmtPesoSigned } from "@/lib/format";

type Channel = {
  ordenes: number;
  facturado: number;
  ordenesConCosto: number;
  ventaConCosto: number;
  costo: number;
  comision: number;
  envio: number;
  truncated: boolean;
};
type ApiResp = {
  desde: string;
  hasta: string;
  channels: { ml: Channel; mayorista: Channel; otros: Channel; local: Channel };
  syncedAt: string;
};

type Key = "ml" | "mayorista" | "otros" | "local";
const ORDER: Key[] = ["ml", "mayorista", "otros", "local"];
const META: Record<Key, { label: string; bar: string; text: string; ring: string }> = {
  ml: { label: "MercadoLibre", bar: "bg-sky-400", text: "text-sky-300", ring: "border-sky-500/25" },
  mayorista: { label: "Mayorista", bar: "bg-emerald-400", text: "text-emerald-300", ring: "border-emerald-500/25" },
  otros: { label: "Otros canales", bar: "bg-violet-400", text: "text-violet-300", ring: "border-violet-500/25" },
  local: { label: "Local (tienda)", bar: "bg-amber-400", text: "text-amber-300", ring: "border-amber-500/25" },
};

function todayStr(): string {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}
function firstOfMonthStr(): string {
  const d = new Date();
  const off = d.getTimezoneOffset();
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  return new Date(first.getTime() - off * 60000).toISOString().slice(0, 10);
}

export default function ResumenVentas() {
  const [desde, setDesde] = useState(firstOfMonthStr);
  const [hasta, setHasta] = useState(todayStr);
  const [data, setData] = useState<ApiResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Porcentajes configurables.
  const [publiPct, setPubliPct] = useState(5); // publicidad ML (sobre venta)
  const [comLocalPct, setComLocalPct] = useState(3); // comisión tarjeta Local (sobre venta)

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/resumen?desde=${desde}&hasta=${hasta}`, {
        cache: "no-store",
        signal: AbortSignal.timeout(60000),
      });
      const text = await res.text();
      let json: unknown = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        /* respuesta no-JSON */
      }
      if (!res.ok) {
        const msg = (json as { error?: string } | null)?.error || `Error ${res.status}`;
        throw new Error(msg);
      }
      setData(json as ApiResp);
    } catch (e) {
      const err = e as Error;
      let msg = err.message;
      if (err.name === "TimeoutError" || err.name === "AbortError") {
        msg = "La consulta tardó demasiado (timeout). Probá un rango de fechas más chico.";
      } else if (/failed to fetch|load failed|networkerror/i.test(msg)) {
        msg = "No se pudo conectar con el servidor. Verificá que la app esté corriendo y refrescá.";
      }
      setError(msg);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [desde, hasta]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Métricas derivadas por canal (con los % configurables aplicados).
  const rows = useMemo(() => {
    if (!data) return [];
    return ORDER.map((k) => {
      const c = data.channels[k];
      const publi = k === "ml" ? (c.ventaConCosto * publiPct) / 100 : 0;
      const comisionTarjeta = k === "local" ? (c.ventaConCosto * comLocalPct) / 100 : 0;
      const comisionTotal = c.comision + comisionTarjeta; // ML: fee real · Local: tarjeta estimada
      const margen = c.ventaConCosto - c.costo - comisionTotal + c.envio - publi;
      const pct = c.ventaConCosto ? margen / c.ventaConCosto : 0;
      const cobertura = c.facturado ? c.ventaConCosto / c.facturado : 0;
      return { key: k, ...c, publi, comisionTarjeta, comisionTotal, margen, pct, cobertura };
    });
  }, [data, publiPct, comLocalPct]);

  const tot = useMemo(() => {
    const facturado = rows.reduce((s, r) => s + r.facturado, 0);
    const ventaCC = rows.reduce((s, r) => s + r.ventaConCosto, 0);
    const costo = rows.reduce((s, r) => s + r.costo, 0);
    const comision = rows.reduce((s, r) => s + r.comisionTotal, 0);
    const envio = rows.reduce((s, r) => s + r.envio, 0);
    const publi = rows.reduce((s, r) => s + r.publi, 0);
    const margen = rows.reduce((s, r) => s + r.margen, 0);
    const pct = ventaCC ? margen / ventaCC : 0;
    return { facturado, ventaCC, costo, comision, envio, publi, margen, pct };
  }, [rows]);

  const maxFacturado = Math.max(1, ...rows.map((r) => r.facturado));
  const anyTrunc = rows.some((r) => r.truncated);

  function setHoy() {
    const t = todayStr();
    setDesde(t);
    setHasta(t);
  }
  function setMes() {
    setDesde(firstOfMonthStr());
    setHasta(todayStr());
  }

  return (
    <div className="space-y-4">
      {/* ---------- Toolbar ---------- */}
      <div className="card flex flex-wrap items-end gap-3 p-4">
        <div>
          <label className="mb-1 block text-[11px] font-medium text-zinc-500">Desde</label>
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="field" />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-medium text-zinc-500">Hasta</label>
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="field" />
        </div>
        <div className="flex gap-1">
          <button onClick={setHoy} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm font-semibold text-zinc-200 transition hover:bg-white/10">Hoy</button>
          <button onClick={setMes} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm font-semibold text-zinc-200 transition hover:bg-white/10">Mes</button>
        </div>
        <button onClick={fetchData} disabled={loading} className="brand-gradient brand-glow rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60">
          {loading ? "Cargando…" : "Actualizar"}
        </button>
        <button onClick={fetchData} disabled={loading} className="rounded-xl border border-white/10 bg-white/5 p-2.5 text-zinc-200 transition hover:bg-white/10" aria-label="Refrescar" title="Refrescar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className={`h-5 w-5 ${loading ? "animate-spin" : ""}`}>
            <path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <div className="flex flex-wrap items-center gap-4 text-sm">
          <label className="flex items-center gap-1.5 text-zinc-400" title="Publicidad de MercadoLibre (% sobre la venta)">
            Publi ML %
            <input type="number" min={0} step={0.5} value={publiPct}
              onChange={(e) => setPubliPct(Number(e.target.value) || 0)}
              className="field !w-16 !py-1.5 text-center" />
          </label>
          <label className="flex items-center gap-1.5 text-zinc-400" title="Comisión de tarjeta del Local (% promedio sobre la venta)">
            Comisión Local %
            <input type="number" min={0} step={0.1} value={comLocalPct}
              onChange={(e) => setComLocalPct(Number(e.target.value) || 0)}
              className="field !w-16 !py-1.5 text-center" />
          </label>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/25 bg-red-500/10 px-2.5 py-2.5 text-sm text-red-300">
          {error}
        </div>
      )}
      {anyTrunc && (
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-2.5 py-2.5 text-sm text-amber-300">
          Se alcanzó el límite de filas en algún canal. Achicá el rango de fechas para ver todo.
        </div>
      )}

      {/* ---------- KPIs globales ---------- */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Facturación total" value={fmtPeso(tot.facturado)} big />
        <Kpi label="Costo mercadería" value={fmtPeso(tot.costo)} />
        <Kpi label="Comisiones + publi" value={fmtPeso(tot.comision + tot.publi)} tone="red" />
        <Kpi label={`Margen (${(tot.pct * 100).toFixed(0)}%)`} value={fmtPeso(tot.margen)} tone={tot.margen < 0 ? "red" : "green"} big />
      </div>

      {/* ---------- Comparación de facturación por canal ---------- */}
      <div className="card p-4">
        <div className="mb-3 text-xs uppercase tracking-wide text-zinc-500">Facturación por canal</div>
        <div className="space-y-3">
          {rows.map((r) => {
            const share = tot.facturado ? r.facturado / tot.facturado : 0;
            return (
              <div key={r.key} className="flex items-center gap-3">
                <div className="w-28 shrink-0 text-sm font-medium text-zinc-300">{META[r.key].label}</div>
                <div className="h-6 flex-1 overflow-hidden rounded-lg bg-white/5">
                  <div
                    className={`h-full ${META[r.key].bar} transition-all`}
                    style={{ width: `${(r.facturado / maxFacturado) * 100}%` }}
                  />
                </div>
                <div className="w-28 shrink-0 text-right tabular-nums text-sm font-semibold text-zinc-100">{fmtPeso(r.facturado)}</div>
                <div className="w-12 shrink-0 text-right tabular-nums text-xs text-zinc-500">{(share * 100).toFixed(0)}%</div>
              </div>
            );
          })}
          {rows.length === 0 && !loading && (
            <div className="py-8 text-center text-sm text-zinc-500">Sin datos en este rango.</div>
          )}
        </div>
      </div>

      {/* ---------- Detalle por canal ---------- */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {rows.map((r) => (
          <div key={r.key} className={`card border ${META[r.key].ring} p-4`}>
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${META[r.key].bar}`} />
                <h3 className="text-base font-bold text-white">{META[r.key].label}</h3>
              </div>
              <span className="text-xs text-zinc-500">{r.ordenes} órd.</span>
            </div>

            <div className="mb-3">
              <div className="text-xs text-zinc-500">Facturado</div>
              <div className="text-2xl font-bold tabular-nums text-white">{fmtPeso(r.facturado)}</div>
            </div>

            <dl className="space-y-1.5 text-sm">
              <Line label="Costo mercadería" value={"-" + fmtPeso(r.costo)} tone="red" />
              {r.key === "ml" && (
                <>
                  <Line label="Comisión ML" value={r.comision ? "-" + fmtPeso(r.comision) : "$0"} tone="red" />
                  <Line label="Envío neto" value={fmtPesoSigned(r.envio)} tone={r.envio < 0 ? "red" : "green"} />
                  <Line label={`Publicidad (${publiPct}%)`} value={r.publi ? "-" + fmtPeso(r.publi) : "$0"} tone="red" />
                </>
              )}
              {r.key === "local" && (
                <Line label={`Comisión tarjeta (${comLocalPct}%)`} value={r.comisionTarjeta ? "-" + fmtPeso(r.comisionTarjeta) : "$0"} tone="red" />
              )}
              {(r.key === "mayorista" || r.key === "otros") && <Line label="Comisión" value="sin comisión" tone="muted" />}
            </dl>

            <div className="mt-3 border-t border-white/10 pt-3">
              <div className="flex items-end justify-between">
                <div>
                  <div className="text-xs text-zinc-500">Margen</div>
                  <div className={`text-xl font-bold tabular-nums ${r.margen < 0 ? "text-red-400" : "text-emerald-400"}`}>{fmtPeso(r.margen)}</div>
                </div>
                <div className={`rounded-lg px-2 py-1 text-sm font-bold tabular-nums ${r.pct < 0 ? "bg-red-500/15 text-red-300" : "bg-emerald-500/15 text-emerald-300"}`}>
                  {(r.pct * 100).toFixed(1)}%
                </div>
              </div>
              <div className="mt-2 text-[11px] text-zinc-500">
                Rentabilidad sobre {fmtPeso(r.ventaConCosto)} con costo ({(r.cobertura * 100).toFixed(0)}% del facturado).
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ---------- Nota metodológica ---------- */}
      <div className="card p-4 text-xs leading-relaxed text-zinc-500">
        <p className="mb-1 font-semibold text-zinc-400">Cómo se calcula</p>
        <ul className="list-inside list-disc space-y-1">
          <li><b className="text-zinc-400">Facturación</b>: total con IVA de cada canal. La rentabilidad se calcula sobre las órdenes cuyos productos tienen costo cargado (el % de cobertura se indica en cada canal).</li>
          <li><b className="text-zinc-400">MercadoLibre</b>: comisión y envío reales de ML; publicidad estimada ({publiPct}% de la venta, configurable).</li>
          <li><b className="text-zinc-400">Mayorista</b>: ventas de Odoo de Gustavo Bauza, Omar Iglesias y Rodrigo Ruiz. Sin comisión (venta − costo).</li>
          <li><b className="text-zinc-400">Otros canales</b>: resto de las ventas de Odoo por fuera de ML, Mayorista y Local (WhatsApp, atención al cliente, etc.). Sin comisión. Se excluye «Mateo Alpuy» (ML) para no duplicar.</li>
          <li><b className="text-zinc-400">Local</b>: punto de venta (POS). La API no guarda el medio de pago, así que la comisión de tarjeta es un promedio configurable ({comLocalPct}%). Débito 1,8% · crédito 1 cuota 2,5% · crédito en cuotas 5%.</li>
        </ul>
      </div>
    </div>
  );
}

// ---------- Subcomponentes ----------
function Kpi({ label, value, tone, big }: { label: string; value: string; tone?: "red" | "green"; big?: boolean }) {
  const color = tone === "red" ? "text-red-400" : tone === "green" ? "text-emerald-400" : "text-white";
  return (
    <div className="card p-4">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className={`${big ? "text-2xl" : "text-lg"} font-bold tabular-nums ${color}`}>{value}</div>
    </div>
  );
}

function Line({ label, value, tone }: { label: string; value: string; tone?: "red" | "green" | "muted" }) {
  const color =
    tone === "red" ? "text-red-400" : tone === "green" ? "text-emerald-400" : tone === "muted" ? "text-zinc-500" : "text-zinc-200";
  return (
    <div className="flex items-center justify-between">
      <dt className="text-zinc-400">{label}</dt>
      <dd className={`tabular-nums ${color}`}>{value}</dd>
    </div>
  );
}
