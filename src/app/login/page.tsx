"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "No se pudo iniciar sesión");
        setLoading(false);
        return;
      }
      router.replace("/arribos");
      router.refresh();
    } catch {
      setError("Error de conexión");
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden px-4">
      {/* Orbes de color animados */}
      <div className="animate-float absolute -left-32 top-0 -z-10 h-[28rem] w-[28rem] rounded-full bg-teal-500/25 blur-[120px]" />
      <div className="animate-float absolute -right-24 bottom-0 -z-10 h-[26rem] w-[26rem] rounded-full bg-cyan-500/20 blur-[120px] [animation-delay:-7s]" />

      <div className="animate-in w-full max-w-md">
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-8 shadow-2xl backdrop-blur-2xl sm:p-10">
          <div className="mb-8 flex flex-col items-center text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo-ma.png"
              alt="MA Importaciones"
              className="mb-5 h-16 w-auto object-contain"
            />
            <p className="text-sm text-zinc-400">
              Panel de gestión de arribos
            </p>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-zinc-300">
                Usuario
              </label>
              <input
                type="text"
                autoComplete="username"
                value={user}
                onChange={(e) => setUser(e.target.value)}
                placeholder="admin"
                className="field"
                required
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-zinc-300">
                Contraseña
              </label>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••"
                className="field"
                required
              />
            </div>

            {error && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="brand-gradient brand-glow w-full rounded-xl px-4 py-3 font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Ingresando…" : "Ingresar"}
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-zinc-500">
            Acceso restringido · MA Importaciones
          </p>
        </div>
      </div>
    </div>
  );
}
