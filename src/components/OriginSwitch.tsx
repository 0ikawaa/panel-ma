"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function OriginSwitch({
  containerId,
  origin,
}: {
  containerId: string;
  origin: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const current = origin === "brasil" ? "brasil" : "china";

  async function change(o: "china" | "brasil") {
    if (o === current) return;
    setLoading(o);
    try {
      await fetch(`/api/containers/${containerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ origin: o }),
      });
      router.refresh();
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="inline-flex rounded-xl border border-white/10 bg-white/[0.02] p-1">
      {(["china", "brasil"] as const).map((o) => (
        <button
          key={o}
          onClick={() => change(o)}
          disabled={loading !== null}
          className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
            current === o
              ? "bg-teal-500/20 text-teal-200"
              : "text-zinc-400 hover:text-white"
          }`}
        >
          {o === "china" ? "🇨🇳 China" : "🇧🇷 Brasil"}
        </button>
      ))}
    </div>
  );
}
