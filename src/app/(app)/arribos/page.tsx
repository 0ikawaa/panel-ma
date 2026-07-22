import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { fmtCBM2, fmtDate, fmtInt, fmtUSD } from "@/lib/format";
import NewContainerButton from "@/components/NewContainerButton";
import EmbarquesTabs from "@/components/EmbarquesTabs";

export const dynamic = "force-dynamic";

export default async function ArribosPage() {
  const [containers, stats, recibidosCount] = await Promise.all([
    prisma.container.findMany({
      where: { receivedAt: null },
      orderBy: [{ eta: "asc" }, { createdAt: "desc" }],
    }),
    prisma.product.groupBy({
      by: ["containerId"],
      _count: { _all: true },
      _sum: { cbmTotal: true },
    }),
    prisma.container.count({ where: { receivedAt: { not: null } } }),
  ]);

  const statMap = new Map(
    stats.map((s) => [s.containerId, { count: s._count._all, cbm: s._sum.cbmTotal ?? 0 }]),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Importaciones</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Contenedores en camino y recibidos. Subí el Excel de cada uno.
          </p>
        </div>
        <NewContainerButton />
      </div>

      <EmbarquesTabs
        active="camino"
        enCamino={containers.length}
        recibidos={recibidosCount}
      />

      {containers.length === 0 ? (
        <div className="card flex flex-col items-center border-dashed px-6 py-16 text-center">
          <div className="brand-gradient brand-glow mb-4 flex h-16 w-16 items-center justify-center rounded-2xl text-white">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8">
              <path d="M3 7h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Zm0 0 2-3h14l2 3M9 7v12M15 7v12" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-white">
            Todavía no hay contenedores
          </h2>
          <p className="mt-1 max-w-sm text-sm text-zinc-400">
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
                className="animate-in group card card-hover flex flex-col overflow-hidden hover:-translate-y-0.5"
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
                  <h3 className="font-bold text-white transition group-hover:text-indigo-300">
                    {c.name}
                  </h3>
                  {c.supplier && (
                    <p className="mt-0.5 text-sm text-zinc-500">{c.supplier}</p>
                  )}

                  {/* Precio total del contenedor, destacado */}
                  <div className="mt-4 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-emerald-300/80">
                      Precio del contenedor
                    </p>
                    <p className="text-xl font-bold text-emerald-300">
                      {c.totalPrice != null ? fmtUSD(c.totalPrice) : "—"}
                    </p>
                  </div>

                  <div className="mt-4 flex items-center gap-4 border-t border-white/10 pt-4">
                    <div>
                      <p className="text-lg font-bold text-white">
                        {fmtInt(s?.count ?? 0)}
                      </p>
                      <p className="text-xs text-zinc-500">ítems</p>
                    </div>
                    <div className="ml-auto text-right">
                      <p className="text-lg font-bold text-indigo-400">
                        {fmtCBM2(s?.cbm ?? 0)}
                      </p>
                      <p className="text-xs text-zinc-500">volumen total</p>
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
