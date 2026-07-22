"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { upload as uploadToBlob } from "@vercel/blob/client";
import { fmtInt, fmtUSD } from "@/lib/format";

interface Props {
  containerId: string;
  hasProducts: boolean;
}

interface SampleRow {
  codigo: string | null;
  unidades: number | null;
  precioChina: number | null;
  cbmTotal: number | null;
  montoTotal: number | null;
}
interface Validation {
  ok: boolean;
  blocking: string[];
  warnings: string[];
}
interface Report {
  fileName: string;
  totalItems: number;
  photosFound: number;
  containerTotal: number | null;
  columnsDetected: Record<string, string | null>;
  sample: SampleRow[];
  validation: Validation;
}

type Phase = "idle" | "analyzing" | "report" | "saving" | "done" | "error";

// Columnas que mostramos en el semáforo. `critical` = si falta, no se puede guardar.
const COLS: { key: string; label: string; critical: boolean }[] = [
  { key: "foto", label: "Foto", critical: false },
  { key: "codigo", label: "Código (MA Code)", critical: false },
  { key: "precioChina", label: "Precio unit. (FOB)", critical: true },
  { key: "unidades", label: "Unidades (Quantity)", critical: true },
  { key: "cbmTotal", label: "CBM total", critical: false },
  { key: "montoTotal", label: "Importe (Amount)", critical: true },
];

export default function UploadExcel({ containerId, hasProducts }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [blocking, setBlocking] = useState<string[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [savedWarnings, setSavedWarnings] = useState<string[]>([]);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [showPanel, setShowPanel] = useState(false);

  const busy = phase === "analyzing" || phase === "saving";

  function resetState() {
    setPhase("idle");
    setError(null);
    setBlocking([]);
    setReport(null);
    setSavedWarnings([]);
    setBlobUrl(null);
  }

  // Descarta el Excel temporal del Blob si se cierra sin confirmar.
  function discardBlob(url: string | null) {
    if (!url) return;
    fetch(`/api/containers/${containerId}/upload`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blobUrl: url, action: "cancel" }),
      keepalive: true,
    }).catch(() => {});
  }

  function closePanel() {
    if (busy) return;
    if (phase === "report" || phase === "error") discardBlob(blobUrl);
    setShowPanel(false);
    resetState();
  }

  // Paso 1: subir a Blob y pedir el ANÁLISIS (sin guardar).
  async function analyze(file: File) {
    resetState();
    setPhase("analyzing");
    setShowPanel(true);
    try {
      const blob = await uploadToBlob(file.name, file, {
        access: "public",
        handleUploadUrl: "/api/blob/upload",
        contentType: file.type || undefined,
      });
      setBlobUrl(blob.url);

      const res = await fetch(`/api/containers/${containerId}/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blobUrl: blob.url, action: "preview" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "No se pudo analizar el archivo.");
        setPhase("error");
        return;
      }
      setReport(data as Report);
      setPhase("report");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de conexión al subir el archivo.");
      setPhase("error");
    }
  }

  // Paso 2: CONFIRMAR y guardar.
  async function confirmSave() {
    if (!blobUrl) return;
    setPhase("saving");
    setError(null);
    try {
      const res = await fetch(`/api/containers/${containerId}/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blobUrl, action: "commit" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setBlocking(Array.isArray(data.blocking) ? data.blocking : []);
        setError(data.error ?? "No se pudo guardar el embarque.");
        setPhase("error");
        return;
      }
      setSavedWarnings(Array.isArray(data.warnings) ? data.warnings : []);
      setBlobUrl(null); // ya se consumió
      setPhase("done");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de conexión al guardar.");
      setPhase("error");
    }
  }

  function onFile(files: FileList | null) {
    if (files && files[0]) analyze(files[0]);
  }

  const val = report?.validation;
  const canSave = phase === "report" && !!val?.ok;

  return (
    <>
      <button
        onClick={() => {
          resetState();
          setShowPanel(true);
        }}
        className={
          hasProducts
            ? "inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-zinc-200 transition hover:bg-white/10"
            : "brand-gradient brand-glow inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
        }
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
          <path d="M12 16V4M7 9l5-5 5 5M5 20h14" />
        </svg>
        {hasProducts ? "Reemplazar Excel" : "Subir Excel"}
      </button>

      {showPanel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={closePanel} />
          <div className="animate-in card relative max-h-[90vh] w-full max-w-xl overflow-y-auto border-white/10 p-6 shadow-2xl">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h2 className="text-lg font-bold text-white">
                  {phase === "report"
                    ? "Revisá antes de guardar"
                    : phase === "done"
                      ? "Embarque guardado"
                      : hasProducts
                        ? "Reemplazar Excel"
                        : "Subir Excel"}
                </h2>
                <p className="text-sm text-zinc-400">
                  {phase === "report"
                    ? "Se analizó el archivo. Nada se guardó todavía."
                    : "Se leerán las columnas y se extraerán las fotos incrustadas."}
                </p>
              </div>
              {!busy && (
                <button
                  onClick={closePanel}
                  className="rounded-lg p-1.5 text-zinc-500 transition hover:bg-white/10 hover:text-zinc-200"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="h-5 w-5">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>

            {hasProducts && (phase === "idle" || phase === "analyzing") && (
              <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 text-sm text-amber-300">
                Este contenedor ya tiene productos. Se reemplazan recién cuando confirmes.
              </div>
            )}

            {/* Dropzone / spinner */}
            {(phase === "idle" || phase === "analyzing") && (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  if (phase === "idle") onFile(e.dataTransfer.files);
                }}
                onClick={() => phase === "idle" && inputRef.current?.click()}
                className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition ${
                  dragging ? "border-indigo-400 bg-indigo-500/10" : "border-white/15 bg-white/[0.03] hover:border-indigo-400/50 hover:bg-white/5"
                } ${phase === "analyzing" ? "pointer-events-none opacity-70" : ""}`}
              >
                {phase === "analyzing" ? (
                  <>
                    <div className="mb-3 h-8 w-8 animate-spin rounded-full border-4 border-indigo-500/30 border-t-indigo-400" />
                    <p className="text-sm font-medium text-zinc-300">Analizando el Excel…</p>
                  </>
                ) : (
                  <>
                    <div className="brand-gradient brand-glow mb-3 flex h-12 w-12 items-center justify-center rounded-xl text-white">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
                        <path d="M12 16V4M7 9l5-5 5 5M5 20h14" />
                      </svg>
                    </div>
                    <p className="text-sm font-semibold text-zinc-200">Arrastrá el archivo acá o hacé clic para elegir</p>
                    <p className="mt-1 text-xs text-zinc-500">Formato .xlsx (con fotos incrustadas en la columna Foto)</p>
                  </>
                )}
                <input ref={inputRef} type="file" accept=".xlsx,.xlsm,.xls" className="hidden" onChange={(e) => onFile(e.target.files)} />
              </div>
            )}

            {/* Error general / bloqueo al guardar */}
            {phase === "error" && (
              <div className="space-y-3">
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-3 text-sm text-red-300">
                  <p className="font-semibold">{error}</p>
                  {blocking.length > 0 && (
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-red-200/90">
                      {blocking.map((b, i) => (
                        <li key={i}>{b}</li>
                      ))}
                    </ul>
                  )}
                </div>
                <button
                  onClick={() => {
                    discardBlob(blobUrl);
                    resetState();
                  }}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-zinc-200 transition hover:bg-white/10"
                >
                  Elegir otro archivo
                </button>
              </div>
            )}

            {/* Informe de vista previa */}
            {phase === "report" && report && val && (
              <div className="space-y-4">
                {/* Veredicto */}
                {val.ok ? (
                  <div className="flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    </div>
                    <p className="text-sm font-semibold text-emerald-300">
                      Se leyó correctamente. Revisá el resumen y confirmá para guardar.
                    </p>
                  </div>
                ) : (
                  <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3">
                    <p className="flex items-center gap-2 text-sm font-semibold text-red-300">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                        <path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
                      </svg>
                      No se puede guardar: la lectura tiene problemas
                    </p>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-red-200/90">
                      {val.blocking.map((b, i) => (
                        <li key={i}>{b}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Columnas detectadas */}
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Columnas detectadas</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {COLS.map(({ key, label, critical }) => {
                      const detected = report.columnsDetected[key];
                      const ok = !!detected;
                      return (
                        <div key={key} className="flex items-center gap-2 rounded-lg bg-white/[0.04] px-2.5 py-1.5 text-xs">
                          <span className={`shrink-0 ${ok ? "text-emerald-400" : critical ? "text-red-400" : "text-zinc-600"}`}>
                            {ok ? "✓" : critical ? "✕" : "○"}
                          </span>
                          <span className="font-medium text-zinc-300">{label}</span>
                          <span className="ml-auto truncate text-zinc-500">{detected ?? (critical ? "falta" : "—")}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Resumen numérico */}
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: "Ítems", value: fmtInt(report.totalItems) },
                    { label: "Fotos", value: fmtInt(report.photosFound) },
                    { label: "Total", value: fmtUSD(report.containerTotal) },
                  ].map((s) => (
                    <div key={s.label} className="rounded-lg bg-white/[0.04] px-3 py-2 text-center">
                      <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">{s.label}</p>
                      <p className="mt-0.5 text-sm font-bold text-white">{s.value}</p>
                    </div>
                  ))}
                </div>

                {/* Muestra de filas */}
                {report.sample.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      Primeras filas (así se van a guardar)
                    </p>
                    <div className="overflow-x-auto rounded-lg border border-white/10">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-white/[0.04] text-zinc-500">
                          <tr>
                            <th className="px-2.5 py-1.5 font-semibold">Código</th>
                            <th className="px-2.5 py-1.5 text-right font-semibold">Unid.</th>
                            <th className="px-2.5 py-1.5 text-right font-semibold">FOB</th>
                            <th className="px-2.5 py-1.5 text-right font-semibold">CBM</th>
                            <th className="px-2.5 py-1.5 text-right font-semibold">Importe</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {report.sample.map((r, i) => (
                            <tr key={i}>
                              <td className="max-w-[140px] truncate px-2.5 py-1.5 text-zinc-200">{r.codigo ?? "—"}</td>
                              <td className="px-2.5 py-1.5 text-right tabular-nums text-zinc-300">{fmtInt(r.unidades)}</td>
                              <td className="px-2.5 py-1.5 text-right tabular-nums text-red-300">{fmtUSD(r.precioChina)}</td>
                              <td className="px-2.5 py-1.5 text-right tabular-nums text-zinc-400">{r.cbmTotal ?? "—"}</td>
                              <td className="px-2.5 py-1.5 text-right tabular-nums text-zinc-300">{fmtUSD(r.montoTotal)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Avisos no bloqueantes */}
                {val.warnings.length > 0 && (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 text-sm text-amber-300">
                    <p className="font-semibold">Avisos (podés guardar igual):</p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-5 text-amber-200/90">
                      {val.warnings.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Acciones */}
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => {
                      discardBlob(blobUrl);
                      resetState();
                    }}
                    className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-zinc-200 transition hover:bg-white/10"
                  >
                    Elegir otro archivo
                  </button>
                  <button
                    onClick={confirmSave}
                    disabled={!canSave}
                    className="brand-gradient brand-glow flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {hasProducts ? "Confirmar y reemplazar" : "Confirmar y guardar"}
                  </button>
                </div>
              </div>
            )}

            {/* Guardando */}
            {phase === "saving" && (
              <div className="flex flex-col items-center py-10 text-center">
                <div className="mb-3 h-8 w-8 animate-spin rounded-full border-4 border-indigo-500/30 border-t-indigo-400" />
                <p className="text-sm font-medium text-zinc-300">Guardando el embarque…</p>
              </div>
            )}

            {/* Éxito */}
            {phase === "done" && (
              <div className="space-y-4">
                <div className="flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  </div>
                  <p className="text-sm font-semibold text-emerald-300">¡Embarque guardado con éxito!</p>
                </div>
                {savedWarnings.length > 0 && (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 text-xs text-amber-300">
                    <p className="font-semibold">Guardado con estos avisos:</p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-5 text-amber-200/90">
                      {savedWarnings.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <button
                  onClick={closePanel}
                  className="brand-gradient brand-glow w-full rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
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
