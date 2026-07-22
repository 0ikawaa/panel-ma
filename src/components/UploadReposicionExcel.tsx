"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { upload as uploadToBlob } from "@vercel/blob/client";

interface Props {
  reposicionId: string;
  tipo: "ventas" | "stock";
  loaded: boolean;
  count?: number;
}

const LABELS = {
  ventas: {
    title: "Ventas del mes",
    hint: "Excel con el código entre corchetes y las cantidades vendidas.",
  },
  stock: {
    title: "Stock actual",
    hint: "Excel con el código, el título y la cantidad disponible para uso.",
  },
};

export default function UploadReposicionExcel({ reposicionId, tipo, loaded, count }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const meta = LABELS[tipo];

  async function upload(file: File) {
    setLoading(true);
    setError(null);
    try {
      const blob = await uploadToBlob(file.name, file, {
        access: "public",
        handleUploadUrl: "/api/blob/upload",
        contentType: file.type || undefined,
      });
      const res = await fetch(`/api/reposicion/${reposicionId}/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blobUrl: blob.url, tipo }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "No se pudo procesar el archivo");
      } else {
        router.refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de conexión al subir el archivo");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className={`rounded-2xl border px-5 py-4 transition ${
        loaded
          ? "border-emerald-500/30 bg-emerald-500/[0.07]"
          : "border-white/10 bg-white/[0.02]"
      }`}
    >
      <div className="flex items-center gap-3">
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
            loaded ? "bg-emerald-500 text-white" : "bg-white/5 text-zinc-300"
          }`}
        >
          {loaded ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          ) : tipo === "ventas" ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
              <path d="M3 3v18h18M7 14l3-3 3 3 5-6" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
            </svg>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-white">{meta.title}</p>
          <p className="truncate text-xs text-zinc-400">
            {loaded ? `${count ?? 0} códigos cargados` : meta.hint}
          </p>
        </div>
        <button
          onClick={() => !loading && inputRef.current?.click()}
          disabled={loading}
          className={
            loaded
              ? "shrink-0 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-zinc-200 transition hover:bg-white/10 disabled:opacity-60"
              : "brand-gradient brand-glow shrink-0 rounded-lg px-3.5 py-2 text-xs font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
          }
        >
          {loading ? "Procesando…" : loaded ? "Reemplazar" : "Subir Excel"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xlsm,.xls"
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.[0]) upload(e.target.files[0]);
            e.target.value = "";
          }}
        />
      </div>
      {error && (
        <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}
    </div>
  );
}
