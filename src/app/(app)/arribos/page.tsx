import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { fmtCBM, fmtDate, fmtInt } from "@/lib/format";
import NewContainerButton from "@/components/NewContainerButton";

export const dynamic = "force-dynamic";

export default async function ArribosPage() {
  const [containers, stats] = await Promise.all([
    prisma.container.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.product.groupBy({
      by: ["containerId"],
      _count: { _all: true },
      _sum: { cbmTotal: true },
    }),
  ]);

  const statMap = new Map(
    stats.map((s) => [s.containerId, { count: s._count._all, cbm: s._sum.cbmTotal ?? 0 }]),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Arribos</h1>
          <p className="mt-1 text-sm text-slate-500">
            Contenedores en camino y su volumen. Subí el Excel de cada uno.
          </p>
        </div>
        <NewContainerButton />
      </div>

      {containers.length === 0 ? (
        <div className="flex flex-col items-center rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
          <div className="brand-gradient mb-4 flex h-16 w-16 items-center justify-center rounded-2xl text-white shadow-lg">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8">
              <path d="M3 7h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Zm0 0 2-3h14l2 3M9 7v12M15 7v12" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-slate-900">
            Todavía no hay contenedores
          </h2>
          <p className="mt-1 max-w-sm text-sm text-slate-500">
            Creá tu primer arribo, subí el Excel del proveedor y mostrá lo que
            viene con fotos, precios y volumen.
          </p>
          <div className="mt-6">
            <NewContainerButton />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {containers.map((c) => {
            const s = statMap.get(c.id);
            return (
              <Link
                key={c.id}
                href={`/arribos/${c.id}`}
                className="animate-in group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-lg"
              >
                <div className="brand-gradient relative h-24 p-4">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_-10%,rgba(255,255,255,0.35),transparent_50%)]" />
                  <div className="relative flex h-full flex-col justify-between">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7 text-white/90">
                      <path d="M3 7h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Zm0 0 2-3h14l2 3M9 7v12M15 7v12" />
                    </svg>
                    <p className="text-xs font-medium text-white/80">
                      {fmtDate(c.eta)}
                    </p>
                  </div>
                </div>
                <div className="flex flex-1 flex-col p-5">
                  <h3 className="font-bold text-slate-900 group-hover:text-indigo-600">
                    {c.name}
                  </h3>
                  {c.supplier && (
                    <p className="mt-0.5 text-sm text-slate-400">{c.supplier}</p>
                  )}
                  <div className="mt-4 flex items-center gap-4 border-t border-slate-100 pt-4">
                    <div>
                      <p className="text-lg font-bold text-slate-900">
                        {fmtInt(s?.count ?? 0)}
                      </p>
                      <p className="text-xs text-slate-400">productos</p>
                    </div>
                    <div className="ml-auto text-right">
                      <p className="text-lg font-bold text-indigo-600">
                        {fmtCBM(s?.cbm ?? 0)}
                      </p>
                      <p className="text-xs text-slate-400">volumen total</p>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
