"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { DetalleLinea, ProductRow } from "./ProductTable";

interface LineDraft {
  codigos: string;
  unidades: string;
  monto: string;
  remark: string;
  cbmTotal: number | null;
  precioChina: number | null;
}

function toDrafts(detalle: DetalleLinea[] | null): LineDraft[] {
  const lines = detalle ?? [];
  if (lines.length === 0) {
    return [{ codigos: "", unidades: "", monto: "", remark: "", cbmTotal: null, precioChina: null }];
  }
  return lines.map((l) => ({
    codigos: (l.codigos ?? []).join(" / "),
    unidades: l.unidades != null ? String(l.unidades) : "",
    monto: l.monto != null ? String(l.monto) : "",
    remark: l.remark ?? "",
    cbmTotal: l.cbmTotal ?? null,
    precioChina: l.precioChina ?? null,
  }));
}

export default function EditProductButton({ product }: { product: ProductRow }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [codigo, setCodigo] = useState(product.codigo ?? "");
  const [remark, setRemark] = useState(product.remark ?? "");
  const [lines, setLines] = useState<LineDraft[]>(() => toDrafts(product.detalle));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openModal() {
    setCodigo(product.codigo ?? "");
    setRemark(product.remark ?? "");
    setLines(toDrafts(product.detalle));
    setError(null);
    setOpen(true);
  }

  function updateLine(i: number, patch: Partial<LineDraft>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  function addLine() {
    setLines((prev) => [
      ...prev,
      { codigos: "", unidades: "", monto: "", remark: "", cbmTotal: null, precioChina: null },
    ]);
  }

  function removeLine(i: number) {
    setLines((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function save() {
    setLoading(true);
    setError(null);
    try {
      const detalle: DetalleLinea[] = lines.map((l) => ({
        codigos: l.codigos.split("/").map((s) => s.trim()).filter(Boolean),
        unidades: l.unidades === "" ? null : Math.round(Number(l.unidades)),
        monto: l.monto === "" ? null : Number(l.monto),
        cbmTotal: l.cbmTotal,
        precioChina: l.precioChina,
        remark: l.remark.trim() || null,
      }));
      const res = await fetch(`/api/products/${product.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          codigo: codigo.trim() || null,
          remark: remark.trim() || null,
          detalle,
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setError(j.error ?? "No se pudo guardar.");
        return;
      }
      setOpen(false);
      router.refresh();
    } catch {
      setError("Error de conexión. Reintentá.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={(e) => {
          e.stopPropagation();
          openModal();
        }}
        title="Editar producto"
        className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-white/10 bg-white/5 text-zinc-400 transition hover:bg-white/10 hover:text-white"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
          <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => !loading && setOpen(false)}
          />
          <div className="animate-in card relative flex max-h-[88vh] w-full max-w-lg flex-col border-white/10 p-6 shadow-2xl">
            <h2 className="mb-1 text-lg font-bold text-white">Editar producto</h2>
            <p className="mb-4 text-sm text-zinc-400">
              El costo final no cambia: se calcula con el precio unitario y el CBM.
            </p>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  Código
                </label>
                <input
                  value={codigo}
                  onChange={(e) => setCodigo(e.target.value)}
                  placeholder="Ej: 48108"
                  className="field"
                  autoFocus
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  Observaciones
                </label>
                <textarea
                  value={remark}
                  onChange={(e) => setRemark(e.target.value)}
                  rows={2}
                  placeholder="Notas del producto…"
                  className="field resize-y"
                />
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                    Detalle por línea
                  </label>
                  <button
                    onClick={addLine}
                    className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-semibold text-teal-300 transition hover:bg-white/10"
                  >
                    + Agregar línea
                  </button>
                </div>

                <div className="space-y-3">
                  {lines.map((l, i) => (
                    <div key={i} className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-xs font-medium text-zinc-500">Línea {i + 1}</span>
                        {lines.length > 1 && (
                          <button
                            onClick={() => removeLine(i)}
                            className="rounded-md px-1.5 py-0.5 text-xs font-medium text-red-400 transition hover:bg-red-500/10"
                          >
                            Quitar
                          </button>
                        )}
                      </div>
                      <div className="space-y-2">
                        <input
                          value={l.codigos}
                          onChange={(e) => updateLine(i, { codigos: e.target.value })}
                          placeholder="Códigos (separá con /)"
                          className="field !py-2 text-sm"
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="number"
                            value={l.unidades}
                            onChange={(e) => updateLine(i, { unidades: e.target.value })}
                            placeholder="Unidades"
                            className="field !py-2 text-sm"
                          />
                          <input
                            type="number"
                            step="0.01"
                            value={l.monto}
                            onChange={(e) => updateLine(i, { monto: e.target.value })}
                            placeholder="Monto (US$)"
                            className="field !py-2 text-sm"
                          />
                        </div>
                        <textarea
                          value={l.remark}
                          onChange={(e) => updateLine(i, { remark: e.target.value })}
                          rows={2}
                          placeholder="Observación de la línea…"
                          className="field resize-y !py-2 text-sm"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {error && (
              <p className="mt-3 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                {error}
              </p>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setOpen(false)}
                disabled={loading}
                className="rounded-xl px-4 py-2.5 text-sm font-semibold text-zinc-300 transition hover:bg-white/5"
              >
                Cancelar
              </button>
              <button
                onClick={save}
                disabled={loading}
                className="brand-gradient brand-glow rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
              >
                {loading ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
