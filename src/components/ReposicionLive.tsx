"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fmtInt } from "@/lib/format";

type ApiRow = {
  sku: string;
  titulo: string | null;
  categoria: string | null;
  vendidas: number;
  stock: number | null;
  enCamino: number;
  costoOrigen: number | null;
};
type ApiResp = { desde: string; hasta: string; rows: ApiRow[]; count: number; syncedAt: string };

type SortKey = "sku" | "titulo" | "vendidas" | "promMes" | "stock" | "enCamino" | "sugerida" | "valor";

function todayStr(): string {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}
function monthsAgoStr(n: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}
function fmtUsd(n: number | null): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return "US$ " + n.toLocaleString("es-UY", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
function fmtDec(n: number, dec = 1): string {
  return n.toLocaleString("es-UY", { minimumFractionDigits: 0, maximumFractionDigits: dec });
}

export default function ReposicionLive() {
  const [desde, setDesde] = useState(() => monthsAgoStr(3));
  const [hasta, setHasta] = useState(todayStr);
  const [data, setData] = useState<ApiResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Parámetros de la sugerencia (editables, recalculan en vivo).
  const [meses, setMeses] = useState(4); // meses de cobertura a comprar
  const [descontarCamino, setDescontarCamino] = useState(false);

  // Filtros de tabla.
  const [q, setQ] = useState("");
  const [soloReponer, setSoloReponer] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("sugerida");
  const [asc, setAsc] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/reposicion?desde=${desde}&hasta=${hasta}`, {
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
        msg = "La consulta tardó demasiado (timeout). Probá un rango más chico.";
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

  // Cantidad de meses del período (para el promedio mensual).
  const mesesPeriodo = useMemo(() => {
    const d1 = new Date(desde).getTime();
    const d2 = new Date(hasta).getTime();
    if (Number.isNaN(d1) || Number.isNaN(d2) || d2 <= d1) return 1;
    return Math.max(1, (d2 - d1) / (1000 * 60 * 60 * 24 * 30.44));
  }, [desde, hasta]);

  // Cálculo de la sugerencia por fila.
  const rows = useMemo(() => {
    const src = data?.rows ?? [];
    return src.map((r) => {
      const promMes = r.vendidas / mesesPeriodo;
      const objetivo = promMes * meses;
      // Stock negativo (desajustes de Odoo) se toma como 0 para no inflar la sugerencia.
      const stockPos = Math.max(0, r.stock ?? 0);
      const descuento = stockPos + (descontarCamino ? r.enCamino : 0);
      const sugerida = Math.max(0, Math.round(objetivo - descuento));
      const valor = r.costoOrigen != null ? sugerida * r.costoOrigen : null;
      return { ...r, promMes, sugerida, valor };
    });
  }, [data, mesesPeriodo, meses, descontarCamino]);

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    let arr = rows;
    if (ql) {
      arr = arr.filter(
        (r) => r.sku.toLowerCase().includes(ql) || (r.titulo ?? "").toLowerCase().includes(ql),
      );
    }
    if (soloReponer) arr = arr.filter((r) => r.sugerida > 0);
    const sorted = [...arr].sort((a, b) => {
      const va = a[sortKey];
      const vb = b[sortKey];
      if (va === null && vb === null) return 0;
      if (va === null) return 1;
      if (vb === null) return -1;
      if (typeof va === "number" && typeof vb === "number") return va - vb;
      return String(va).localeCompare(String(vb), "es", { numeric: true });
    });
    if (!asc) sorted.reverse();
    return sorted;
  }, [rows, q, soloReponer, sortKey, asc]);

  const totals = useMemo(() => {
    let unidades = 0;
    let valor = 0;
    let conCosto = 0;
    let skus = 0;
    for (const r of filtered) {
      if (r.sugerida <= 0) continue;
      skus += 1;
      unidades += r.sugerida;
      if (r.valor != null) {
        valor += r.valor;
        conCosto += 1;
      }
    }
    return { unidades, valor, conCosto, skus };
  }, [filtered]);

  function toggleSort(k: SortKey) {
    if (sortKey === k) setAsc(!asc);
    else {
      setSortKey(k);
      setAsc(k === "sku" || k === "titulo");
    }
  }

  function exportCsv() {
    const head = ["Codigo", "Titulo", "Vendidas", "Prom/mes", "Stock", "EnCamino", "Sugerida", "CostoOrigenUSD", "ValorUSD"];
    const lines = filtered.map((r) =>
      [
        r.sku,
        `"${(r.titulo ?? "").replace(/"/g, '""')}"`,
        r.vendidas,
        r.promMes.toFixed(1),
        r.stock ?? "",
        r.enCamino,
        r.sugerida,
        r.costoOrigen ?? "",
        r.valor != null ? Math.round(r.valor) : "",
      ].join(","),
    );
    const csv = [head.join(","), ...lines].join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reposicion_${desde}_${hasta}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function setUlt(nMeses: number) {
    setDesde(monthsAgoStr(nMeses));
    setHasta(todayStr());
  }

  const arrow = (k: SortKey) => (sortKey === k ? (asc ? " ▲" : " ▼") : "");

  return (
    <div className="space-y-4">
      {/* ---------- Toolbar: período + parámetros ---------- */}
      <div className="card flex flex-wrap items-end gap-3 p-4">
        <div>
          <label className="mb-1 block text-[11px] font-medium text-zinc-500">Ventas desde</label>
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="field" />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-medium text-zinc-500">Hasta</label>
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="field" />
        </div>
        <div className="flex gap-1">
          <button onClick={() => setUlt(3)} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm font-semibold text-zinc-200 transition hover:bg-white/10">3m</button>
          <button onClick={() => setUlt(6)} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm font-semibold text-zinc-200 transition hover:bg-white/10">6m</button>
          <button onClick={() => setUlt(12)} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm font-semibold text-zinc-200 transition hover:bg-white/10">12m</button>
        </div>
        <button onClick={fetchData} disabled={loading} className="brand-gradient brand-glow rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60">
          {loading ? "Cargando…" : "Actualizar"}
        </button>

        <div className="ml-auto flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-1.5 text-sm text-zinc-400" title="Meses de venta que querés tener en stock">
            Meses a cubrir
            <input type="number" min={0} step={0.5} value={meses}
              onChange={(e) => setMeses(Math.max(0, Number(e.target.value) || 0))}
              className="field !w-16 !py-1.5 text-center" />
          </label>
          <button
            onClick={() => setDescontarCamino((v) => !v)}
            title="Restar de la sugerencia lo que ya viene en contenedores (puede no estar actualizado)"
            className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
              descontarCamino
                ? "border-teal-400/40 bg-teal-500/15 text-teal-200"
                : "border-white/10 bg-white/5 text-zinc-400 hover:bg-white/10"
            }`}
          >
            Descontar en camino
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/25 bg-red-500/10 px-2.5 py-2.5 text-sm text-red-300">{error}</div>
      )}

      {/* ---------- KPIs ---------- */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="SKUs a reponer" value={fmtInt(totals.skus)} />
        <Kpi label="Unidades a pedir" value={fmtInt(totals.unidades)} />
        <div className="brand-gradient brand-glow col-span-2 rounded-2xl p-4 text-white lg:col-span-2">
          <div className="flex items-baseline justify-between">
            <p className="text-xs font-medium uppercase tracking-wide text-white/80">Valor del pedido (costo origen)</p>
            <span className="text-[11px] text-white/70">
              {totals.conCosto}/{totals.skus} con costo
            </span>
          </div>
          <p className="mt-1 text-2xl font-bold">{fmtUsd(totals.valor)}</p>
        </div>
      </div>

      {/* ---------- Filtros de tabla ---------- */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-500">
            <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
          </svg>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por código o título…" className="field !pl-11" />
        </div>
        <button
          onClick={() => setSoloReponer((v) => !v)}
          className={`rounded-xl border px-3.5 py-2.5 text-sm font-semibold transition ${
            soloReponer ? "border-teal-500/40 bg-teal-500/15 text-teal-200" : "border-white/10 bg-white/[0.02] text-zinc-400 hover:bg-white/5"
          }`}
        >
          Solo con reposición
        </button>
        <button onClick={exportCsv} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm font-semibold text-zinc-200 transition hover:bg-white/10">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
            <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 21h16" />
          </svg>
          CSV
        </button>
      </div>

      {/* ---------- Tabla ---------- */}
      <div className="card overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="border-b border-white/10 bg-white/[0.03] text-xs uppercase tracking-wide text-zinc-400">
            <tr>
              <Th onClick={() => toggleSort("sku")}>Código{arrow("sku")}</Th>
              <Th className="text-left" onClick={() => toggleSort("titulo")}>Título{arrow("titulo")}</Th>
              <Th right onClick={() => toggleSort("vendidas")}>Vendidas{arrow("vendidas")}</Th>
              <Th right onClick={() => toggleSort("promMes")}>Prom/mes{arrow("promMes")}</Th>
              <Th right onClick={() => toggleSort("stock")}>Stock{arrow("stock")}</Th>
              <Th right onClick={() => toggleSort("enCamino")}>En camino{arrow("enCamino")}</Th>
              <Th right accent onClick={() => toggleSort("sugerida")}>Reponer ({fmtDec(meses, 1)}m){arrow("sugerida")}</Th>
              <Th right onClick={() => toggleSort("valor")}>Valor USD{arrow("valor")}</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {filtered.map((r) => (
              <tr key={r.sku} className="transition hover:bg-white/[0.03]">
                <td className="whitespace-nowrap px-3 py-2.5 font-mono font-medium text-zinc-100">{r.sku}</td>
                <td className="max-w-[280px] truncate px-3 py-2.5 text-zinc-300" title={r.titulo ?? ""}>
                  {r.titulo ?? <span className="text-zinc-600">—</span>}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-zinc-200">{fmtInt(r.vendidas)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-zinc-400">{fmtDec(r.promMes, 1)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-zinc-300">
                  {r.stock === null ? <span className="text-zinc-600">—</span> : fmtInt(r.stock)}
                </td>
                <td className={`px-3 py-2.5 text-right tabular-nums ${r.enCamino > 0 ? "text-sky-300" : "text-zinc-600"}`}>
                  {r.enCamino > 0 ? fmtInt(r.enCamino) : "—"}
                </td>
                <td className="px-3 py-2.5 text-right font-bold tabular-nums">
                  {r.sugerida > 0 ? <span className="text-teal-300">{fmtInt(r.sugerida)}</span> : <span className="text-zinc-600">0</span>}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-zinc-300">
                  {r.valor != null ? fmtUsd(r.valor) : <span className="text-amber-400/70" title="Sin costo de origen cargado">s/c</span>}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && !loading && (
              <tr><td colSpan={8} className="px-4 py-12 text-center text-sm text-zinc-500">No hay resultados en este rango.</td></tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-white/10 bg-white/[0.03] font-semibold text-white">
              <td className="px-3 py-3" colSpan={6}>{fmtInt(totals.skus)} SKUs a reponer</td>
              <td className="px-3 py-3 text-right tabular-nums text-teal-300">{fmtInt(totals.unidades)}</td>
              <td className="px-3 py-3 text-right tabular-nums">{fmtUsd(totals.valor)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="px-1 text-xs leading-relaxed text-zinc-500">
        Sugerida = (ventas ÷ meses del período) × meses a cubrir − stock{descontarCamino ? " − en camino" : ""}, redondeado y sin bajar de 0.
        Ventas = ML + Odoo (local, mayorista y otros), sin duplicar ML. Valor en USD al costo de origen (FOB) de los contenedores;
        <span className="text-amber-400/70"> s/c</span> = SKU sin costo de origen cargado.
      </p>
    </div>
  );
}

// ---------- Subcomponentes ----------
function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="text-2xl font-bold tabular-nums text-white">{value}</div>
    </div>
  );
}

function Th({
  children,
  right,
  accent,
  onClick,
  className,
}: {
  children: React.ReactNode;
  right?: boolean;
  accent?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <th
      onClick={onClick}
      className={`whitespace-nowrap px-3 py-3 font-semibold ${right ? "text-right" : ""} ${
        onClick ? "cursor-pointer select-none hover:text-white" : ""
      } ${accent ? "text-teal-300" : ""} ${className ?? ""}`}
    >
      {children}
    </th>
  );
}
