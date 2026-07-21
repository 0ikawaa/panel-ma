"use client";

import { useMemo, useState } from "react";
import { fmtCBM, fmtInt, fmtUSD } from "@/lib/format";

export interface ProductRow {
  id: string;
  rowIndex: number;
  photo: string | null;
  codigo: string | null;
  precioChina: number | null;
  cantidadPorCaja: number | null;
  cbmUnitario: number | null;
  cbmTotal: number | null;
}

type SortKey = "rowIndex" | "codigo" | "precioChina" | "cantidadPorCaja" | "cbmUnitario" | "cbmTotal";

export default function ProductTable({ products }: { products: ProductRow[] }) {
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("rowIndex");
  const [asc, setAsc] = useState(true);

  const sorted = useMemo(() => {
    const arr = [...products];
    arr.sort((a, b) => {
      const va = a[sortKey];
      const vb = b[sortKey];
      if (va === null && vb === null) return 0;
      if (va === null) return 1;
      if (vb === null) return -1;
      if (typeof va === "number" && typeof vb === "number") return va - vb;
      return String(va).localeCompare(String(vb), "es", { numeric: true });
    });
    if (!asc) arr.reverse();
    return arr;
  }, [products, sortKey, asc]);

  const totals = useMemo(() => {
    let cbmTotal = 0;
    let items = 0;
    let piezas = 0;
    for (const p of products) {
      if (p.cbmTotal) cbmTotal += p.cbmTotal;
      if (p.cantidadPorCaja) piezas += p.cantidadPorCaja;
      items += 1;
    }
    return { cbmTotal, items, piezas };
  }, [products]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setAsc(!asc);
    else {
      setSortKey(key);
      setAsc(true);
    }
  }

  const Header = ({ label, k, right }: { label: string; k: SortKey; right?: boolean }) => (
    <th
      onClick={() => toggleSort(k)}
      className={`cursor-pointer select-none whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 transition hover:text-slate-800 ${
        right ? "text-right" : "text-left"
      }`}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {sortKey === k && (
          <span className="text-indigo-500">{asc ? "▲" : "▼"}</span>
        )}
      </span>
    </th>
  );

  return (
    <>
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead className="border-b border-slate-200 bg-slate-50/80">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                Foto
              </th>
              <Header label="Código" k="codigo" />
              <Header label="Precio China" k="precioChina" right />
              <Header label="Cant./Caja" k="cantidadPorCaja" right />
              <Header label="CBM unitario" k="cbmUnitario" right />
              <Header label="CBM total" k="cbmTotal" right />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sorted.map((p) => (
              <tr key={p.id} className="transition hover:bg-slate-50/70">
                <td className="px-4 py-2.5">
                  {p.photo ? (
                    <button
                      onClick={() => setLightbox(p.photo)}
                      className="group relative block h-14 w-14 overflow-hidden rounded-lg border border-slate-200 bg-slate-50"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={p.photo}
                        alt={p.codigo ?? "Producto"}
                        className="h-full w-full object-cover transition group-hover:scale-105"
                      />
                    </button>
                  ) : (
                    <div className="flex h-14 w-14 items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 text-slate-300">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-6 w-6">
                        <path d="M3 5h18v14H3zM3 15l5-5 4 4 3-3 6 6" strokeLinecap="round" strokeLinejoin="round" />
                        <circle cx="8.5" cy="9" r="1.5" />
                      </svg>
                    </div>
                  )}
                </td>
                <td className="px-4 py-2.5 font-medium text-slate-800">
                  {p.codigo ?? <span className="text-slate-300">—</span>}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">
                  {fmtUSD(p.precioChina)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">
                  {fmtInt(p.cantidadPorCaja)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">
                  {fmtCBM(p.cbmUnitario)}
                </td>
                <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-slate-900">
                  {fmtCBM(p.cbmTotal)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold text-slate-900">
              <td className="px-4 py-3" colSpan={3}>
                {totals.items} productos
              </td>
              <td className="px-4 py-3 text-right tabular-nums">
                {fmtInt(totals.piezas)}
              </td>
              <td className="px-4 py-3 text-right text-slate-400">Total →</td>
              <td className="px-4 py-3 text-right tabular-nums text-indigo-600">
                {fmtCBM(totals.cbmTotal)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 p-6 backdrop-blur-sm"
          onClick={() => setLightbox(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightbox}
            alt="Producto"
            className="animate-in max-h-[85vh] max-w-[90vw] rounded-2xl object-contain shadow-2xl"
          />
          <button
            onClick={() => setLightbox(null)}
            className="absolute right-6 top-6 rounded-full bg-white/10 p-2 text-white transition hover:bg-white/20"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="h-6 w-6">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
    </>
  );
}
