"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NewContainerButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [supplier, setSupplier] = useState("");
  const [eta, setEta] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setName("");
    setSupplier("");
    setEta("");
    setNotes("");
    setError(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/containers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, supplier, eta, notes }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? "No se pudo crear el contenedor");
        setLoading(false);
        return;
      }
      const created = await res.json();
      setOpen(false);
      reset();
      router.push(`/arribos/${created.id}`);
      router.refresh();
    } catch {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="brand-gradient inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-md transition hover:opacity-95 hover:shadow-lg"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="h-4 w-4">
          <path d="M12 5v14M5 12h14" />
        </svg>
        Nuevo contenedor
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={() => !loading && setOpen(false)}
          />
          <div className="animate-in relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="mb-1 text-lg font-bold text-slate-900">
              Nuevo contenedor
            </h2>
            <p className="mb-5 text-sm text-slate-500">
              Creá el arribo y luego subí el Excel con los productos.
            </p>
            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Nombre <span className="text-red-500">*</span>
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ej: Contenedor 1 · Julio 2026"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-100"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Proveedor
                  </label>
                  <input
                    value={supplier}
                    onChange={(e) => setSupplier(e.target.value)}
                    placeholder="Opcional"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-100"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Fecha estimada
                  </label>
                  <input
                    type="date"
                    value={eta}
                    onChange={(e) => setEta(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-100"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Notas
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Opcional"
                  className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-100"
                />
              </div>

              {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
                  {error}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  disabled={loading}
                  className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-100"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="brand-gradient rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-md transition hover:opacity-95 disabled:opacity-60"
                >
                  {loading ? "Creando…" : "Crear"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
