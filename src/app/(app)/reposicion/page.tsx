import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { fmtDate } from "@/lib/format";
import NewReposicionButton from "@/components/NewReposicionButton";

export const dynamic = "force-dynamic";

export default async function ReposicionListPage() {
  const analisis = await prisma.reposicion.findMany({
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Reposición</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Subí las ventas del mes y el stock actual: te sugiero cuánto pedir de cada código.
          </p>
        </div>
        <NewReposicionButton />
      </div>

      {analisis.length === 0 ? (
        <div className="card flex flex-col items-center border-dashed px-6 py-16 text-center">
          <div className="brand-gradient brand-glow mb-4 flex h-16 w-16 items-center justify-center rounded-2xl text-white">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8">
              <path d="M3 3v18h18M7 14l3-3 3 3 5-6" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-white">Todavía no hay análisis</h2>
          <p className="mt-1 max-w-sm text-sm text-zinc-400">
            Creá tu primer análisis, subí el Excel de ventas y el de stock, y obtené la
            reposición sugerida para cada código.
          </p>
          <div className="mt-6">
            <NewReposicionButton />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {analisis.map((a) => {
            const ventasN = Array.isArray(a.ventas) ? a.ventas.length : 0;
            const stockN = Array.isArray(a.stock) ? a.stock.length : 0;
            const listo = ventasN > 0 && stockN > 0;
            return (
              <Link
                key={a.id}
                href={`/reposicion/${a.id}`}
                className="animate-in group card card-hover flex flex-col p-5 hover:-translate-y-0.5"
              >
                <div className="flex items-start justify-between">
                  <div className="brand-gradient flex h-11 w-11 items-center justify-center rounded-xl text-white shadow-sm">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
                      <path d="M3 3v18h18M7 14l3-3 3 3 5-6" />
                    </svg>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                      listo
                        ? "bg-emerald-500/15 text-emerald-300"
                        : "bg-amber-500/15 text-amber-300"
                    }`}
                  >
                    {listo ? "Listo" : "Faltan datos"}
                  </span>
                </div>
                <h3 className="mt-4 font-bold text-white transition group-hover:text-indigo-300">
                  {a.name}
                </h3>
                <p className="mt-0.5 text-sm text-zinc-500">
                  {a.periodo ? `${a.periodo} · ` : ""}
                  {fmtDate(a.createdAt)}
                </p>

                <div className="mt-4 flex items-center gap-2 border-t border-white/10 pt-4 text-xs">
                  <span className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1 font-medium ${ventasN ? "bg-teal-500/10 text-teal-200" : "bg-white/5 text-zinc-500"}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${ventasN ? "bg-teal-400" : "bg-zinc-600"}`} />
                    Ventas {ventasN ? `· ${ventasN}` : ""}
                  </span>
                  <span className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1 font-medium ${stockN ? "bg-teal-500/10 text-teal-200" : "bg-white/5 text-zinc-500"}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${stockN ? "bg-teal-400" : "bg-zinc-600"}`} />
                    Stock {stockN ? `· ${stockN}` : ""}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
