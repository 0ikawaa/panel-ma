"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fmtPeso, fmtPesoSigned } from "@/lib/format";

// ---------- Tipos (coinciden con /api/ventas-ml) ----------
type ApiItem = {
  itemId: string;
  sku: string;
  title: string;
  qty: number;
  unitPrice: number;
  baseCost: number | null; // costo final: override de la API (tal cual) u Odoo×IVA
  overrideCost: number | null; // override manual local
};
type ApiOrder = {
  orderId: string;
  packId: string | null;
  date: string;
  status: string;
  venta: number;
  comision: number;
  logisticType: string | null;
  shipCost: number | null;
  shipSave: number | null;
  envio: number;
  items: ApiItem[];
};
type ApiResp = { orders: ApiOrder[]; count: number; truncated: boolean; syncedAt: string };

// ---------- Helpers ----------
function todayStr(): string {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}
// Los timestamps de ML vienen con offset -04:00. El DÍA se muestra tal cual lo
// manda ML (mismo criterio que el filtro por fecha, igual que el sistema de
// referencia). La HORA se convierte a zona Uruguay (America/Montevideo, -03:00),
// que es la hora real local (ej. 08:56 -04:00 → 09:56 Uruguay).
const TZ = "America/Montevideo";
function fmtDiaCorto(iso: string): string {
  if (!iso || iso.length < 10) return "";
  return `${+iso.slice(8, 10)}/${+iso.slice(5, 7)}`;
}
function fmtHora(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("es-UY", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: true });
}
function fmtFechaLarga(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const dia = `${+iso.slice(8, 10)}/${+iso.slice(5, 7)}/${iso.slice(0, 4)}`;
  const hora = d.toLocaleTimeString("es-UY", { timeZone: TZ, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true });
  return `${dia}, ${hora}`;
}
function csvCell(v: string | number): string {
  return `"${String(v).replace(/"/g, '""')}"`;
}

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
  const [edit, setEdit] = useState<{ sku: string; title: string; current: number | null } | null>(null);
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
    fetchData();
  }, [fetchData]);

  // Auto-refresh cada 60s (la API de ML se sincroniza cada ~2 min).
  const fetchRef = useRef(fetchData);
  fetchRef.current = fetchData;
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

  const orders = data?.orders ?? [];

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
      { sku: string; title: string; unidades: number; venta: number; costo: number; hasCost: boolean }
    >();
    for (const o of sorted) {
      for (const it of o.items) {
        const key = it.sku || it.itemId;
        let r = map.get(key);
        if (!r) {
          r = { sku: it.sku, title: it.title, unidades: 0, venta: 0, costo: 0, hasCost: true };
          map.set(key, r);
        }
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
      <div className="card flex flex-wrap items-end gap-3 p-4">
        <label className="relative min-w-[220px] flex-1">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500">
            <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
          </svg>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="SKU, producto, orden…" className="field !pl-11" />
        </label>
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
          {loading ? "Buscando…" : "Buscar"}
        </button>
        <button onClick={fetchData} disabled={loading} className="rounded-xl border border-white/10 bg-white/5 p-2.5 text-zinc-200 transition hover:bg-white/10" aria-label="Refrescar" title="Refrescar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className={`h-5 w-5 ${loading ? "animate-spin" : ""}`}>
            <path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <button onClick={exportCsv} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm font-semibold text-zinc-200 transition hover:bg-white/10">CSV</button>

        <div className="flex flex-wrap items-center gap-3 text-sm">
          <Toggle label="Incluir sin costo" on={incluirSinCosto} onClick={() => setIncluirSinCosto((v) => !v)} />
          <Toggle label="Solo sin costo" on={soloSinCosto} onClick={() => setSoloSinCosto((v) => !v)} />
          <Toggle label="Sospechosas" on={sospechosas} onClick={() => setSospechosas((v) => !v)} accent="amber" />
          <Toggle label="Auto 60s" on={auto} onClick={() => setAuto((v) => !v)} accent="teal" />
          <label className="flex items-center gap-1.5 text-zinc-400">
            Publi %
            <input type="number" min={0} step={0.5} value={publiPct}
              onChange={(e) => setPubliPct(Number(e.target.value) || 0)}
              className="field !w-16 !py-1.5 text-center" />
          </label>
        </div>
        <span className="ml-auto text-sm text-zinc-500">
          {conCosto} con costo{sorted.length - conCosto > 0 ? ` (${sorted.length - conCosto} sin costo)` : ""}
        </span>
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
      <div className="card flex flex-wrap gap-x-8 gap-y-3 p-4">
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

      {/* ---------- Tabla por orden ---------- */}
      {tab === "orden" && (
        <div className="card overflow-x-auto">
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

      {/* ---------- Tabla por publicación ---------- */}
      {tab === "publicacion" && (
        <div className="card overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead className="border-b border-white/10 bg-white/[0.03] text-xs uppercase tracking-wide text-zinc-400">
              <tr>
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
                <tr><td colSpan={7} className="px-4 py-12 text-center text-zinc-500">Sin datos.</td></tr>
              )}
              {porPublicacion.map((r) => {
                const margen = r.venta - r.costo;
                const pct = r.venta ? margen / r.venta : 0;
                return (
                  <tr key={r.sku || r.title} className="transition hover:bg-white/[0.03]">
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
      {detail && (() => {
        const m = metrics(detail);
        const plataforma = m.comision + m.publi;
        const margenProd = m.venta - m.costo;
        const util = Math.max(0, m.margen);
        const totalSeg = m.costo + plataforma + util || 1;
        const wCosto = (m.costo / totalSeg) * 100;
        const wPlat = (plataforma / totalSeg) * 100;
        const wUtil = (util / totalSeg) * 100;
        const pctOf = (v: number) => (m.venta ? Math.round((v / m.venta) * 100) : 0);
        const mlUrl = `https://www.mercadolibre.com.uy/ventas/${detail.orderId}/detalle`;
        return (
          <div className="fixed inset-0 z-40 flex justify-end">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setDetail(null)} />
            <div className="animate-in relative h-full w-full max-w-[420px] overflow-y-auto border-l border-white/10 bg-[#131319] shadow-2xl">
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-[#131319]/95 px-5 py-4 backdrop-blur">
                <h2 className="text-lg font-bold text-white">Detalle</h2>
                <button onClick={() => setDetail(null)} className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-white/10 hover:text-white" aria-label="Cerrar">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5"><path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" /></svg>
                </button>
              </div>

              <div className="space-y-6 px-5 py-5">
                {/* PRODUCTO */}
                <Section label="Producto">
                  {detail.items.map((it, i) => (
                    <div key={it.itemId || i} className="mb-1.5">
                      <div className="font-semibold leading-snug text-zinc-100">{it.title || "—"}</div>
                      <div className="mt-0.5 text-xs text-zinc-500">
                        {it.sku || "sin SKU"}{it.qty > 1 ? ` · ${it.qty} u.` : ""}
                      </div>
                    </div>
                  ))}
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
                    <span>Orden #{detail.orderId}</span>
                    <a href={mlUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 font-medium text-teal-300 hover:text-teal-200">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-3.5 w-3.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      Ver venta en ML
                    </a>
                  </div>
                </Section>

                {/* VENTA */}
                <Section label="Venta">
                  <DetailRow label="Precio" value={fmtPeso(m.venta)} strong />
                  <DetailRow label="Fecha" value={fmtFechaLarga(detail.date)} />
                </Section>

                {/* COSTO PRODUCTO */}
                <Section label="Costo producto">
                  {detail.items.map((it, i) => {
                    const c = effCost(it);
                    return (
                      <div key={it.itemId || i} className="flex items-center justify-between py-0.5">
                        <span className="text-zinc-400">Costo unit.{detail.items.length > 1 && it.sku ? ` · ${it.sku}` : ""}</span>
                        <button
                          onClick={(e) => { e.stopPropagation(); openEdit(it.sku, it.title, c); }}
                          className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 transition hover:bg-white/10"
                          title="Editar costo del SKU"
                        >
                          <span className={`tabular-nums font-semibold ${c == null ? "text-amber-300" : "text-zinc-100"}`}>{c == null ? "sin costo" : fmtPeso(c)}</span>
                          <span className="flex h-5 w-5 items-center justify-center rounded bg-teal-500/15 text-teal-300">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-3 w-3"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" strokeLinecap="round" strokeLinejoin="round" /></svg>
                          </span>
                        </button>
                      </div>
                    );
                  })}
                  <div className="mt-2 border-t border-white/10 pt-2">
                    <DetailRow label="Margen producto" value={`${fmtPeso(margenProd)} (${pctOf(margenProd)}%)`} tone={margenProd < 0 ? "red" : "green"} strong />
                  </div>
                  {!m.hasCost && (
                    <p className="mt-1.5 text-xs text-amber-300/90">Costo incompleto: la utilidad es estimada.</p>
                  )}
                </Section>

                {/* PLATAFORMA ML */}
                <Section label="Plataforma ML">
                  <DetailRow label="Comisión" value={m.comision ? "-" + fmtPeso(m.comision) : "$0"} tone="red" />
                  {m.publi > 0 && <DetailRow label={`Publicidad (${publiPct}%)`} value={"-" + fmtPeso(m.publi)} tone="red" />}
                </Section>

                {/* ENVÍO */}
                <Section label="Envío">
                  <div className="flex items-center justify-between py-0.5">
                    <span className="text-zinc-400">Tipo</span>
                    <TipoBadges o={detail} />
                  </div>
                  <DetailRow label="ML te pasa" value={fmtPesoSigned(detail.shipSave ?? 0)} tone={(detail.shipSave ?? 0) >= 0 ? "green" : "red"} />
                  <DetailRow label="Cadete" value={detail.shipCost ? "-" + fmtPeso(detail.shipCost) : "$0"} tone="red" />
                  <div className="mt-2 border-t border-white/10 pt-2">
                    <DetailRow label="Neto envío" value={fmtPesoSigned(m.envio)} tone={m.envio < 0 ? "red" : "green"} strong />
                  </div>
                </Section>

                {/* RESULTADO */}
                <Section label="Resultado">
                  <DetailRow label="Venta" value={fmtPeso(m.venta)} />
                  <DetailRow label="Margen producto" value={fmtPeso(margenProd)} tone={margenProd < 0 ? "red" : "green"} />
                  <DetailRow label="Plataforma" value={plataforma ? "-" + fmtPeso(plataforma) : "$0"} tone="red" />
                  <DetailRow label="Envío neto" value={fmtPesoSigned(m.envio)} tone={m.envio < 0 ? "red" : "green"} />
                  <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-3">
                    <span className="text-base font-bold text-white">UTILIDAD</span>
                    <span className={`text-xl font-bold tabular-nums ${m.margen < 0 ? "text-red-400" : "text-emerald-400"}`}>
                      {fmtPeso(m.margen)} <span className="text-sm">({(m.pct * 100).toFixed(0)}%)</span>
                    </span>
                  </div>
                  <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-white/5">
                    <div style={{ width: `${wCosto}%` }} className="bg-red-500/70" />
                    <div style={{ width: `${wPlat}%` }} className="bg-amber-500/70" />
                    <div style={{ width: `${wUtil}%` }} className="bg-emerald-500/70" />
                  </div>
                  <div className="mt-1.5 flex justify-between text-[11px] font-medium">
                    <span className="text-red-400">Costo {pctOf(m.costo)}%</span>
                    <span className="text-amber-300">ML {pctOf(plataforma)}%</span>
                    <span className="text-emerald-400">Utilidad {pctOf(m.margen)}%</span>
                  </div>
                </Section>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ---------- Modal editar costo ---------- */}
      {edit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !editLoading && setEdit(null)} />
          <div className="animate-in card relative w-full max-w-sm border-white/10 p-6 shadow-2xl">
            <h2 className="mb-1 text-lg font-bold text-white">Costo del producto</h2>
            <p className="mb-1 text-sm text-zinc-400">
              SKU <span className="font-mono text-zinc-200">{edit.sku || "—"}</span>
            </p>
            <p className="mb-4 line-clamp-2 text-xs text-zinc-500">{edit.title}</p>
            <label className="mb-1 block text-xs font-medium text-zinc-500">Costo unitario (pesos)</label>
            <input type="number" min={0} step="0.01" value={editValue} onChange={(e) => setEditValue(e.target.value)} className="field" autoFocus placeholder="0" />
            <p className="mt-2 text-xs text-zinc-500">Pisa al costo de Odoo para este SKU en todas las órdenes.</p>
            {editError && <p className="mt-2 text-xs text-red-400">{editError}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setEdit(null)} disabled={editLoading} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-zinc-300 transition hover:bg-white/5">Cancelar</button>
              <button onClick={saveEdit} disabled={editLoading} className="brand-gradient brand-glow rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60">
                {editLoading ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Subcomponentes ----------
function FragmentRow({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-teal-400">{label}</div>
      <div className="space-y-0.5 text-sm">{children}</div>
    </section>
  );
}

function DetailRow({ label, value, tone, strong }: { label: string; value: string; tone?: "red" | "green"; strong?: boolean }) {
  const color = tone === "red" ? "text-red-400" : tone === "green" ? "text-emerald-400" : "text-zinc-100";
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-zinc-400">{label}</span>
      <span className={`tabular-nums ${strong ? "font-bold" : "font-medium"} ${color}`}>{value}</span>
    </div>
  );
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
    <div>
      <div className="text-xs text-zinc-500">{label}</div>
      <div className={`${big ? "text-xl" : "text-lg"} font-bold tabular-nums ${color}`}>{value}</div>
    </div>
  );
}

function Toggle({ label, on, onClick, accent = "indigo" }: { label: string; on: boolean; onClick: () => void; accent?: "indigo" | "amber" | "teal" }) {
  const onCls =
    accent === "amber" ? "border-amber-400/40 bg-amber-500/15 text-amber-200"
    : accent === "teal" ? "border-teal-400/40 bg-teal-500/15 text-teal-200"
    : "border-indigo-400/40 bg-indigo-500/15 text-indigo-100";
  return (
    <button onClick={onClick} className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${on ? onCls : "border-white/10 bg-white/5 text-zinc-400 hover:bg-white/10"}`}>
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

function TipoBadges({ o }: { o: ApiOrder }) {
  const badges: { label: string; cls: string }[] = [];
  const lt = o.logisticType;
  if (lt === "self_service") badges.push({ label: "Flex", cls: "bg-sky-500/15 text-sky-200" });
  else if (lt === "fulfillment") badges.push({ label: "Full", cls: "bg-teal-500/15 text-teal-200" });
  else if (lt) badges.push({ label: lt.replace(/_/g, " "), cls: "bg-white/5 text-zinc-300" });
  // Heurística: si el vendedor pagó envío → gratis para el comprador; si no, pago.
  if (o.shipCost && o.shipCost > 0) badges.push({ label: "Pago", cls: "bg-amber-500/15 text-amber-200" });
  else if (lt) badges.push({ label: "Gratis", cls: "bg-emerald-500/15 text-emerald-200" });
  if (badges.length === 0) return <span className="text-xs text-zinc-600">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {badges.map((b, i) => (
        <span key={i} className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${b.cls}`}>{b.label}</span>
      ))}
    </div>
  );
}
