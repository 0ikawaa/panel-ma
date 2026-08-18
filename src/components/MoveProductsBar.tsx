"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { fmtFecha } from "@/lib/fecha";
import { estadoEfectivo, estadoLabel, type Estado } from "@/lib/embarques";

export interface DestinoEmbarque {
  id: string;
  name: string;
  supplier: string | null;
  /** ISO: a un componente de cliente no le llegan Date. */
  eta: string | null;
  status: string;
  receivedAt: string | null;
}

/** Mismo color por etapa que el tablero de embarques. */
const PUNTO: Record<Estado, string> = {
  produccion: "bg-zinc-400",
  embarcado: "bg-sky-400",
  transito: "bg-indigo-400",
  aduana: "bg-amber-400",
  deposito: "bg-emerald-400",
};

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
  const [destino, setDestino] = useState<DestinoEmbarque | null>(null);
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
        body: JSON.stringify({ ids, containerId: destino.id }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(j.error ?? "No se pudieron mover los ítems.");
        return;
      }
      setDestino(null);
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

          <SelectorDeEmbarque
            destinos={destinos}
            valor={destino}
            disabled={loading}
            onChange={(d) => {
              setDestino(d);
              setError(null); // elegir otro destino deja atrás el error anterior
            }}
          />

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

/**
 * Desplegable de embarques con la pinta del panel.
 *
 * No es un `<select>`: la lista desplegada de uno la dibuja el navegador y
 * queda blanca y apretada contra el resto de la app. Acá cada embarque entra
 * con su etapa, su proveedor y su ETA, que es lo que hace falta para no
 * mandar los ítems al contenedor equivocado.
 */
function SelectorDeEmbarque({
  destinos,
  valor,
  disabled,
  onChange,
}: {
  destinos: DestinoEmbarque[];
  valor: DestinoEmbarque | null;
  disabled?: boolean;
  onChange: (d: DestinoEmbarque) => void;
}) {
  const [open, setOpen] = useState(false);
  const caja = useRef<HTMLDivElement>(null);

  // Cerrar al hacer click afuera o con Escape, como el resto de los paneles.
  useEffect(() => {
    if (!open) return;
    function fuera(e: MouseEvent) {
      if (!caja.current?.contains(e.target as Node)) setOpen(false);
    }
    function tecla(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("keydown", tecla);
    };
  }, [open]);

  return (
    <div ref={caja} className="relative min-w-0 flex-1 sm:flex-none">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm transition disabled:opacity-50 sm:w-64 ${
          open
            ? "border-teal-400/50 bg-white/[0.06]"
            : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
        }`}
      >
        {valor ? (
          <>
            <span className={`h-2 w-2 shrink-0 rounded-full ${PUNTO[estadoEfectivo(valor)]}`} />
            <span className="min-w-0 flex-1 truncate font-semibold text-white">{valor.name}</span>
          </>
        ) : (
          <span className="min-w-0 flex-1 truncate text-zinc-400">Elegí el embarque…</span>
        )}
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`h-4 w-4 shrink-0 text-zinc-500 transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        // Se abre para arriba: la barra vive pegada al borde de abajo.
        <ul
          role="listbox"
          className="animate-in absolute bottom-full left-0 z-10 mb-2 max-h-72 w-[min(20rem,calc(100vw-2.5rem))] overflow-y-auto rounded-xl border border-white/10 bg-[var(--surface-2)] p-1 shadow-2xl sm:w-80"
        >
          {destinos.map((d) => {
            const estado = estadoEfectivo(d);
            const elegido = valor?.id === d.id;
            return (
              <li key={d.id} role="option" aria-selected={elegido}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(d);
                    setOpen(false);
                  }}
                  className={`flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition ${
                    elegido ? "bg-teal-500/15" : "hover:bg-white/[0.06]"
                  }`}
                >
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${PUNTO[estado]}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-white">
                      {d.name}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-zinc-500">
                      {estadoLabel(estado)}
                      {d.supplier ? ` · ${d.supplier}` : ""}
                      {d.eta ? ` · ${fmtFecha(d.eta)}` : ""}
                    </span>
                  </span>
                  {elegido && (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 h-4 w-4 shrink-0 text-teal-300">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
