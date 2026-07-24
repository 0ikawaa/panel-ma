"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { fmtDate, fmtUSD } from "@/lib/format";
import ContainerDocs, { type Doc } from "@/components/ContainerDocs";
import { ESTADOS, estadoLabel, faltantes, type Estado } from "@/lib/embarques";

export interface BoardContainer {
  id: string;
  name: string;
  supplier: string | null;
  eta: string | null;
  totalPrice: number | null;
  origin: string;
  status: Estado;
  items: number;
  docs: Doc[];
}

// Color de cada columna: acompaña el avance del embarque.
const TONO: Record<Estado, { dot: string; head: string; ring: string }> = {
  produccion: { dot: "bg-zinc-400", head: "text-zinc-300", ring: "border-white/10" },
  embarcado: { dot: "bg-sky-400", head: "text-sky-300", ring: "border-sky-500/25" },
  transito: { dot: "bg-indigo-400", head: "text-indigo-300", ring: "border-indigo-500/25" },
  aduana: { dot: "bg-amber-400", head: "text-amber-300", ring: "border-amber-500/25" },
  deposito: { dot: "bg-emerald-400", head: "text-emerald-300", ring: "border-emerald-500/25" },
};

export default function EmbarquesBoard({ initial }: { initial: BoardContainer[] }) {
  const [items, setItems] = useState<BoardContainer[]>(initial);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<Estado | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const abierto = items.find((c) => c.id === openId) ?? null;

  // Embarques a los que les falta documentación obligatoria para su etapa.
  const conFaltantes = useMemo(
    () =>
      items
        .map((c) => ({ c, faltan: faltantes(c.status, c.docs.map((d) => d.type)) }))
        .filter((x) => x.faltan.length > 0),
    [items],
  );

  async function mover(id: string, status: Estado) {
    const previo = items;
    setItems((list) => list.map((c) => (c.id === id ? { ...c, status } : c)));
    setError(null);
    try {
      const res = await fetch(`/api/containers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || `Error ${res.status}`);
      }
    } catch (e) {
      setItems(previo); // revertir el movimiento optimista
      setError((e as Error).message || "No se pudo mover el embarque.");
    }
  }

  function setDocs(id: string, docs: Doc[]) {
    setItems((list) => list.map((c) => (c.id === id ? { ...c, docs } : c)));
  }

  function onDrop(e: React.DragEvent, col: Estado) {
    e.preventDefault();
    setOverCol(null);
    const id = e.dataTransfer.getData("text/plain") || dragId;
    setDragId(null);
    if (!id) return;
    const actual = items.find((c) => c.id === id);
    if (!actual || actual.status === col) return;
    mover(id, col);
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-xl border border-red-500/25 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Alerta global de documentación faltante */}
      {conFaltantes.length > 0 && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-amber-300">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0">
              <path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
            </svg>
            {conFaltantes.length} embarque{conFaltantes.length > 1 ? "s" : ""} con
            documentación incompleta
          </p>
          <ul className="mt-2 space-y-1 text-sm text-amber-200/90">
            {conFaltantes.map(({ c, faltan }) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setOpenId(c.id)}
                  className="font-semibold underline decoration-amber-400/40 underline-offset-2 transition hover:text-amber-100"
                >
                  {c.name}
                </button>
                <span className="text-amber-200/70">
                  {" "}
                  — falta{faltan.length > 1 ? "n" : ""}{" "}
                  {faltan.map((f) => docLabelShort(f)).join(", ")} ({estadoLabel(c.status)})
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Tablero */}
      <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-3">
        {ESTADOS.map((col) => {
          const enCol = items.filter((c) => c.status === col.key);
          const activa = overCol === col.key;
          return (
            <div
              key={col.key}
              onDragOver={(e) => {
                e.preventDefault();
                setOverCol(col.key);
              }}
              onDragLeave={() => setOverCol((v) => (v === col.key ? null : v))}
              onDrop={(e) => onDrop(e, col.key)}
              className={`flex w-72 shrink-0 flex-col rounded-2xl border p-2.5 transition ${
                activa
                  ? "border-teal-400/50 bg-teal-500/[0.07]"
                  : "border-white/10 bg-white/[0.02]"
              }`}
            >
              <div className="mb-2 flex items-center gap-2 px-1.5 pt-1">
                <span className={`h-2 w-2 rounded-full ${TONO[col.key].dot}`} />
                <h3 className={`text-sm font-bold ${TONO[col.key].head}`}>{col.label}</h3>
                <span className="ml-auto rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-bold tabular-nums text-zinc-300">
                  {enCol.length}
                </span>
              </div>
              <p className="mb-2 px-1.5 text-[11px] leading-snug text-zinc-500">{col.hint}</p>

              <div className="flex min-h-24 flex-1 flex-col gap-2">
                {enCol.map((c) => {
                  const faltan = faltantes(c.status, c.docs.map((d) => d.type));
                  return (
                    <article
                      key={c.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", c.id);
                        e.dataTransfer.effectAllowed = "move";
                        setDragId(c.id);
                      }}
                      onDragEnd={() => setDragId(null)}
                      onClick={() => setOpenId(c.id)}
                      className={`card card-hover cursor-pointer p-3 ${
                        dragId === c.id ? "opacity-40" : ""
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <h4 className="min-w-0 flex-1 truncate text-sm font-bold text-white">
                          {c.name}
                        </h4>
                        {c.origin === "brasil" && (
                          <span className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-300">
                            BR
                          </span>
                        )}
                      </div>
                      {c.supplier && (
                        <p className="mt-0.5 truncate text-xs text-zinc-500">{c.supplier}</p>
                      )}

                      <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                        <span className="text-zinc-400">{c.eta ? fmtDate(c.eta) : "sin ETA"}</span>
                        <span className="font-semibold tabular-nums text-emerald-300">
                          {c.totalPrice != null ? fmtUSD(c.totalPrice) : "—"}
                        </span>
                      </div>

                      <div className="mt-2 flex items-center gap-2 border-t border-white/10 pt-2">
                        <span
                          className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${
                            faltan.length
                              ? "bg-amber-500/15 text-amber-300"
                              : "bg-emerald-500/15 text-emerald-300"
                          }`}
                          title={
                            faltan.length
                              ? `Falta: ${faltan.map(docLabelShort).join(", ")}`
                              : "Documentación al día"
                          }
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
                            <path d="M14 2v6h6" />
                          </svg>
                          {faltan.length ? `faltan ${faltan.length}` : `${c.docs.length} ok`}
                        </span>
                        <span className="ml-auto text-[11px] text-zinc-600">{c.items} ítems</span>
                      </div>
                    </article>
                  );
                })}

                {enCol.length === 0 && (
                  <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-white/10 py-6 text-xs text-zinc-600">
                    Arrastrá un embarque acá
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Panel de detalle */}
      {abierto && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-stretch sm:justify-end">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setOpenId(null)}
          />
          <div className="animate-in relative flex max-h-[90vh] w-full flex-col overflow-y-auto rounded-t-2xl border-t border-white/10 bg-[var(--surface)] p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-2xl sm:h-full sm:max-h-none sm:max-w-md sm:rounded-none sm:border-l sm:border-t-0 sm:p-5">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-lg font-bold text-white">{abierto.name}</h2>
                <p className="mt-0.5 text-sm text-zinc-400">
                  {abierto.supplier ?? "Sin proveedor"} ·{" "}
                  {abierto.eta ? fmtDate(abierto.eta) : "sin ETA"}
                </p>
              </div>
              <button
                onClick={() => setOpenId(null)}
                className="shrink-0 rounded-lg p-1.5 text-zinc-500 transition hover:bg-white/10 hover:text-zinc-200"
                aria-label="Cerrar"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="h-5 w-5">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Cambiar etapa (funciona también en celular, sin arrastrar) */}
            <div className="mb-4">
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Etapa
              </p>
              <div className="flex flex-wrap gap-1.5">
                {ESTADOS.map((e) => {
                  const on = e.key === abierto.status;
                  return (
                    <button
                      key={e.key}
                      type="button"
                      onClick={() => !on && mover(abierto.id, e.key)}
                      className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                        on
                          ? "brand-gradient text-white"
                          : "border border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10"
                      }`}
                    >
                      {e.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mb-4">
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Documentación
              </p>
              <ContainerDocs
                containerId={abierto.id}
                estado={abierto.status}
                docs={abierto.docs}
                onChange={(docs) => setDocs(abierto.id, docs)}
                compact
              />
            </div>

            <Link
              href={`/arribos/${abierto.id}`}
              className="mt-auto inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-zinc-200 transition hover:bg-white/10"
            >
              Ver productos del embarque
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

// Etiqueta corta para los avisos (la larga del BL no entra en una línea).
function docLabelShort(t: string): string {
  const cortos: Record<string, string> = {
    factura: "factura",
    packing: "packing list",
    bl: "BL",
    dua: "DUA",
    seguro: "seguro",
  };
  return cortos[t] ?? t;
}
