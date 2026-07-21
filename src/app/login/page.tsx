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
      {/* Fondo decorativo */}
      <div className="brand-gradient absolute inset-0 -z-10" />
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.25),transparent_45%),radial-gradient(circle_at_80%_80%,rgba(255,255,255,0.18),transparent_40%)]" />

      <div className="animate-in w-full max-w-md">
        <div className="rounded-3xl border border-white/20 bg-white/95 p-8 shadow-2xl backdrop-blur-xl sm:p-10">
          <div className="mb-8 flex flex-col items-center text-center">
            <div className="brand-gradient mb-4 flex h-16 w-16 items-center justify-center rounded-2xl text-2xl font-black text-white shadow-lg">
              MA
            </div>
            <h1 className="text-2xl font-bold text-slate-900">
              MA Importaciones
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Panel de gestión de arribos
            </p>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Usuario
              </label>
              <input
                type="text"
                autoComplete="username"
                value={user}
                onChange={(e) => setUser(e.target.value)}
                placeholder="admin"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-100"
                required
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Contraseña
              </label>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-100"
                required
              />
            </div>

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="brand-gradient w-full rounded-xl px-4 py-3 font-semibold text-white shadow-lg transition hover:opacity-95 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Ingresando…" : "Ingresar"}
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-slate-400">
            Acceso restringido · MA Importaciones
          </p>
        </div>
      </div>
    </div>
  );
}
