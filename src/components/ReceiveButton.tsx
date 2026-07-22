"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ReceiveButton({
  containerId,
  received,
}: {
  containerId: string;
  received: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [confirm, setConfirm] = useState(false);

  async function setReceived(value: boolean) {
    setLoading(true);
    try {
      await fetch(`/api/containers/${containerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ received: value }),
      });
      setConfirm(false);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  if (received) {
    return (
      <button
        onClick={() => setReceived(false)}
        disabled={loading}
        className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-zinc-300 transition hover:bg-white/10 disabled:opacity-60"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
          <path d="M3 3v5h5M3 8a9 9 0 1 0 2.4-3.5" />
        </svg>
        {loading ? "…" : "Volver a “en camino”"}
      </button>
    );
  }

  if (confirm) {
    return (
      <div className="inline-flex items-center gap-2">
        <button
          onClick={() => setReceived(true)}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:bg-emerald-500 disabled:opacity-60"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
            <path d="M20 6 9 17l-5-5" />
          </svg>
          {loading ? "Confirmando…" : "Confirmar ingreso"}
        </button>
        <button
          onClick={() => setConfirm(false)}
          disabled={loading}
          className="rounded-xl px-3 py-2.5 text-sm font-semibold text-zinc-400 transition hover:bg-white/5"
        >
          Cancelar
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirm(true)}
      className="brand-gradient brand-glow inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
        <path d="M5 12h14M12 5l7 7-7 7" />
      </svg>
      Marcar como recibido
    </button>
  );
}
