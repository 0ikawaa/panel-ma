"use client";

import { useState } from "react";

type MigrateState =
  | { phase: "idle" }
  | { phase: "running"; migrated: number; remaining: number }
  | { phase: "done"; migrated: number }
  | { phase: "error"; message: string };

export default function AdminTools({
  initialRemaining,
  blobAvailable,
}: {
  initialRemaining: number;
  blobAvailable: boolean;
}) {
  const [remaining, setRemaining] = useState<number>(initialRemaining);
  const blobOk = blobAvailable;
  const [state, setState] = useState<MigrateState>({ phase: "idle" });

  async function migrate() {
    let total = 0;
    setState({ phase: "running", migrated: 0, remaining });
    try {
      // Llama al endpoint por lotes hasta que no queden fotos base64.
      for (let guard = 0; guard < 1000; guard++) {
        const res = await fetch("/api/admin/migrate-photos", { method: "POST" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setState({ phase: "error", message: data.error ?? "Error al migrar" });
          return;
        }
        total += data.migrated ?? 0;
        setRemaining(data.remaining ?? 0);
        setState({ phase: "running", migrated: total, remaining: data.remaining ?? 0 });
        if (data.done || (data.migrated ?? 0) === 0) break;
      }
      setState({ phase: "done", migrated: total });
    } catch (e) {
      setState({ phase: "error", message: e instanceof Error ? e.message : "Error de red" });
    }
  }

  const running = state.phase === "running";

  return (
    <div className="card space-y-5 p-6">
      <div>
        <h2 className="text-lg font-bold text-white">Mantenimiento</h2>
        <p className="text-sm text-zinc-400">
          Copia de seguridad de los datos y optimización del almacenamiento de fotos.
        </p>
      </div>

      {/* Backup */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3.5">
        <div>
          <p className="text-sm font-semibold text-zinc-100">Respaldo completo</p>
          <p className="text-xs text-zinc-500">
            Descarga un JSON con todos los contenedores, productos y reposiciones.
          </p>
        </div>
        <a
          href="/api/admin/backup"
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-zinc-200 transition hover:bg-white/10"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
            <path d="M12 4v12m0 0-4-4m4 4 4-4M5 20h14" />
          </svg>
          Descargar backup
        </a>
      </div>

      {/* Migración de fotos */}
      <div className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-zinc-100">Fotos en almacenamiento externo</p>
            <p className="text-xs text-zinc-500">
              {remaining === 0
                ? "Todas las fotos ya están optimizadas (guardadas como URL)."
                : `${remaining} foto${remaining === 1 ? "" : "s"} todavía guardadas dentro de la base (base64).`}
            </p>
          </div>
          {remaining > 0 && (
            <button
              onClick={migrate}
              disabled={running || !blobOk}
              className="brand-gradient brand-glow inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {running && (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              )}
              {running ? "Migrando…" : "Migrar fotos a Blob"}
            </button>
          )}
        </div>

        {!blobOk && (
          <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
            No hay almacenamiento Blob configurado en este entorno (falta
            <code className="mx-1">BLOB_READ_WRITE_TOKEN</code>). La migración solo
            funciona en producción (Vercel).
          </p>
        )}

        {state.phase === "running" && (
          <p className="mt-3 text-xs text-teal-300">
            Migradas {state.migrated} · quedan {state.remaining}…
          </p>
        )}
        {state.phase === "done" && (
          <p className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
            ¡Listo! Se migraron {state.migrated} fotos a Vercel Blob.
          </p>
        )}
        {state.phase === "error" && (
          <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {state.message}
          </p>
        )}
      </div>
    </div>
  );
}
