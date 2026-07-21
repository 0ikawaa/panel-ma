"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  containerId: string;
  hasProducts: boolean;
}

interface UploadResult {
  totalRows: number;
  photosFound: number;
  columnsDetected: Record<string, string | null>;
  fileName: string;
}

const COL_LABELS: Record<string, string> = {
  foto: "Foto",
  codigo: "Código",
  precioChina: "Precio China",
  cantidadPorCaja: "Cant. por caja",
  cbmUnitario: "CBM unitario",
  cbmTotal: "CBM total",
};

export default function UploadExcel({ containerId, hasProducts }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [showPanel, setShowPanel] = useState(false);

  async function upload(file: File) {
    setLoading(true);
    setError(null);
    setResult(null);
    setShowPanel(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/containers/${containerId}/upload`, {
        method: "POST",
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "No se pudo procesar el archivo");
      } else {
        setResult(data);
        router.refresh();
      }
    } catch {
      setError("Error de conexión al subir el archivo");
    } finally {
      setLoading(false);
    }
  }

  function onFile(files: FileList | null) {
    if (files && files[0]) upload(files[0]);
  }

  return (
    <>
      <button
        onClick={() => setShowPanel(true)}
        className={
          hasProducts
            ? "inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
            : "brand-gradient inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-md transition hover:opacity-95"
        }
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
          <path d="M12 16V4M7 9l5-5 5 5M5 20h14" />
        </svg>
        {hasProducts ? "Reemplazar Excel" : "Subir Excel"}
      </button>

      {showPanel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={() => !loading && setShowPanel(false)}
          />
          <div className="animate-in relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  {hasProducts ? "Reemplazar Excel" : "Subir Excel"}
                </h2>
                <p className="text-sm text-slate-500">
                  Se leerán las columnas y se extraerán las fotos incrustadas.
                </p>
              </div>
              {!loading && (
                <button
                  onClick={() => setShowPanel(false)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="h-5 w-5">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>

            {hasProducts && !result && !loading && (
              <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-700">
                Este contenedor ya tiene productos cargados. Subir un nuevo Excel
                los reemplazará.
              </div>
            )}

            {!result && (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  if (!loading) onFile(e.dataTransfer.files);
                }}
                onClick={() => !loading && inputRef.current?.click()}
                className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition ${
                  dragging
                    ? "border-indigo-400 bg-indigo-50"
                    : "border-slate-300 bg-slate-50 hover:border-indigo-300 hover:bg-slate-100"
                } ${loading ? "pointer-events-none opacity-70" : ""}`}
              >
                {loading ? (
                  <>
                    <div className="mb-3 h-8 w-8 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
                    <p className="text-sm font-medium text-slate-600">
                      Procesando el Excel y extrayendo fotos…
                    </p>
                  </>
                ) : (
                  <>
                    <div className="brand-gradient mb-3 flex h-12 w-12 items-center justify-center rounded-xl text-white shadow-md">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
                        <path d="M12 16V4M7 9l5-5 5 5M5 20h14" />
                      </svg>
                    </div>
                    <p className="text-sm font-semibold text-slate-700">
                      Arrastrá el archivo acá o hacé clic para elegir
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      Formato .xlsx (con fotos incrustadas en la columna Foto)
                    </p>
                  </>
                )}
                <input
                  ref={inputRef}
                  type="file"
                  accept=".xlsx,.xlsm,.xls"
                  className="hidden"
                  onChange={(e) => onFile(e.target.files)}
                />
              </div>
            )}

            {error && (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
                {error}
              </div>
            )}

            {result && (
              <div className="space-y-4">
                <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500 text-white">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-emerald-800">
                      ¡Excel cargado con éxito!
                    </p>
                    <p className="text-xs text-emerald-700">
                      {result.totalRows} productos · {result.photosFound} fotos
                      detectadas
                    </p>
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Columnas detectadas
                  </p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {Object.entries(COL_LABELS).map(([key, label]) => {
                      const detected = result.columnsDetected[key];
                      return (
                        <div
                          key={key}
                          className="flex items-center gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs"
                        >
                          <span
                            className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                              detected ? "bg-emerald-500" : "bg-slate-300"
                            }`}
                          />
                          <span className="font-medium text-slate-600">
                            {label}
                          </span>
                          <span className="ml-auto truncate text-slate-400">
                            {detected ?? "no encontrada"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <button
                  onClick={() => {
                    setShowPanel(false);
                    setResult(null);
                  }}
                  className="brand-gradient w-full rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-md transition hover:opacity-95"
                >
                  Ver productos
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
