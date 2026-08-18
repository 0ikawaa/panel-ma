"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface DestinoEmbarque {
  id: string;
  name: string;
}

/**
 * Barra flotante para mover los ítems tildados a otro embarque.
 *
 * Aparece sola cuando hay algo seleccionado en la tabla del embarque. Mover
 * conserva la fila del ítem —foto, detalle por línea, CBM—, a diferencia de
 * borrarlo y volver a cargarlo del otro lado.
 */
export default function MoveProductsBar({
  ids,
  destinos,
  onClear,
  onMoved,
}: {
  ids: string[];
  destinos: DestinoEmbarque[];
  onClear: () => void;
  onMoved: () => void;
}) {
  const router = useRouter();
  const [destino, setDestino] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (ids.length === 0) return null;

  async function mover() {
    if (!destino || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/products/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, containerId: destino }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(j.error ?? "No se pudieron mover los ítems.");
        return;
      }
      setDestino("");
      onMoved();
      router.refresh();
    } catch {
      setError("Error de conexión. Reintentá.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
      <div className="animate-in pointer-events-auto w-full max-w-3xl rounded-2xl border border-white/10 bg-[var(--surface)]/95 p-3 shadow-2xl backdrop-blur">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-teal-500/15 px-3 py-1 text-sm font-bold text-teal-300">
            {ids.length} ítem{ids.length > 1 ? "s" : ""}
          </span>
          <span className="hidden text-sm text-zinc-400 sm:inline">mover a</span>

          <select
            value={destino}
            onChange={(e) => {
              setDestino(e.target.value);
              setError(null); // elegir otro destino deja atrás el error anterior
            }}
            disabled={loading}
            className="field !w-auto min-w-0 flex-1 !py-2 text-sm sm:flex-none sm:min-w-56"
            aria-label="Embarque de destino"
          >
            <option value="">Elegí el embarque…</option>
            {destinos.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>

          <button
            onClick={mover}
            disabled={!destino || loading}
            className="brand-gradient inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold text-white shadow-lg transition disabled:opacity-50"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
            {loading ? "Moviendo…" : "Mover"}
          </button>

          <button
            onClick={onClear}
            disabled={loading}
            className="ml-auto rounded-xl px-3 py-2 text-sm font-semibold text-zinc-400 transition hover:bg-white/5 hover:text-zinc-200"
          >
            Cancelar
          </button>
        </div>

        {error && (
          <p className="mt-2 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
