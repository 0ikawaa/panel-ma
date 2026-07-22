"use client";

import { useMemo, useState } from "react";
import { fmtInt } from "@/lib/format";

export interface ReposRow {
  codigo: string;
  titulo: string | null;
  vendidas: number;
  stock: number | null;
  sugerida: number;
}

type SortKey = "codigo" | "titulo" | "vendidas" | "stock" | "sugerida";

export default function ReposicionTable({ rows, meses }: { rows: ReposRow[]; meses: number }) {
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("sugerida");
  const [asc, setAsc] = useState(false);
  const [soloReponer, setSoloReponer] = useState(false);

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    let arr = rows;
    if (ql) {
      arr = arr.filter(
        (r) =>
          r.codigo.toLowerCase().includes(ql) ||
          (r.titulo ?? "").toLowerCase().includes(ql),
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
  }, [rows, q, sortKey, asc, soloReponer]);

  const totals = useMemo(() => {
    let vendidas = 0;
    let reponer = 0;
    for (const r of filtered) {
      vendidas += r.vendidas;
      reponer += r.sugerida;
    }
    return { vendidas, reponer, items: filtered.length };
  }, [filtered]);

  function toggleSort(k: SortKey) {
    if (sortKey === k) setAsc(!asc);
    else {
      setSortKey(k);
      setAsc(k === "codigo" || k === "titulo");
    }
  }

  function exportCsv() {
    const header = ["Codigo", "Titulo", "Vendidas", "Stock disponible", "Reposicion sugerida"];
    const lines = filtered.map((r) =>
      [
        r.codigo,
        `"${(r.titulo ?? "").replace(/"/g, '""')}"`,
        r.vendidas,
        r.stock ?? "",
        r.sugerida,
      ].join(","),
    );
    const csv = [header.join(","), ...lines].join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "reposicion.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const th = (label: string, k: SortKey, right?: boolean, accent?: boolean) => (
    <th
      key={k}
      onClick={() => toggleSort(k)}
      className={`cursor-pointer select-none whitespace-nowrap px-4 py-3.5 text-xs font-semibold uppercase tracking-wide transition ${
        accent ? "text-teal-300 hover:text-teal-200" : "text-zinc-400 hover:text-white"
      } ${right ? "text-right" : "text-left"}`}
    >
      <span className={`inline-flex items-center gap-1 ${right ? "justify-end" : ""}`}>
        {label}
        {sortKey === k && <span className={accent ? "text-teal-300" : "text-teal-400"}>{asc ? "▲" : "▼"}</span>}
      </span>
    </th>
  );

  const quickSort = (k: SortKey) => {
    setSortKey(k);
    setAsc(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-500">
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por código o título…"
            className="field !pl-11"
          />
        </div>

        {/* Orden rápido */}
        <div className="inline-flex overflow-hidden rounded-xl border border-white/10 bg-white/[0.02]">
          <button
            onClick={() => quickSort("sugerida")}
            className={`px-3.5 py-2.5 text-sm font-semibold transition ${
              sortKey === "sugerida" ? "bg-teal-500/15 text-teal-200" : "text-zinc-400 hover:bg-white/5"
            }`}
          >
            Más a reponer
          </button>
          <button
            onClick={() => quickSort("vendidas")}
            className={`border-l border-white/10 px-3.5 py-2.5 text-sm font-semibold transition ${
              sortKey === "vendidas" ? "bg-teal-500/15 text-teal-200" : "text-zinc-400 hover:bg-white/5"
            }`}
          >
            Más vendidos
          </button>
        </div>

        <button
          onClick={() => setSoloReponer((v) => !v)}
          className={`rounded-xl border px-3.5 py-2.5 text-sm font-semibold transition ${
            soloReponer
              ? "border-teal-500/40 bg-teal-500/15 text-teal-200"
              : "border-white/10 bg-white/[0.02] text-zinc-400 hover:bg-white/5"
          }`}
        >
          Solo con reposición
        </button>
        <button
          onClick={exportCsv}
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm font-semibold text-zinc-200 transition hover:bg-white/10"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
            <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 21h16" />
          </svg>
          Exportar CSV
        </button>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full table-fixed border-collapse text-sm">
          <colgroup>
            <col className="w-[110px]" />
            <col />
            <col className="w-[110px]" />
            <col className="w-[120px]" />
            <col className="w-[130px]" />
          </colgroup>
          <thead className="border-b border-white/10 bg-white/[0.03]">
            <tr>
              {th("Código", "codigo")}
              {th("Título", "titulo")}
              {th("Vendidas", "vendidas", true)}
              {th("Stock disp.", "stock", true)}
              {th(`Reponer (${meses}m)`, "sugerida", true, true)}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {filtered.map((r) => (
              <tr key={r.codigo} className="transition hover:bg-white/[0.03]">
                <td className="px-4 py-3 font-mono font-medium text-zinc-100">{r.codigo}</td>
                <td className="truncate px-4 py-3 text-zinc-300" title={r.titulo ?? ""}>
                  {r.titulo ?? <span className="text-zinc-600">—</span>}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-zinc-200">{fmtInt(r.vendidas)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-zinc-300">
                  {r.stock === null ? <span className="text-zinc-600">—</span> : fmtInt(r.stock)}
                </td>
                <td className="px-4 py-3 text-right font-bold tabular-nums">
                  {r.sugerida > 0 ? (
                    <span className="text-teal-300">{fmtInt(r.sugerida)}</span>
                  ) : (
                    <span className="text-zinc-600">0</span>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sm text-zinc-500">
                  No hay resultados.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-white/10 bg-white/[0.03] font-semibold text-white">
              <td className="px-4 py-3.5" colSpan={2}>
                {fmtInt(totals.items)} códigos
              </td>
              <td className="px-4 py-3.5 text-right tabular-nums">{fmtInt(totals.vendidas)}</td>
              <td className="px-4 py-3.5 text-right text-xs uppercase tracking-wide text-zinc-500">Total</td>
              <td className="px-4 py-3.5 text-right tabular-nums text-teal-300">{fmtInt(totals.reponer)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
