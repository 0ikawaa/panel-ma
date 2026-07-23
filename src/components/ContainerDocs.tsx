"use client";

import { useRef, useState } from "react";
import { upload as uploadToBlob } from "@vercel/blob/client";
import { fmtDate } from "@/lib/format";
import {
  DOC_TYPES,
  REQUERIDOS,
  docLabel,
  faltantes,
  type DocType,
  type Estado,
} from "@/lib/embarques";

export interface Doc {
  id: string;
  type: string;
  name: string;
  url: string;
  size: number | null;
  uploadedBy: string | null;
  createdAt: string;
}

function fmtSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function ContainerDocs({
  containerId,
  estado,
  docs,
  onChange,
  compact,
}: {
  containerId: string;
  estado: Estado;
  docs: Doc[];
  onChange: (docs: Doc[]) => void;
  compact?: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [tipo, setTipo] = useState<DocType>("factura");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requeridos = REQUERIDOS[estado];
  const faltan = faltantes(estado, docs.map((d) => d.type));

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite volver a elegir el mismo archivo
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) {
      setError("El archivo supera 25 MB.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const blob = await uploadToBlob(`embarques/${containerId}/${file.name}`, file, {
        access: "public",
        handleUploadUrl: "/api/blob/upload",
        contentType: file.type || undefined,
      });
      const res = await fetch(`/api/containers/${containerId}/docs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: tipo,
          name: file.name,
          url: blob.url,
          size: file.size,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || `Error ${res.status}`);
      onChange([...docs, json as Doc]);
    } catch (err) {
      setError((err as Error).message || "No se pudo subir el archivo.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(doc: Doc) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/containers/${containerId}/docs?docId=${encodeURIComponent(doc.id)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || `Error ${res.status}`);
      }
      onChange(docs.filter((d) => d.id !== doc.id));
    } catch (err) {
      setError((err as Error).message || "No se pudo borrar el archivo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {/* Checklist de lo exigido en esta etapa */}
      {requeridos.length > 0 && (
        <div
          className={`rounded-xl border px-3.5 py-3 ${
            faltan.length
              ? "border-amber-500/30 bg-amber-500/10"
              : "border-emerald-500/25 bg-emerald-500/10"
          }`}
        >
          <p
            className={`flex items-center gap-2 text-sm font-semibold ${
              faltan.length ? "text-amber-300" : "text-emerald-300"
            }`}
          >
            {faltan.length ? (
              <>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                  <path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
                </svg>
                Falta{faltan.length > 1 ? "n" : ""} {faltan.length} documento
                {faltan.length > 1 ? "s" : ""} para esta etapa
              </>
            ) : (
              <>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
                Documentación completa para esta etapa
              </>
            )}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {requeridos.map((t) => {
              const ok = !faltan.includes(t);
              return (
                <span
                  key={t}
                  className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium ${
                    ok ? "bg-emerald-500/15 text-emerald-200" : "bg-amber-500/15 text-amber-200"
                  }`}
                >
                  {ok ? "✓" : "○"} {docLabel(t)}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Subida */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value as DocType)}
          className="field !w-auto !py-2 text-sm"
          disabled={busy}
        >
          {DOC_TYPES.map((d) => (
            <option key={d.key} value={d.key} className="bg-zinc-900">
              {d.label}
            </option>
          ))}
        </select>
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          onChange={onPick}
          accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip"
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="brand-gradient brand-glow inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
        >
          {busy ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4 animate-spin">
              <path d="M21 12a9 9 0 1 1-2.64-6.36" strokeLinecap="round" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <path d="M12 16V4M7 9l5-5 5 5M5 20h14" />
            </svg>
          )}
          {busy ? "Subiendo…" : "Adjuntar"}
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Lista de adjuntos */}
      {docs.length === 0 ? (
        <p className="text-sm text-zinc-500">Todavía no hay archivos adjuntos.</p>
      ) : (
        <ul className="divide-y divide-white/5 overflow-hidden rounded-xl border border-white/10">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center gap-3 bg-white/[0.02] px-3 py-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/5 text-zinc-400">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
                  <path d="M14 2v6h6" />
                </svg>
              </span>
              <div className="min-w-0 flex-1">
                <a
                  href={d.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block truncate text-sm font-medium text-zinc-100 transition hover:text-teal-300"
                  title={d.name}
                >
                  {d.name}
                </a>
                <p className="truncate text-xs text-zinc-500">
                  {docLabel(d.type)}
                  {d.size ? ` · ${fmtSize(d.size)}` : ""}
                  {compact ? "" : ` · ${fmtDate(d.createdAt)}`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => remove(d)}
                disabled={busy}
                className="shrink-0 rounded-lg p-1.5 text-zinc-500 transition hover:bg-red-500/10 hover:text-red-400 disabled:opacity-60"
                title="Eliminar"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                  <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
