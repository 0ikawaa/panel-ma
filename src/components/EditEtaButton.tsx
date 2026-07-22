"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

function toInputDate(d: string | null): string {
  if (!d) return "";
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? "" : dt.toISOString().slice(0, 10);
}

export default function EditEtaButton({
  containerId,
  eta,
}: {
  containerId: string;
  eta: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(toInputDate(eta));
  const [loading, setLoading] = useState(false);

  async function save() {
    setLoading(true);
    try {
      await fetch(`/api/containers/${containerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eta: value || null }),
      });
      setOpen(false);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={() => {
          setValue(toInputDate(eta));
          setOpen(true);
        }}
        className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-semibold text-zinc-200 transition hover:bg-white/10"
        aria-label="Editar fecha de arribo"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
          <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
        Editar
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => !loading && setOpen(false)}
          />
          <div className="animate-in card relative w-full max-w-sm border-white/10 p-6 shadow-2xl">
            <h2 className="mb-1 text-lg font-bold text-white">Fecha de arribo</h2>
            <p className="mb-4 text-sm text-zinc-400">
              Actualizá la fecha estimada de llegada del contenedor.
            </p>
            <input
              type="date"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="field"
              autoFocus
            />
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
