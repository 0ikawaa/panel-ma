"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DeleteContainerButton({
  containerId,
  containerName,
}: {
  containerId: string;
  containerName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onDelete() {
    setLoading(true);
    try {
      await fetch(`/api/containers/${containerId}`, { method: "DELETE" });
      router.push("/arribos");
      router.refresh();
    } catch {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm font-semibold text-zinc-400 transition hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-400"
        aria-label="Eliminar contenedor"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
          <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M10 11v6M14 11v6" />
        </svg>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => !loading && setOpen(false)}
          />
          <div className="animate-in card relative w-full max-w-sm border-white/10 p-6 shadow-2xl">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-500/15 text-red-400">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
                <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-white">
              Eliminar contenedor
            </h2>
            <p className="mt-1 text-sm text-zinc-400">
              ¿Seguro que querés eliminar{" "}
              <span className="font-semibold text-zinc-200">
                {containerName}
              </span>
              ? Se borrarán todos sus productos y fotos. Esta acción no se puede
              deshacer.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setOpen(false)}
                disabled={loading}
                className="rounded-xl px-4 py-2.5 text-sm font-semibold text-zinc-300 transition hover:bg-white/5"
              >
                Cancelar
              </button>
              <button
                onClick={onDelete}
                disabled={loading}
                className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:bg-red-500 disabled:opacity-60"
              >
                {loading ? "Eliminando…" : "Eliminar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
