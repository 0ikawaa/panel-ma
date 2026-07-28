"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fmtPeso, fmtPesoSigned } from "@/lib/format";
import { csvCell } from "@/lib/csv";
import {
  fmtDiaCortoMl as fmtDiaCorto,
  fmtHoraMl as fmtHora,
  hoyInput as todayStr,
} from "@/lib/fechaVentas";
import type { ApiItem, ApiOrder, ApiResp } from "@/lib/tiposOrdenes";
import ProductThumb from "./ProductThumb";
import TipoBadges from "./TipoBadges";
import EditarCostoModal, { type CostoEnEdicion } from "./EditarCostoModal";
import OrdenDetallePanel from "./OrdenDetallePanel";

type SortKey = "fecha" | "venta" | "costo" | "margen" | "pct";

export default function OrdenesRealTime() {
  const [desde, setDesde] = useState(todayStr);
  const [hasta, setHasta] = useState(todayStr);
  const [data, setData] = useState<ApiResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Overrides de costo aplicados en vivo (SKU -> costo unitario). Optimista.
  const [localCosts, setLocalCosts] = useState<Record<string, number>>({});

  // Filtros / opciones
  const [q, setQ] = useState("");
  const [publiPct, setPubliPct] = useState(5);
  const [incluirSinCosto, setIncluirSinCosto] = useState(false);
  const [soloSinCosto, setSoloSinCosto] = useState(false);
  const [sospechosas, setSospechosas] = useState(false);
  const [tab, setTab] = useState<"orden" | "publicacion">("orden");
  const [sortKey, setSortKey] = useState<SortKey>("fecha");
  const [sortDir, setSortDir] = useState<1 | -1>(-1);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [auto, setAuto] = useState(false);

  // Panel lateral de detalle de una orden.
  const [detail, setDetail] = useState<ApiOrder | null>(null);

  // Modal de edición de costo
  const [edit, setEdit] = useState<CostoEnEdicion | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/ventas-ml?desde=${desde}&hasta=${hasta}`, {
        cache: "no-store",
        signal: AbortSignal.timeout(45000),
      });
      // Puede venir un error no-JSON (500/HTML). Leemos texto y parseamos con cuidado.
      const text = await res.text();
      let json: unknown = null;
      try { json = text ? JSON.parse(text) : null; } catch { /* respuesta no-JSON */ }
      if (!res.ok) {
        const msg = (json as { error?: string } | null)?.error || `Error ${res.status}`;
        throw new Error(msg);
      }
      setData(json as ApiResp);
    } catch (e) {
      const err = e as Error;
      let msg = err.message;
      if (err.name === "TimeoutError" || err.name === "AbortError") {
        msg = "La consulta tardó demasiado (timeout). Probá de nuevo o achicá el rango de fechas.";
      } else if (/failed to fetch|load failed|networkerror/i.test(msg)) {
        msg = "No se pudo conectar con el servidor. Verificá que la app esté corriendo (npm run dev) y refrescá la página.";
      }
      setError(msg);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [desde, hasta]);

  // Carga inicial y al cambiar el rango de fechas.
  useEffect(() => {
    // Fuera del render: `fetchData` prende el "cargando" apenas se lo llama y
    // hacerlo sincrónicamente dentro del efecto encadena un render de más.
    void (async () => {
      await fetchData();
    })();
  }, [fetchData]);

  // Auto-refresh cada 60s (la API de ML se sincroniza cada ~2 min).
  // El ref guarda siempre el último `fetchData` para que el intervalo no se
  // recree con cada cambio de fechas; se actualiza en un efecto y no durante el
  // render, que es lectura/escritura de refs fuera de lugar.
  const fetchRef = useRef(fetchData);
  useEffect(() => {
    fetchRef.current = fetchData;
  }, [fetchData]);
  useEffect(() => {
    if (!auto) return;
    const id = setInterval(() => fetchRef.current(), 60000);
    return () => clearInterval(id);
  }, [auto]);

  // Cerrar con Escape: primero el modal de costo, si no el panel de detalle.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (edit) setEdit(null);
      else if (detail) setDetail(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [edit, detail]);

  // Costo unitario efectivo de un ítem: edición local > override guardado > Odoo.
  const effCost = useCallback(
    (it: ApiItem): number | null => {
      if (it.sku && it.sku in localCosts) return localCosts[it.sku];
      if (it.overrideCost != null) return it.overrideCost;
      return it.baseCost;
    },
    [localCosts],
  );

  // Métricas por orden.
  const metrics = useCallback(
    (o: ApiOrder) => {
      let costo = 0;
      let hasCost = o.items.length > 0;
      for (const it of o.items) {
        const c = effCost(it);
        if (c == null) hasCost = false;
        else costo += c * it.qty;
      }
      const venta = o.venta;
      const comision = o.comision;
      const envio = o.envio;
      const publi = (venta * publiPct) / 100;
      const margen = venta - costo - comision + envio - publi;
      const pct = venta ? margen / venta : 0;
      return { venta, costo, hasCost, comision, envio, publi, margen, pct };
    },
    [effCost, publiPct],
  );

  // Con `data?.orders ?? []` suelto, el array era nuevo en cada render y los
  // useMemo que dependen de él no memoizaban nada: se refiltraba y reordenaba
  // la tabla entera cada vez que se tipeaba una letra en el buscador.
  const orders = useMemo(() => data?.orders ?? [], [data]);

  // Filtrado.
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return orders.filter((o) => {
      if (needle) {
        const hit =
          o.orderId.includes(needle) ||
          o.items.some(
            (it) =>
              it.sku.toLowerCase().includes(needle) ||
              it.title.toLowerCase().includes(needle),
          );
        if (!hit) return false;
      }
      const m = metrics(o);
      if (soloSinCosto && m.hasCost) return false;
      if (sospechosas) {
        const susp = m.hasCost && (m.margen < 0 || m.costo > m.venta || m.pct > 0.8);
        if (!susp) return false;
      }
      return true;
    });
  }, [orders, q, soloSinCosto, sospechosas, metrics]);

  // Ordenamiento.
  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      const ma = metrics(a);
      const mb = metrics(b);
      let va: number, vb: number;
      switch (sortKey) {
        case "venta": va = ma.venta; vb = mb.venta; break;
        case "costo": va = ma.costo; vb = mb.costo; break;
        case "margen": va = ma.margen; vb = mb.margen; break;
        case "pct": va = ma.pct; vb = mb.pct; break;
        default: va = new Date(a.date).getTime(); vb = new Date(b.date).getTime();
      }
      return (va - vb) * sortDir;
    });
    return arr;
  }, [filtered, sortKey, sortDir, metrics]);

  // Filas que entran en los totales (según "incluir sin costo").
  const included = useMemo(
    () => sorted.filter((o) => incluirSinCosto || metrics(o).hasCost),
    [sorted, incluirSinCosto, metrics],
  );

  // Totales.
  const totals = useMemo(() => {
    const t = { venta: 0, costo: 0, comision: 0, envio: 0, publi: 0, margen: 0 };
    for (const o of included) {
      const m = metrics(o);
      t.venta += m.venta;
      t.costo += m.costo;
      t.comision += m.comision;
      t.envio += m.envio;
      t.publi += m.publi;
      t.margen += m.margen;
    }
    const pct = t.venta ? t.margen / t.venta : 0;
    return { ...t, pct };
  }, [included, metrics]);

  const conCosto = useMemo(() => sorted.filter((o) => metrics(o).hasCost).length, [sorted, metrics]);

  // Vista "Por publicación": agrega ítems por SKU.
  const porPublicacion = useMemo(() => {
    const map = new Map<
      string,
      { sku: string; title: string; photo: string | null; unidades: number; venta: number; costo: number; hasCost: boolean }
    >();
    for (const o of sorted) {
      for (const it of o.items) {
        const key = it.sku || it.itemId;
        let r = map.get(key);
        if (!r) {
          r = { sku: it.sku, title: it.title, photo: it.photo, unidades: 0, venta: 0, costo: 0, hasCost: true };
          map.set(key, r);
        }
        if (!r.photo && it.photo) r.photo = it.photo;
        r.unidades += it.qty;
        r.venta += it.unitPrice * it.qty;
        const c = effCost(it);
        if (c == null) r.hasCost = false;
        else r.costo += c * it.qty;
      }
    }
    return Array.from(map.values()).sort((a, b) => b.venta - a.venta);
  }, [sorted, effCost]);

  // Órdenes agrupadas por pack (para chip "PACK xN" y despliegue de hermanas).
  const packMap = useMemo(() => {
    const map = new Map<string, ApiOrder[]>();
    for (const o of orders) {
      if (!o.packId) continue;
      const arr = map.get(o.packId) ?? [];
      arr.push(o);
      map.set(o.packId, arr);
    }
    return map;
  }, [orders]);

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir((d) => (d === 1 ? -1 : 1));
    else { setSortKey(k); setSortDir(-1); }
  }
  function toggleRow(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function openEdit(sku: string, title: string, current: number | null) {
    setEdit({ sku, title, current });
    setEditValue(current != null ? String(current) : "");
    setEditError(null);
  }
  async function saveEdit() {
    if (!edit) return;
    const cost = Number(editValue);
    if (!Number.isFinite(cost) || cost < 0) { setEditError("Ingresá un costo válido."); return; }
    setEditLoading(true);
    setEditError(null);
    try {
      const res = await fetch("/api/costos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sku: edit.sku, cost }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || `Error ${res.status}`);
      }
      setLocalCosts((prev) => ({ ...prev, [edit.sku]: cost }));
      setEdit(null);
    } catch (e) {
      setEditError((e as Error).message);
    } finally {
      setEditLoading(false);
    }
  }

  function exportCsv() {
    const head = ["Fecha", "Orden", "SKU", "Producto", "Venta", "Costo", "Comision", "Envio", "Publi", "Margen", "Margen%", "Tipo"];
    const lines = [head.map(csvCell).join(",")];
    for (const o of sorted) {
      const m = metrics(o);
      const it = o.items[0];
      const prod = it?.title ?? "";
      lines.push([
        csvCell(`${fmtDiaCorto(o.date)} ${fmtHora(o.date)}`),
        csvCell(o.orderId),
        csvCell(o.items.map((x) => x.sku).join(" | ")),
        csvCell(prod),
        m.venta, Math.round(m.costo), Math.round(m.comision), Math.round(m.envio),
        Math.round(m.publi), Math.round(m.margen), (m.pct * 100).toFixed(1),
        csvCell(o.logisticType || ""),
      ].join(","));
    }
    const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ordenes_${desde}_${hasta}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Atajos de rango.
  function setHoy() { const t = todayStr(); setDesde(t); setHasta(t); }
  function setMes() {
    const d = new Date();
    const off = d.getTimezoneOffset();
    const first = new Date(d.getFullYear(), d.getMonth(), 1);
    setDesde(new Date(first.getTime() - off * 60000).toISOString().slice(0, 10));
    setHasta(todayStr());
  }

  const arrow = (k: SortKey) => (sortKey === k ? (sortDir === 1 ? " ▲" : " ▼") : "");

  return (
    <div className="space-y-4">
      {/* ---------- Toolbar ---------- */}
      <div className="card space-y-3 p-3 sm:p-4">
        {/* Buscador + rango */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <label className="relative block min-w-0 flex-1">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500">
              <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
            </svg>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="SKU, producto, orden…" className="field !pl-11" />
          </label>
          <div className="grid grid-cols-2 gap-2 lg:flex lg:items-end">
            <div className="min-w-0">
              <label className="mb-1 block text-[11px] font-medium text-zinc-500">Desde</label>
              <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="field !px-2.5 text-sm lg:!px-3.5" />
            </div>
            <div className="min-w-0">
              <label className="mb-1 block text-[11px] font-medium text-zinc-500">Hasta</label>
              <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="field !px-2.5 text-sm lg:!px-3.5" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={setHoy} className="flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm font-semibold text-zinc-200 transition hover:bg-white/10 lg:flex-none">Hoy</button>
            <button onClick={setMes} className="flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm font-semibold text-zinc-200 transition hover:bg-white/10 lg:flex-none">Mes</button>
            <button onClick={fetchData} disabled={loading} className="brand-gradient brand-glow flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60 lg:flex-none">
              {loading ? "Buscando…" : "Buscar"}
            </button>
            <button onClick={fetchData} disabled={loading} className="shrink-0 rounded-xl border border-white/10 bg-white/5 p-2.5 text-zinc-200 transition hover:bg-white/10" aria-label="Refrescar" title="Refrescar">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className={`h-5 w-5 ${loading ? "animate-spin" : ""}`}>
                <path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button onClick={exportCsv} className="shrink-0 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm font-semibold text-zinc-200 transition hover:bg-white/10">CSV</button>
          </div>
        </div>

        {/* Filtros: en celular se deslizan en horizontal en vez de apilarse. */}
        <div className="-mx-3 flex items-center gap-2 overflow-x-auto px-3 pb-1 sm:-mx-4 sm:px-4 lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0 lg:pb-0">
          <Toggle label="Incluir sin costo" on={incluirSinCosto} onClick={() => setIncluirSinCosto((v) => !v)} />
          <Toggle label="Solo sin costo" on={soloSinCosto} onClick={() => setSoloSinCosto((v) => !v)} />
          <Toggle label="Sospechosas" on={sospechosas} onClick={() => setSospechosas((v) => !v)} accent="amber" />
          <Toggle label="Auto 60s" on={auto} onClick={() => setAuto((v) => !v)} accent="teal" />
          <label className="flex shrink-0 items-center gap-1.5 text-xs text-zinc-400">
            Publi %
            <input type="number" min={0} step={0.5} value={publiPct}
              onChange={(e) => setPubliPct(Number(e.target.value) || 0)}
              className="field !w-16 !py-1.5 text-center text-sm" />
          </label>
          <span className="ml-auto hidden shrink-0 pl-2 text-sm text-zinc-500 lg:inline">
            {conCosto} con costo{sorted.length - conCosto > 0 ? ` (${sorted.length - conCosto} sin costo)` : ""}
          </span>
        </div>
        <p className="text-xs text-zinc-500 lg:hidden">
          {conCosto} con costo{sorted.length - conCosto > 0 ? ` · ${sorted.length - conCosto} sin costo` : ""}
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/25 bg-red-500/10 px-2.5 py-2.5 text-sm text-red-300">
          {error}
        </div>
      )}
      {data?.truncated && (
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-2.5 py-2.5 text-sm text-amber-300">
          Se alcanzó el límite de 5000 filas. Achicá el rango de fechas para ver todo.
        </div>
      )}

      {/* ---------- Totales ---------- */}
      <div className="card grid grid-cols-2 gap-x-4 gap-y-3 p-3 sm:grid-cols-3 sm:p-4 lg:flex lg:flex-wrap lg:gap-x-8">
        <Tile label="Venta" value={fmtPeso(totals.venta)} />
        <Tile label="Costo" value={fmtPeso(totals.costo)} />
        <Tile label="Comisión" value={fmtPeso(totals.comision)} tone="red" />
        <Tile label="Envío neto" value={fmtPesoSigned(totals.envio)} tone={totals.envio < 0 ? "red" : "green"} />
        <Tile label="Publicidad" value={fmtPeso(totals.publi)} tone="red" />
        <Tile label={`Margen (${(totals.pct * 100).toFixed(0)}%)`} value={fmtPeso(totals.margen)} tone={totals.margen < 0 ? "red" : "green"} big />
      </div>

      {/* ---------- Tabs ---------- */}
      <div className="flex gap-1 border-b border-white/10">
        <TabBtn active={tab === "orden"} onClick={() => setTab("orden")}>Por orden</TabBtn>
        <TabBtn active={tab === "publicacion"} onClick={() => setTab("publicacion")}>Por publicación</TabBtn>
      </div>

      {/* Orden de la lista: en celular no hay encabezados de tabla clickeables. */}
      {tab === "orden" && (
        <div className="flex items-center gap-2 lg:hidden">
          <span className="text-xs text-zinc-500">Ordenar por</span>
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="field !w-auto !py-1.5 text-sm"
          >
            <option value="fecha">Fecha</option>
            <option value="venta">Venta</option>
            <option value="costo">Costo</option>
            <option value="margen">Margen $</option>
            <option value="pct">Margen %</option>
          </select>
          <button
            onClick={() => setSortDir((d) => (d === 1 ? -1 : 1))}
            className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-semibold text-zinc-300 transition hover:bg-white/10"
            aria-label="Invertir orden"
          >
            {sortDir === 1 ? "▲ Asc" : "▼ Desc"}
          </button>
        </div>
      )}

      {/* ---------- Lista por orden (celular) ---------- */}
      {tab === "orden" && (
        <div className="space-y-2.5 lg:hidden">
          {sorted.length === 0 && !loading && (
            <div className="card px-4 py-10 text-center text-sm text-zinc-500">No hay órdenes en este rango.</div>
          )}
          {sorted.map((o) => {
            const m = metrics(o);
            const it = o.items[0];
            const siblings = o.packId ? packMap.get(o.packId) ?? [] : [];
            const isPack = siblings.length > 1;
            const isOpen = expanded.has(o.orderId);
            const dim = !m.hasCost && !incluirSinCosto;
            return (
              <div key={o.orderId} className={`card p-3 transition active:bg-white/[0.04] ${dim ? "opacity-60" : ""}`}>
                <div onClick={() => setDetail(o)} className="cursor-pointer">
                  <div className="flex items-start justify-between gap-2">
                    <ProductThumb src={it?.photo} alt={it?.sku} size={44} />
                    <div className="min-w-0 flex-1">
                      <div className="line-clamp-2 text-sm font-medium leading-snug text-zinc-100">
                        {isPack && <span className="mr-1 rounded bg-indigo-500/15 px-1.5 py-0.5 align-middle text-[10px] font-semibold text-indigo-200">PACK x{siblings.length}</span>}
                        {it?.title || "—"}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
                        <span className="text-zinc-500">{it?.sku || "sin SKU"}</span>
                        <span className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">…{o.orderId.slice(-4)}</span>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-xs font-medium text-zinc-300">{fmtDiaCorto(o.date)}</div>
                      <div className="text-[11px] text-zinc-500">{fmtHora(o.date)}</div>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2 border-t border-white/5 pt-2.5">
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-zinc-500">Venta</div>
                      <div className="text-sm font-semibold tabular-nums text-zinc-100">{fmtPeso(m.venta)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-zinc-500">Costo</div>
                      <button
                        onClick={(e) => { e.stopPropagation(); if (it) openEdit(it.sku, it.title, effCost(it)); }}
                        className={`-ml-1 inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-sm font-semibold tabular-nums transition active:bg-white/10 ${m.hasCost ? "text-zinc-100" : "text-amber-300"}`}
                      >
                        {m.hasCost ? fmtPeso(m.costo) : "sin costo"}
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-3 w-3 opacity-60"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      </button>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] uppercase tracking-wide text-zinc-500">Margen</div>
                      <div className={`text-sm font-bold tabular-nums ${m.margen < 0 ? "text-red-400" : "text-emerald-400"}`}>
                        {fmtPeso(m.margen)}
                        <span className={`ml-1 text-[11px] font-semibold ${m.pct < 0 ? "text-red-400" : "text-amber-300"}`}>{(m.pct * 100).toFixed(0)}%</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-2 flex items-center justify-between gap-2">
                    <TipoBadges o={o} />
                    <div className="flex items-center gap-3 text-[11px] tabular-nums text-zinc-500">
                      <span className="text-red-400">Com. -{fmtPeso(m.comision)}</span>
                      <span className={m.envio < 0 ? "text-red-400" : "text-emerald-400"}>Env. {fmtPesoSigned(m.envio)}</span>
                    </div>
                  </div>
                </div>

                {isPack && (
                  <button
                    onClick={() => toggleRow(o.orderId)}
                    className="mt-2 flex w-full items-center justify-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] py-1.5 text-[11px] font-semibold text-zinc-400 transition active:bg-white/10"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={`h-3.5 w-3.5 transition-transform ${isOpen ? "rotate-90" : ""}`}><path d="m9 18 6-6-6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    {isOpen ? "Ocultar" : "Ver"} las {siblings.length} órdenes del pack
                  </button>
                )}
                {isPack && isOpen && (
                  <div className="animate-in mt-2 space-y-2 rounded-xl border border-white/10 bg-white/[0.02] p-2.5">
                    {siblings.map((s) => {
                      const sit = s.items[0];
                      const c = sit ? effCost(sit) : null;
                      return (
                        <div key={s.orderId} className="text-xs">
                          <div className="line-clamp-1 text-zinc-200">{sit?.title || "—"}</div>
                          <div className="mt-0.5 flex items-center justify-between gap-2">
                            <span className="font-mono text-[11px] text-zinc-500">{sit?.sku || "—"}</span>
                            <div className="flex items-center gap-3 tabular-nums">
                              <span className="text-zinc-200">{fmtPeso(s.venta)}</span>
                              <button onClick={() => sit && openEdit(sit.sku, sit.title, c)} className={`inline-flex items-center gap-1 rounded px-1 py-0.5 active:bg-white/10 ${c == null ? "text-amber-300" : "text-zinc-200"}`}>
                                {c == null ? "sin costo" : fmtPeso(c * (sit?.qty ?? 1))}
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-3 w-3 opacity-60"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" strokeLinecap="round" strokeLinejoin="round" /></svg>
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ---------- Tabla por orden (desktop) ---------- */}
      {tab === "orden" && (
        <div className="card hidden overflow-x-auto lg:block">
          <table className="w-full table-fixed border-collapse text-sm">
            <colgroup>
              <col style={{ width: "60px" }} />
              <col />
              <col style={{ width: "80px" }} />
              <col style={{ width: "92px" }} />
              <col style={{ width: "82px" }} />
              <col style={{ width: "74px" }} />
              <col style={{ width: "72px" }} />
              <col style={{ width: "86px" }} />
              <col style={{ width: "48px" }} />
              <col style={{ width: "92px" }} />
            </colgroup>
            <thead className="border-b border-white/10 bg-white/[0.03] text-xs uppercase tracking-wide text-zinc-400">
              <tr>
                <Th onClick={() => toggleSort("fecha")}>Fecha{arrow("fecha")}</Th>
                <Th className="text-left">Producto</Th>
                <Th right onClick={() => toggleSort("venta")}>Venta{arrow("venta")}</Th>
                <Th right onClick={() => toggleSort("costo")}>Costo{arrow("costo")}</Th>
                <Th right>Comisión</Th>
                <Th right>Envío</Th>
                <Th right>Publi</Th>
                <Th right onClick={() => toggleSort("margen")}>Margen ${arrow("margen")}</Th>
                <Th right onClick={() => toggleSort("pct")}>%{arrow("pct")}</Th>
                <Th className="text-left">Tipo</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {sorted.length === 0 && !loading && (
                <tr><td colSpan={10} className="px-4 py-12 text-center text-zinc-500">No hay órdenes en este rango.</td></tr>
              )}
              {sorted.map((o) => {
                const m = metrics(o);
                const it = o.items[0];
                const siblings = o.packId ? packMap.get(o.packId) ?? [] : [];
                const isPack = siblings.length > 1;
                const isOpen = expanded.has(o.orderId);
                const dim = !m.hasCost && !incluirSinCosto;
                return (
                  <FragmentRow key={o.orderId}>
                    <tr
                      onClick={() => setDetail(o)}
                      className={`cursor-pointer transition hover:bg-white/[0.03] ${detail?.orderId === o.orderId ? "bg-white/[0.04]" : ""} ${dim ? "opacity-55" : ""}`}
                    >
                      <td className="whitespace-nowrap px-2.5 py-2.5 text-zinc-300">
                        <div>{fmtDiaCorto(o.date)}</div>
                        <div className="text-xs text-zinc-500">{fmtHora(o.date)}</div>
                      </td>
                      <td className="px-2.5 py-2.5">
                        <div className="flex items-start gap-2">
                          {isPack ? (
                            <button onClick={(e) => { e.stopPropagation(); toggleRow(o.orderId); }} className="mt-0.5 text-zinc-400 hover:text-white" aria-label="Ver órdenes del pack">
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={`h-4 w-4 transition-transform ${isOpen ? "rotate-90" : ""}`}><path d="m9 18 6-6-6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                            </button>
                          ) : <span className="w-4" />}
                          <ProductThumb src={it?.photo} alt={it?.sku} size={36} />
                          <div className="min-w-0">
                            <div className="truncate text-zinc-100" title={it?.title}>
                              {isPack && <span className="mr-1 rounded bg-indigo-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-200">PACK x{siblings.length}</span>}
                              {it?.title || "—"}
                            </div>
                            <div className="mt-0.5 flex items-center gap-2 text-xs">
                              <span className="text-zinc-500">{it?.sku || "sin SKU"}</span>
                              <span className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">…{o.orderId.slice(-4)}</span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-2.5 py-2.5 text-right tabular-nums text-zinc-100">{fmtPeso(m.venta)}</td>
                      <td className="px-2.5 py-2.5 text-right tabular-nums">
                        <button
                          onClick={(e) => { e.stopPropagation(); if (it) openEdit(it.sku, it.title, effCost(it)); }}
                          className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 transition hover:bg-white/10 ${m.hasCost ? "text-zinc-100" : "text-amber-300"}`}
                          title="Editar costo del SKU"
                        >
                          {m.hasCost ? fmtPeso(m.costo) : "sin costo"}
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-3 w-3 opacity-60"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        </button>
                      </td>
                      <td className="px-2.5 py-2.5 text-right tabular-nums text-red-400">{m.comision ? "-" + fmtPeso(m.comision) : "$0"}</td>
                      <td className={`px-2.5 py-2.5 text-right tabular-nums ${m.envio < 0 ? "text-red-400" : "text-emerald-400"}`}>{fmtPesoSigned(m.envio)}</td>
                      <td className="px-2.5 py-2.5 text-right tabular-nums text-red-400">{m.publi ? "-" + fmtPeso(m.publi) : "$0"}</td>
                      <td className={`px-2.5 py-2.5 text-right tabular-nums font-semibold ${m.margen < 0 ? "text-red-400" : "text-emerald-400"}`}>{fmtPeso(m.margen)}</td>
                      <td className={`px-2.5 py-2.5 text-right tabular-nums font-semibold ${m.pct < 0 ? "text-red-400" : "text-amber-300"}`}>{(m.pct * 100).toFixed(0)}%</td>
                      <td className="px-2.5 py-2.5"><TipoBadges o={o} /></td>
                    </tr>
                    {isPack && isOpen && (
                      <tr className="bg-black/20">
                        <td colSpan={10} className="px-2.5 py-2.5">
                          <div className="animate-in space-y-1 rounded-xl border border-white/10 bg-white/[0.02] p-3">
                            <div className="mb-1 text-[11px] uppercase tracking-wide text-zinc-500">Órdenes del pack …{o.packId?.slice(-4)}</div>
                            {siblings.map((s) => {
                              const sit = s.items[0];
                              const c = sit ? effCost(sit) : null;
                              return (
                                <div key={s.orderId} className="flex items-center gap-3 text-xs">
                                  <span className="w-20 shrink-0 font-mono text-zinc-400">{sit?.sku || "—"}</span>
                                  <span className="flex-1 truncate text-zinc-200" title={sit?.title}>{sit?.title}</span>
                                  <span className="w-24 text-right tabular-nums text-zinc-200">{fmtPeso(s.venta)}</span>
                                  <button onClick={() => sit && openEdit(sit.sku, sit.title, c)} className={`inline-flex w-24 items-center justify-end gap-1 rounded px-1 py-0.5 hover:bg-white/10 ${c == null ? "text-amber-300" : "text-zinc-200"}`} title="Editar costo">
                                    {c == null ? "sin costo" : fmtPeso(c * (sit?.qty ?? 1))}
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-3 w-3 opacity-60"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" strokeLinecap="round" strokeLinejoin="round" /></svg>
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        </td>
                      </tr>
                    )}
                  </FragmentRow>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ---------- Lista por publicación (celular) ---------- */}
      {tab === "publicacion" && (
        <div className="space-y-2.5 lg:hidden">
          {porPublicacion.length === 0 && (
            <div className="card px-4 py-10 text-center text-sm text-zinc-500">Sin datos.</div>
          )}
          {porPublicacion.map((r) => {
            const margen = r.venta - r.costo;
            const pct = r.venta ? margen / r.venta : 0;
            return (
              <div key={r.sku || r.title} className="card p-3">
                <div className="flex items-start gap-3">
                  <ProductThumb src={r.photo} alt={r.sku} size={44} />
                  <div className="min-w-0 flex-1">
                    <div className="line-clamp-2 text-sm font-medium leading-snug text-zinc-100">{r.title}</div>
                    <div className="mt-1 flex items-center gap-2 text-[11px]">
                      <button onClick={() => openEdit(r.sku, r.title, null)} className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-zinc-300 active:bg-white/10">
                        {r.sku || "—"}
                      </button>
                      <span className="text-zinc-500">{r.unidades} u.</span>
                    </div>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 border-t border-white/5 pt-2.5">
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-zinc-500">Venta</div>
                    <div className="text-sm font-semibold tabular-nums text-zinc-100">{fmtPeso(r.venta)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-zinc-500">Costo</div>
                    <div className={`text-sm font-semibold tabular-nums ${r.hasCost ? "text-zinc-100" : "text-amber-300"}`}>{r.hasCost ? fmtPeso(r.costo) : "parcial"}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] uppercase tracking-wide text-zinc-500">Margen bruto</div>
                    <div className={`text-sm font-bold tabular-nums ${margen < 0 ? "text-red-400" : "text-emerald-400"}`}>
                      {fmtPeso(margen)}
                      <span className={`ml-1 text-[11px] font-semibold ${pct < 0 ? "text-red-400" : "text-amber-300"}`}>{(pct * 100).toFixed(0)}%</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          <p className="px-1 text-xs text-zinc-500">Margen bruto = Venta − Costo (no incluye comisión, envío ni publicidad, que son por orden).</p>
        </div>
      )}

      {/* ---------- Tabla por publicación (desktop) ---------- */}
      {tab === "publicacion" && (
        <div className="card hidden overflow-x-auto lg:block">
          <table className="w-full border-collapse text-sm">
            <thead className="border-b border-white/10 bg-white/[0.03] text-xs uppercase tracking-wide text-zinc-400">
              <tr>
                <Th className="text-left"> </Th>
                <Th className="text-left">SKU</Th>
                <Th className="text-left">Producto</Th>
                <Th right>Unidades</Th>
                <Th right>Venta</Th>
                <Th right>Costo</Th>
                <Th right>Margen bruto</Th>
                <Th right>%</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {porPublicacion.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-12 text-center text-zinc-500">Sin datos.</td></tr>
              )}
              {porPublicacion.map((r) => {
                const margen = r.venta - r.costo;
                const pct = r.venta ? margen / r.venta : 0;
                return (
                  <tr key={r.sku || r.title} className="transition hover:bg-white/[0.03]">
                    <td className="px-2.5 py-2"><ProductThumb src={r.photo} alt={r.sku} size={36} /></td>
                    <td className="px-2.5 py-2.5 font-mono text-xs text-zinc-300">
                      <button onClick={() => openEdit(r.sku, r.title, null)} className="hover:text-white" title="Editar costo del SKU">{r.sku || "—"}</button>
                    </td>
                    <td className="px-2.5 py-2.5"><span className="line-clamp-1 text-zinc-100" title={r.title}>{r.title}</span></td>
                    <td className="px-2.5 py-2.5 text-right tabular-nums text-zinc-300">{r.unidades}</td>
                    <td className="px-2.5 py-2.5 text-right tabular-nums text-zinc-100">{fmtPeso(r.venta)}</td>
                    <td className={`px-2.5 py-2.5 text-right tabular-nums ${r.hasCost ? "text-zinc-100" : "text-amber-300"}`}>{r.hasCost ? fmtPeso(r.costo) : "parcial"}</td>
                    <td className={`px-2.5 py-2.5 text-right tabular-nums font-semibold ${margen < 0 ? "text-red-400" : "text-emerald-400"}`}>{fmtPeso(margen)}</td>
                    <td className={`px-2.5 py-2.5 text-right tabular-nums ${pct < 0 ? "text-red-400" : "text-amber-300"}`}>{(pct * 100).toFixed(0)}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="px-4 py-2 text-xs text-zinc-500">Margen bruto = Venta − Costo (no incluye comisión, envío ni publicidad, que son por orden).</p>
        </div>
      )}

      {/* ---------- Panel lateral: detalle de la orden ---------- */}
      {detail && (
        <OrdenDetallePanel
          detail={detail}
          metrics={metrics}
          effCost={effCost}
          publiPct={publiPct}
          onClose={() => setDetail(null)}
          onEditCost={openEdit}
        />
      )}

      {edit && (
        <EditarCostoModal
          edit={edit}
          value={editValue}
          onValueChange={setEditValue}
          error={editError}
          loading={editLoading}
          onCancel={() => setEdit(null)}
          onSave={saveEdit}
        />
      )}
    </div>
  );
}

// ---------- Subcomponentes ----------
function FragmentRow({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function Th({ children, right, onClick, className }: { children: React.ReactNode; right?: boolean; onClick?: () => void; className?: string }) {
  return (
    <th
      onClick={onClick}
      className={`px-2.5 py-2.5 font-semibold ${right ? "text-right" : ""} ${onClick ? "cursor-pointer select-none hover:text-white" : ""} ${className ?? ""}`}
    >
      {children}
    </th>
  );
}

function Tile({ label, value, tone, big }: { label: string; value: string; tone?: "red" | "green"; big?: boolean }) {
  const color = tone === "red" ? "text-red-400" : tone === "green" ? "text-emerald-400" : "text-white";
  return (
    <div className="min-w-0">
      <div className="truncate text-[11px] text-zinc-500 sm:text-xs">{label}</div>
      <div className={`${big ? "text-lg sm:text-xl" : "text-base sm:text-lg"} font-bold tabular-nums ${color}`}>{value}</div>
    </div>
  );
}

function Toggle({ label, on, onClick, accent = "indigo" }: { label: string; on: boolean; onClick: () => void; accent?: "indigo" | "amber" | "teal" }) {
  const onCls =
    accent === "amber" ? "border-amber-400/40 bg-amber-500/15 text-amber-200"
    : accent === "teal" ? "border-teal-400/40 bg-teal-500/15 text-teal-200"
    : "border-indigo-400/40 bg-indigo-500/15 text-indigo-100";
  return (
    <button onClick={onClick} className={`shrink-0 whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${on ? onCls : "border-white/10 bg-white/5 text-zinc-400 hover:bg-white/10"}`}>
      {label}
    </button>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`relative px-4 py-2 text-sm font-semibold transition ${active ? "text-white" : "text-zinc-500 hover:text-zinc-300"}`}>
      {children}
      {active && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded bg-indigo-400" />}
    </button>
  );
}

