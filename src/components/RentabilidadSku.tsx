"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fmtInt, fmtPeso } from "@/lib/format";

type Row = {
  sku: string;
  titulo: string | null;
  categoria: string | null;
  unidades: number;
  ingreso: number;
  costoUnitario: number | null;
  costo: number | null;
  comision: number;
  margen: number | null;
  pct: number | null;
  stock: number | null;
  porCanal: { ml: number; mayorista: number; otros: number; local: number };
};

type Muerto = {
  sku: string;
  titulo: string | null;
  categoria: string | null;
  stock: number;
  costoUnitario: number | null;
  inmovilizado: number | null;
};

type ApiResp = {
  desde: string;
  hasta: string;
  rows: Row[];
  stockMuerto: Muerto[];
  truncated: boolean;
  syncedAt: string;
};

type Orden = "margen" | "pct" | "unidades" | "ingreso";
const ORDENES: { key: Orden; label: string }[] = [
  { key: "margen", label: "Margen $" },
  { key: "pct", label: "Margen %" },
  { key: "unidades", label: "Unidades" },
  { key: "ingreso", label: "Facturación" },
];

const PAGINA = 50;

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

export default function RentabilidadSku() {
  const [desde, setDesde] = useState(firstOfMonthStr);
  const [hasta, setHasta] = useState(todayStr);
  const [data, setData] = useState<ApiResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [orden, setOrden] = useState<Orden>("margen");
  const [asc, setAsc] = useState(false);
  const [q, setQ] = useState("");
  const [soloConCosto, setSoloConCosto] = useState(true);
  const [limite, setLimite] = useState(PAGINA);
  const [verMuerto, setVerMuerto] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/rentabilidad?desde=${desde}&hasta=${hasta}`, {
        cache: "no-store",
        signal: AbortSignal.timeout(120000),
      });
      const text = await res.text();
      let json: unknown = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        /* respuesta no-JSON */
      }
      if (!res.ok) {
        throw new Error((json as { error?: string } | null)?.error || `Error ${res.status}`);
      }
      setData(json as ApiResp);
      setLimite(PAGINA);
    } catch (e) {
      const err = e as Error;
      let msg = err.message;
      if (err.name === "TimeoutError" || err.name === "AbortError") {
        msg = "La consulta tardó demasiado (timeout). Probá un rango de fechas más chico.";
      } else if (/failed to fetch|load failed|networkerror/i.test(msg)) {
        msg = "No se pudo conectar con el servidor.";
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

  const filtradas = useMemo(() => {
    if (!data) return [];
    const term = q.trim().toLowerCase();
    let rows = data.rows;
    if (soloConCosto) rows = rows.filter((r) => r.margen != null);
    if (term) {
      rows = rows.filter(
        (r) =>
          r.sku.toLowerCase().includes(term) ||
          (r.titulo ?? "").toLowerCase().includes(term) ||
          (r.categoria ?? "").toLowerCase().includes(term),
      );
    }
    const val = (r: Row): number => {
      if (orden === "margen") return r.margen ?? -Infinity;
      if (orden === "pct") return r.pct ?? -Infinity;
      if (orden === "unidades") return r.unidades;
      return r.ingreso;
    };
    return [...rows].sort((a, b) => (asc ? val(a) - val(b) : val(b) - val(a)));
  }, [data, q, soloConCosto, orden, asc]);

  // Totales sobre lo que sí tiene costo cargado (lo demás no es comparable).
  const tot = useMemo(() => {
    const rows = data?.rows ?? [];
    const conCosto = rows.filter((r) => r.margen != null);
    const ingreso = rows.reduce((s, r) => s + r.ingreso, 0);
    const ingresoCC = conCosto.reduce((s, r) => s + r.ingreso, 0);
    const costo = conCosto.reduce((s, r) => s + (r.costo ?? 0), 0);
    const comision = conCosto.reduce((s, r) => s + r.comision, 0);
    const margen = conCosto.reduce((s, r) => s + (r.margen ?? 0), 0);
    const inmovilizado = (data?.stockMuerto ?? []).reduce(
      (s, m) => s + (m.inmovilizado ?? 0),
      0,
    );
    return {
      skus: rows.length,
      conCosto: conCosto.length,
      ingreso,
      ingresoCC,
      costo,
      comision,
      margen,
      pct: ingresoCC ? margen / ingresoCC : 0,
      cobertura: ingreso ? ingresoCC / ingreso : 0,
      inmovilizado,
      muertos: data?.stockMuerto.length ?? 0,
    };
  }, [data]);

  // Los que más facturan pero peor margen dejan: ahí está la plata que se escapa.
  const focos = useMemo(() => {
    const rows = (data?.rows ?? []).filter((r) => r.margen != null && r.ingreso > 0);
    if (rows.length === 0) return [];
    const corte = [...rows].sort((a, b) => b.ingreso - a.ingreso).slice(
      0,
      Math.max(10, Math.ceil(rows.length * 0.2)),
    );
    return corte.filter((r) => (r.pct ?? 0) < 0.15).sort((a, b) => (a.pct ?? 0) - (b.pct ?? 0)).slice(0, 6);
  }, [data]);

  function setMes() {
    setDesde(firstOfMonthStr());
    setHasta(todayStr());
  }
  function set90() {
    const d = new Date();
    const off = d.getTimezoneOffset();
    const ini = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 89);
    setDesde(new Date(ini.getTime() - off * 60000).toISOString().slice(0, 10));
    setHasta(todayStr());
  }

  function toggleOrden(o: Orden) {
    if (o === orden) setAsc((v) => !v);
    else {
      setOrden(o);
      setAsc(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
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
          <button onClick={setMes} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm font-semibold text-zinc-200 transition hover:bg-white/10">Mes</button>
          <button onClick={set90} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm font-semibold text-zinc-200 transition hover:bg-white/10">90 días</button>
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          className="brand-gradient brand-glow rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
        >
          {loading ? "Cargando…" : "Actualizar"}
        </button>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar SKU, producto o categoría…"
            className="field !w-56 !py-2 text-sm"
          />
          <label className="flex items-center gap-1.5 text-sm text-zinc-400">
            <input
              type="checkbox"
              checked={soloConCosto}
              onChange={(e) => setSoloConCosto(e.target.checked)}
              className="h-4 w-4 accent-teal-500"
            />
            Solo con costo
          </label>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/25 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-300">
          {error}
        </div>
      )}
      {data?.truncated && (
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-3.5 py-2.5 text-sm text-amber-300">
          Se alcanzó el límite de filas. Achicá el rango de fechas para ver todo.
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Facturación" value={fmtPeso(tot.ingreso)} big />
        <Kpi label="Costo mercadería" value={fmtPeso(tot.costo)} tone="red" />
        <Kpi
          label={`Margen (${(tot.pct * 100).toFixed(1)}%)`}
          value={fmtPeso(tot.margen)}
          tone={tot.margen < 0 ? "red" : "green"}
          big
        />
        <Kpi
          label={`SKUs con costo`}
          value={`${fmtInt(tot.conCosto)} / ${fmtInt(tot.skus)}`}
          hint={`${(tot.cobertura * 100).toFixed(0)}% de la facturación`}
        />
      </div>

      {/* Productos que facturan mucho y dejan poco */}
      {focos.length > 0 && (
        <div className="card border border-amber-500/25 p-4">
          <p className="mb-2 flex items-center gap-2 text-sm font-bold text-amber-300">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
            </svg>
            Venden mucho y dejan poco
          </p>
          <p className="mb-3 text-xs text-zinc-500">
            Están entre los que más facturan, pero con margen por debajo del 15%. Revisá
            precio o costo.
          </p>
          <div className="space-y-1.5">
            {focos.map((r) => (
              <div key={r.sku} className="flex items-center gap-3 text-sm">
                <span className="w-24 shrink-0 truncate font-mono text-xs text-zinc-400">{r.sku}</span>
                <span className="min-w-0 flex-1 truncate text-zinc-300">{r.titulo ?? "—"}</span>
                <span className="shrink-0 tabular-nums text-zinc-400">{fmtPeso(r.ingreso)}</span>
                <span
                  className={`w-16 shrink-0 rounded-md px-1.5 py-0.5 text-right text-xs font-bold tabular-nums ${
                    (r.pct ?? 0) < 0 ? "bg-red-500/15 text-red-300" : "bg-amber-500/15 text-amber-300"
                  }`}
                >
                  {((r.pct ?? 0) * 100).toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabla por SKU */}
      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-4 py-3">
          <h3 className="text-sm font-bold text-white">Rentabilidad por producto</h3>
          <span className="text-xs text-zinc-500">{fmtInt(filtradas.length)} SKUs</span>
          <div className="ml-auto flex flex-wrap gap-1">
            {ORDENES.map((o) => (
              <button
                key={o.key}
                onClick={() => toggleOrden(o.key)}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                  orden === o.key
                    ? "bg-teal-500/20 text-teal-200"
                    : "text-zinc-400 hover:bg-white/5 hover:text-white"
                }`}
              >
                {o.label}
                {orden === o.key && (asc ? " ↑" : " ↓")}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-white/[0.03] text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-3 py-2 font-semibold">SKU</th>
                <th className="px-3 py-2 font-semibold">Producto</th>
                <th className="px-3 py-2 text-right font-semibold">Unid.</th>
                <th className="px-3 py-2 text-right font-semibold">Facturado</th>
                <th className="px-3 py-2 text-right font-semibold">Costo</th>
                <th className="px-3 py-2 text-right font-semibold">Comisión</th>
                <th className="px-3 py-2 text-right font-semibold">Margen</th>
                <th className="px-3 py-2 text-right font-semibold">%</th>
                <th className="px-3 py-2 text-right font-semibold">Stock</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filtradas.slice(0, limite).map((r) => (
                <tr key={r.sku} className="transition hover:bg-white/[0.03]">
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-zinc-400">{r.sku}</td>
                  <td className="max-w-xs truncate px-3 py-2 text-zinc-200" title={r.titulo ?? ""}>
                    {r.titulo ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-zinc-300">{fmtInt(r.unidades)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-zinc-200">{fmtPeso(r.ingreso)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-zinc-400">
                    {r.costo != null ? fmtPeso(r.costo) : <span className="text-zinc-600">sin costo</span>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-zinc-500">
                    {r.comision ? fmtPeso(r.comision) : "—"}
                  </td>
                  <td
                    className={`px-3 py-2 text-right font-semibold tabular-nums ${
                      r.margen == null ? "text-zinc-600" : r.margen < 0 ? "text-red-400" : "text-emerald-400"
                    }`}
                  >
                    {r.margen != null ? fmtPeso(r.margen) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {r.pct != null ? (
                      <span
                        className={`rounded-md px-1.5 py-0.5 text-xs font-bold ${
                          r.pct < 0
                            ? "bg-red-500/15 text-red-300"
                            : r.pct < 0.15
                              ? "bg-amber-500/15 text-amber-300"
                              : "bg-emerald-500/15 text-emerald-300"
                        }`}
                      >
                        {(r.pct * 100).toFixed(1)}%
                      </span>
                    ) : (
                      <span className="text-zinc-600">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-zinc-400">
                    {r.stock != null ? fmtInt(r.stock) : "—"}
                  </td>
                </tr>
              ))}
              {filtradas.length === 0 && !loading && (
                <tr>
                  <td colSpan={9} className="px-3 py-10 text-center text-sm text-zinc-500">
                    Sin ventas en este rango.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {filtradas.length > limite && (
          <div className="border-t border-white/10 p-3 text-center">
            <button
              onClick={() => setLimite((l) => l + PAGINA)}
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:bg-white/10"
            >
              Ver {Math.min(PAGINA, filtradas.length - limite)} más
            </button>
          </div>
        )}
      </div>

      {/* Stock muerto */}
      {tot.muertos > 0 && (
        <div className="card overflow-hidden">
          <button
            onClick={() => setVerMuerto((v) => !v)}
            className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-white/[0.03]"
          >
            <div>
              <h3 className="text-sm font-bold text-white">Stock sin movimiento</h3>
              <p className="text-xs text-zinc-500">
                {fmtInt(tot.muertos)} SKUs con stock y cero ventas en el rango ·{" "}
                <span className="font-semibold text-amber-300">{fmtPeso(tot.inmovilizado)}</span>{" "}
                inmovilizados
              </p>
            </div>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`ml-auto h-4 w-4 text-zinc-500 transition-transform ${verMuerto ? "rotate-90" : ""}`}
            >
              <path d="m9 18 6-6-6-6" />
            </svg>
          </button>

          {verMuerto && (
            <div className="overflow-x-auto border-t border-white/10">
              <table className="w-full text-left text-sm">
                <thead className="bg-white/[0.03] text-xs uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="px-3 py-2 font-semibold">SKU</th>
                    <th className="px-3 py-2 font-semibold">Producto</th>
                    <th className="px-3 py-2 text-right font-semibold">Stock</th>
                    <th className="px-3 py-2 text-right font-semibold">Inmovilizado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {(data?.stockMuerto ?? []).slice(0, 100).map((m) => (
                    <tr key={m.sku} className="transition hover:bg-white/[0.03]">
                      <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-zinc-400">{m.sku}</td>
                      <td className="max-w-xs truncate px-3 py-2 text-zinc-200" title={m.titulo ?? ""}>
                        {m.titulo ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-zinc-300">{fmtInt(m.stock)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-amber-300">
                        {m.inmovilizado != null ? fmtPeso(m.inmovilizado) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Nota metodológica */}
      <div className="card p-4 text-xs leading-relaxed text-zinc-500">
        <p className="mb-1 font-semibold text-zinc-400">Cómo se calcula</p>
        <ul className="list-inside list-disc space-y-1">
          <li>
            <b className="text-zinc-400">Facturación</b>: importe de cada línea con IVA. En Odoo
            se toma el subtotal neto y se le aplica la relación de impuestos real de esa orden;
            en ML el precio ya es final.
          </li>
          <li>
            <b className="text-zinc-400">Costo</b>: override local &gt; override de la API &gt;
            costo de Odoo × 1,22. Los SKUs sin costo quedan fuera del margen (se ven con «sin costo»).
          </li>
          <li>
            <b className="text-zinc-400">Comisión</b>: fee real de ML prorrateado entre los ítems
            de cada orden según cuánto aporta cada uno.
          </li>
          <li>
            <b className="text-zinc-400">No incluye</b>: publicidad, envíos ni comisión de tarjeta
            del local — esos son costos por canal, no por producto. Para verlos, andá a Resumen.
          </li>
          <li>
            Se excluyen las órdenes canceladas de ML y las Sale Orders de «Mateo Alpuy» (espejo
            de ML) para no duplicar.
          </li>
        </ul>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  tone,
  big,
  hint,
}: {
  label: string;
  value: string;
  tone?: "red" | "green";
  big?: boolean;
  hint?: string;
}) {
  const color = tone === "red" ? "text-red-400" : tone === "green" ? "text-emerald-400" : "text-white";
  return (
    <div className="card p-4">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className={`${big ? "text-2xl" : "text-lg"} font-bold tabular-nums ${color}`}>{value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-zinc-600">{hint}</div>}
    </div>
  );
}
