"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { upload as uploadToBlob } from "@vercel/blob/client";
import { landedCost, type Origin } from "@/lib/cost";
import { fmtCBM, fmtInt, fmtUSD } from "@/lib/format";
import { agregarLineas, calcularLineas, montoLinea } from "@/lib/productEdit";
import type { DetalleLinea, ProductRow } from "./ProductTable";

interface LineDraft {
  codigos: string;
  unidades: string;
  precioChina: string;
  cbmTotal: number | null;
  remark: string;
}

function vacia(): LineDraft {
  return { codigos: "", unidades: "", precioChina: "", cbmTotal: null, remark: "" };
}

function toDrafts(detalle: DetalleLinea[] | null): LineDraft[] {
  const lines = detalle ?? [];
  if (lines.length === 0) return [vacia()];
  return lines.map((l) => ({
    codigos: (l.codigos ?? []).join(" / "),
    unidades: l.unidades != null ? String(l.unidades) : "",
    precioChina: l.precioChina != null ? String(l.precioChina) : "",
    cbmTotal: l.cbmTotal ?? null,
    remark: l.remark ?? "",
  }));
}

function num(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export default function EditProductButton({
  product,
  origin,
  freightCost,
}: {
  product: ProductRow;
  origin: Origin;
  freightCost: number | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [codigo, setCodigo] = useState(product.codigo ?? "");
  const [remark, setRemark] = useState(product.remark ?? "");
  const [cbmU, setCbmU] = useState("");
  const [photo, setPhoto] = useState<string | null>(product.photo);
  const [lines, setLines] = useState<LineDraft[]>(() => toDrafts(product.detalle));
  const [loading, setLoading] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** CBM por unidad actual, que es lo que muestra la tabla. */
  function cbmUnidadActual(): string {
    if (product.cbmUnitario == null || !product.cantidadPorCaja) return "";
    return String(+(product.cbmUnitario / product.cantidadPorCaja).toFixed(6));
  }

  function openModal() {
    setCodigo(product.codigo ?? "");
    setRemark(product.remark ?? "");
    setCbmU(cbmUnidadActual());
    setPhoto(product.photo);
    setLines(toDrafts(product.detalle));
    setError(null);
    setOpen(true);
  }

  function updateLine(i: number, patch: Partial<LineDraft>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  function addLine() {
    setLines((prev) => [...prev, vacia()]);
  }

  function removeLine(i: number) {
    setLines((prev) => prev.filter((_, idx) => idx !== i));
  }

  // Los mismos cálculos que hará el servidor al guardar, para que lo que se ve
  // acá sea exactamente lo que queda grabado.
  const calculado = useMemo(() => {
    const lineas = calcularLineas(
      lines.map((l) => ({
        codigos: l.codigos.split("/").map((s) => s.trim()).filter(Boolean),
        unidades: num(l.unidades) === null ? null : Math.round(num(l.unidades)!),
        precioChina: num(l.precioChina),
        cbmTotal: l.cbmTotal,
        remark: l.remark.trim() || null,
      })),
    );
    const ag = agregarLineas(lineas);
    const lc = landedCost(origin, ag.precioChina, num(cbmU), freightCost);
    return { lineas, ag, lc };
  }, [lines, cbmU, origin, freightCost]);

  async function elegirFoto(file: File) {
    setSubiendo(true);
    setError(null);
    try {
      const blob = await uploadToBlob(`producto-${product.id}-${Date.now()}-${file.name}`, file, {
        access: "public",
        handleUploadUrl: "/api/blob/upload",
        contentType: file.type,
      });
      setPhoto(blob.url);
    } catch {
      setError("No se pudo subir la foto. Reintentá.");
    } finally {
      setSubiendo(false);
    }
  }

  async function save() {
    setLoading(true);
    setError(null);
    try {
      const detalle = calculado.lineas.map((l) => ({
        codigos: l.codigos,
        unidades: l.unidades,
        precioChina: l.precioChina,
        cbmTotal: l.cbmTotal,
        remark: l.remark,
      }));
      const res = await fetch(`/api/products/${product.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          codigo: codigo.trim() || null,
          remark: remark.trim() || null,
          photo,
          cbmPorUnidad: num(cbmU),
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
          <div className="animate-in card relative flex max-h-[88vh] w-full max-w-2xl flex-col border-white/10 p-6 shadow-2xl">
            <h2 className="mb-1 text-lg font-bold text-white">Editar producto</h2>
            <p className="mb-4 text-sm text-zinc-400">
              El precio del lote y el costo final se calculan solos a partir de las líneas.
            </p>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
              {/* Foto + datos de cabecera */}
              <div className="flex gap-4">
                <div className="shrink-0">
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-400">
                    Foto
                  </label>
                  <div className="relative h-24 w-24 overflow-hidden rounded-xl border border-white/10 bg-white/5">
                    {photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={photo} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[10px] text-zinc-500">
                        Sin foto
                      </div>
                    )}
                    {subiendo && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-[10px] text-white">
                        Subiendo…
                      </div>
                    )}
                  </div>
                  <div className="mt-1.5 flex gap-1.5">
                    <label className="cursor-pointer rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[11px] font-semibold text-teal-300 transition hover:bg-white/10">
                      Cambiar
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) elegirFoto(f);
                          e.target.value = "";
                        }}
                      />
                    </label>
                    {photo && (
                      <button
                        onClick={() => setPhoto(null)}
                        className="rounded-lg px-2 py-1 text-[11px] font-medium text-red-400 transition hover:bg-red-500/10"
                      >
                        Quitar
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex-1 space-y-3">
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
                      CBM por unidad
                    </label>
                    <input
                      type="number"
                      step="0.000001"
                      value={cbmU}
                      onChange={(e) => setCbmU(e.target.value)}
                      placeholder="Ej: 0.0293"
                      className="field"
                    />
                    <p className="mt-1 text-[11px] text-zinc-500">
                      Entra al costo final junto con el flete del embarque.
                    </p>
                  </div>
                </div>
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

              {/* Detalle por línea */}
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
                  {lines.map((l, i) => {
                    const lote = montoLinea(
                      num(l.unidades) === null ? null : Math.round(num(l.unidades)!),
                      num(l.precioChina),
                    );
                    return (
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
                          <div className="grid grid-cols-3 gap-2">
                            <div>
                              <span className="mb-1 block text-[10px] uppercase tracking-wide text-zinc-500">
                                Unidades
                              </span>
                              <input
                                type="number"
                                value={l.unidades}
                                onChange={(e) => updateLine(i, { unidades: e.target.value })}
                                className="field !py-2 text-sm"
                              />
                            </div>
                            <div>
                              <span className="mb-1 block text-[10px] uppercase tracking-wide text-zinc-500">
                                Precio China
                              </span>
                              <input
                                type="number"
                                step="0.0001"
                                value={l.precioChina}
                                onChange={(e) => updateLine(i, { precioChina: e.target.value })}
                                className="field !py-2 text-sm"
                              />
                            </div>
                            <div>
                              <span className="mb-1 block text-[10px] uppercase tracking-wide text-zinc-500">
                                Precio lote
                              </span>
                              <div className="rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2 text-sm tabular-nums text-zinc-300">
                                {lote === null ? "—" : fmtUSD(lote)}
                              </div>
                            </div>
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
                    );
                  })}
                </div>
              </div>

              {/* Totales calculados */}
              <div className="rounded-xl border border-teal-500/20 bg-teal-500/[0.06] p-3">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-teal-300">
                  Calculado
                </p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-4">
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-zinc-500">Unidades</div>
                    <div className="tabular-nums text-white">
                      {calculado.ag.unidades === null ? "—" : fmtInt(calculado.ag.unidades)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-zinc-500">Precio lote</div>
                    <div className="tabular-nums text-white">
                      {calculado.ag.montoTotal === null ? "—" : fmtUSD(calculado.ag.montoTotal)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-zinc-500">CBM total</div>
                    <div className="tabular-nums text-white">
                      {calculado.ag.cbmTotal === null ? "—" : fmtCBM(calculado.ag.cbmTotal)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-zinc-500">Costo final /u</div>
                    <div className="tabular-nums font-bold text-teal-200">
                      {calculado.lc ? fmtUSD(calculado.lc.final) : "—"}
                    </div>
                  </div>
                </div>
                {!calculado.lc && (
                  <p className="mt-2 text-[11px] text-amber-300/80">
                    Falta el precio de origen{origin === "china" ? ", el CBM por unidad o el flete del embarque" : ""} para calcular el costo final.
                  </p>
                )}
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
                disabled={loading || subiendo}
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
