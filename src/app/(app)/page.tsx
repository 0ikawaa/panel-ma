import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { fmtCBM, fmtDate, fmtInt } from "@/lib/format";
import NewContainerButton from "@/components/NewContainerButton";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [containersCount, productAgg, photosCount, containers, stats] =
    await Promise.all([
      prisma.container.count(),
      prisma.product.aggregate({
        _count: { _all: true },
        _sum: { cbmTotal: true },
      }),
      prisma.product.count({ where: { NOT: { photo: null } } }),
      prisma.container.findMany({ orderBy: { createdAt: "desc" }, take: 5 }),
      prisma.product.groupBy({
        by: ["containerId"],
        _count: { _all: true },
        _sum: { cbmTotal: true },
      }),
    ]);

  const statMap = new Map(
    stats.map((s) => [s.containerId, { count: s._count._all, cbm: s._sum.cbmTotal ?? 0 }]),
  );

  const cards = [
    {
      label: "Contenedores",
      value: fmtInt(containersCount),
      gradient: "linear-gradient(135deg,#6366f1,#8b5cf6)",
      icon: <path d="M3 7h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Zm0 0 2-3h14l2 3M9 7v12M15 7v12" />,
    },
    {
      label: "Productos cargados",
      value: fmtInt(productAgg._count._all),
      gradient: "linear-gradient(135deg,#0ea5e9,#06b6d4)",
      icon: <path d="M20 7 12 3 4 7l8 4 8-4ZM4 7v10l8 4 8-4V7M12 11v10" />,
    },
    {
      label: "CBM total",
      value: fmtCBM(productAgg._sum.cbmTotal ?? 0),
      gradient: "linear-gradient(135deg,#10b981,#14b8a6)",
      icon: <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />,
    },
    {
      label: "Fotos cargadas",
      value: fmtInt(photosCount),
      gradient: "linear-gradient(135deg,#f59e0b,#f97316)",
      icon: <path d="M3 5h18v14H3zM3 15l5-5 4 4 3-3 6 6M8.5 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" />,
    },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Inicio</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Resumen general de tus arribos y volúmenes.
          </p>
        </div>
        <NewContainerButton />
      </div>

      {/* Tarjetas de estadísticas */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {cards.map((c) => (
          <div
            key={c.label}
            className="animate-in card card-hover p-5"
          >
            <div
              className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl text-white shadow-lg"
              style={{ backgroundImage: c.gradient }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
                {c.icon}
              </svg>
            </div>
            <p className="text-2xl font-bold text-white">{c.value}</p>
            <p className="mt-0.5 text-sm text-zinc-400">{c.label}</p>
          </div>
        ))}
      </div>

      {/* Contenedores recientes */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">
            Contenedores recientes
          </h2>
          <Link
            href="/arribos"
            className="text-sm font-semibold text-indigo-400 transition hover:text-indigo-300"
          >
            Ver todos →
          </Link>
        </div>

        {containers.length === 0 ? (
          <div className="card border-dashed p-12 text-center">
            <p className="text-zinc-300">
              Todavía no cargaste ningún contenedor.
            </p>
            <p className="mt-1 text-sm text-zinc-500">
              Creá tu primer arribo para empezar.
            </p>
          </div>
        ) : (
          <div className="card divide-y divide-white/5 overflow-hidden">
            {containers.map((c) => {
              const s = statMap.get(c.id);
              return (
                <Link
                  key={c.id}
                  href={`/arribos/${c.id}`}
                  className="flex items-center gap-4 px-5 py-4 transition hover:bg-white/5"
                >
                  <div className="brand-gradient flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white shadow-sm">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                      <path d="M3 7h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Zm0 0 2-3h14l2 3M9 7v12M15 7v12" />
                    </svg>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-white">
                      {c.name}
                    </p>
                    <p className="truncate text-sm text-zinc-500">
                      {c.supplier ? `${c.supplier} · ` : ""}
                      {fmtDate(c.eta)}
                    </p>
                  </div>
                  <div className="hidden text-right sm:block">
                    <p className="text-sm font-semibold text-zinc-200">
                      {fmtInt(s?.count ?? 0)} prod.
                    </p>
                    <p className="text-xs text-zinc-500">
                      {fmtCBM(s?.cbm ?? 0)}
                    </p>
                  </div>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="h-5 w-5 text-zinc-600">
                    <path d="m9 18 6-6-6-6" />
                  </svg>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
