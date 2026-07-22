"use client";

import { Fragment, useMemo, useState } from "react";
import { fmtCBM, fmtCBM2, fmtInt, fmtUSD } from "@/lib/format";
import { landedCost, cbmPorUnidad, IVA, type Origin } from "@/lib/cost";
import EditProductButton from "./EditProductButton";

export interface DetalleLinea {
  codigos: string[];
  unidades: number | null;
  monto: number | null;
  cbmTotal: number | null;
  precioChina: number | null;
  remark: string | null;
}

export interface ProductRow {
  id: string;
  rowIndex: number;
  photo: string | null;
  codigo: string | null;
  precioChina: number | null;
  cbmUnitario: number | null;
  cantidadPorCaja: number | null;
  unidades: number | null;
  montoTotal: number | null;
  unidad: string | null;
  remark: string | null;
  cbmTotal: number | null;
  detalle: DetalleLinea[] | null;
}

type SortKey = "rowIndex" | "codigo" | "unidades" | "precioChina" | "cbmTotal" | "montoTotal";

function hasDetail(p: ProductRow): boolean {
  const d = p.detalle ?? [];
  return d.length > 1 || !!p.remark || (d[0]?.codigos?.length ?? 0) > 1;
}

export default function ProductTable({
  products,
  freightCost,
  origin,
  canEdit = false,
}: {
  products: ProductRow[];
  freightCost: number | null;
  origin: string;
  canEdit?: boolean;
}) {
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
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
    let unidades = 0;
    let monto = 0;
    for (const p of products) {
      if (p.cbmTotal) cbmTotal += p.cbmTotal;
      if (p.unidades) unidades += p.unidades;
      if (p.montoTotal) monto += p.montoTotal;
    }
    return { cbmTotal, unidades, monto, items: products.length };
  }, [products]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setAsc(!asc);
    else {
      setSortKey(key);
      setAsc(true);
    }
  }

  function toggleRow(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const Header = ({
    label,
    k,
    right,
    accent,
  }: {
    label: string;
    k: SortKey;
    right?: boolean;
    accent?: "red";
  }) => (
    <th
      onClick={() => toggleSort(k)}
      className={`cursor-pointer select-none whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide transition ${
        accent === "red" ? "text-red-300 hover:text-red-200" : "text-zinc-400 hover:text-white"
      } ${right ? "text-right" : "text-left"}`}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {sortKey === k && (
          <span className={accent === "red" ? "text-red-400" : "text-teal-400"}>{asc ? "▲" : "▼"}</span>
        )}
      </span>
    </th>
  );

  return (
    <>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[860px] border-collapse text-sm">
          <thead className="border-b border-white/10 bg-white/[0.03]">
            <tr>
              <th className="w-8 px-2 py-3" />
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Foto
              </th>
              <Header label="Código" k="codigo" />
              <Header label="Unidades" k="unidades" right />
              <Header label="Precio unit." k="precioChina" right accent="red" />
              <th className="whitespace-nowrap px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-zinc-400">
                CBM u.
              </th>
              <Header label="Precio lote" k="montoTotal" right />
              <th className="whitespace-nowrap px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-teal-300">
                Costo final /u
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {sorted.map((p) => {
              const expandable = hasDetail(p);
              const isOpen = expanded.has(p.id);
              const cbmU = cbmPorUnidad(p.cbmUnitario, p.cantidadPorCaja);
              const lc = landedCost(origin as Origin, p.precioChina, cbmU, freightCost);
              return (
                <Fragment key={p.id}>
                  <tr
                    className={`transition ${expandable ? "cursor-pointer hover:bg-white/[0.04]" : "hover:bg-white/[0.02]"}`}
                    onClick={() => expandable && toggleRow(p.id)}
                  >
                    <td className="px-2 py-2.5 text-center">
                      {expandable && (
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2.2}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className={`h-4 w-4 text-zinc-500 transition-transform ${isOpen ? "rotate-90" : ""}`}
                        >
                          <path d="m9 18 6-6-6-6" />
                        </svg>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {p.photo ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setLightbox(p.photo);
                          }}
                          className="group relative block h-14 w-14 overflow-hidden rounded-lg border border-white/10 bg-white/5"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={p.photo}
                            alt={p.codigo ?? "Producto"}
                            loading="lazy"
                            decoding="async"
                            className="h-full w-full object-cover transition group-hover:scale-105"
                          />
                        </button>
                      ) : (
                        <div className="flex h-14 w-14 items-center justify-center rounded-lg border border-dashed border-white/10 bg-white/5 text-zinc-600">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-6 w-6">
                            <path d="M3 5h18v14H3zM3 15l5-5 4 4 3-3 6 6" strokeLinecap="round" strokeLinejoin="round" />
                            <circle cx="8.5" cy="9" r="1.5" />
                          </svg>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2.5 font-medium text-zinc-100">
                      <div className="flex items-center gap-2">
                        <span>{p.codigo ?? <span className="text-zinc-600">—</span>}</span>
                        {expandable && (
                          <span className="rounded-full bg-teal-500/15 px-2 py-0.5 text-[10px] font-semibold text-teal-300">
                            detalle
                          </span>
                        )}
                        {canEdit && <EditProductButton product={p} />}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-white">
                      {fmtInt(p.unidades)}
                      {p.unidad && <span className="ml-1 text-xs text-zinc-500">{p.unidad}</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right font-bold tabular-nums text-red-400">
                      {fmtUSD(p.precioChina)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-zinc-300">
                      {fmtCBM(cbmU)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-zinc-200">
                      {fmtUSD(p.montoTotal)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-bold tabular-nums text-teal-300">
                      {lc ? (
                        fmtUSD(lc.final)
                      ) : (
                        <span className="font-normal text-zinc-600">—</span>
                      )}
                    </td>
                  </tr>

                  {isOpen && expandable && (
                    <tr className="bg-black/20">
                      <td />
                      <td colSpan={7} className="px-4 pb-4 pt-1">
                        <DetallePanel p={p} lc={lc} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-white/10 bg-white/[0.03] font-semibold text-white">
              <td className="px-2 py-3" />
              <td className="px-4 py-3" colSpan={2}>
                {totals.items} ítems
              </td>
              <td className="px-4 py-3 text-right tabular-nums">{fmtInt(totals.unidades)}</td>
              <td className="px-4 py-3 text-right text-zinc-500">Total →</td>
              <td className="px-4 py-3 text-right tabular-nums text-teal-400">{fmtCBM2(totals.cbmTotal)}</td>
              <td className="px-4 py-3 text-right tabular-nums text-zinc-200">{fmtUSD(totals.monto)}</td>
              <td className="px-4 py-3" />
            </tr>
          </tfoot>
        </table>
      </div>

      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-6 backdrop-blur-sm"
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

function DetallePanel({
  p,
  lc,
}: {
  p: ProductRow;
  lc: ReturnType<typeof landedCost>;
}) {
  const lineas = p.detalle ?? [];
  return (
    <div className="animate-in space-y-4 rounded-xl border border-white/10 bg-white/[0.02] p-4">
      {lc && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-teal-300">
            Costo final por unidad (nacionalizado, IVA inc.)
          </p>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-zinc-300">
            {lc.origin === "brasil" ? (
              <>
                <span>Precio origen {fmtUSD(lc.fob)}</span>
                <span className="text-zinc-600">×{lc.incidencia} (nac.)</span>
                <span className="text-zinc-600">×{IVA} (IVA)</span>
              </>
            ) : (
              <>
                <span>FOB {fmtUSD(lc.fob)}</span>
                <span className="text-zinc-600">+</span>
                <span>flete {fmtUSD(lc.fleteUnitario)}</span>
                <span className="text-zinc-600">→</span>
                <span>{fmtUSD(lc.base)}</span>
                <span className="text-zinc-600">×{lc.incidencia} (nac.)</span>
                <span className="text-zinc-600">×{IVA} (IVA)</span>
              </>
            )}
            <span className="text-zinc-600">=</span>
            <span className="rounded-md bg-teal-500/15 px-2 py-0.5 font-bold text-teal-200">
              {fmtUSD(lc.final)}
            </span>
          </div>
        </div>
      )}

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Detalle por talle / variante
        </p>
        <div className="space-y-3">
          {lineas.map((l, i) => (
            <div key={i} className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <div className="flex flex-wrap gap-1.5">
                  {l.codigos.map((c, j) => (
                    <span
                      key={j}
                      className="rounded-md bg-teal-500/15 px-2 py-0.5 text-xs font-medium text-teal-200"
                    >
                      {c}
                    </span>
                  ))}
                </div>
                <div className="ml-auto flex items-center gap-4 text-xs text-zinc-400">
                  {l.unidades !== null && (
                    <span>
                      <span className="font-semibold text-white">{fmtInt(l.unidades)}</span> u.
                    </span>
                  )}
                  {l.monto !== null && <span className="text-zinc-300">{fmtUSD(l.monto)}</span>}
                </div>
              </div>
              {l.remark && (
                <p className="mt-2 whitespace-pre-line border-t border-white/5 pt-2 text-xs leading-relaxed text-zinc-300">
                  {l.remark}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
