import { prisma } from "@/lib/prisma";
import EmbarquesBoard, { type BoardContainer } from "@/components/EmbarquesBoard";
import EmbarquesTabs from "@/components/EmbarquesTabs";
import NewContainerButton from "@/components/NewContainerButton";
import { estadoEfectivo } from "@/lib/embarques";

export const dynamic = "force-dynamic";

export default async function TableroPage() {
  const [containers, stats, recibidosCount, enCaminoCount] = await Promise.all([
    prisma.container.findMany({
      orderBy: [{ eta: "asc" }, { createdAt: "desc" }],
      include: { docs: { orderBy: { createdAt: "asc" } } },
    }),
    prisma.product.groupBy({ by: ["containerId"], _count: { _all: true } }),
    prisma.container.count({ where: { receivedAt: { not: null } } }),
    prisma.container.count({ where: { receivedAt: null } }),
  ]);

  const itemsPorContenedor = new Map(stats.map((s) => [s.containerId, s._count._all]));

  const initial: BoardContainer[] = containers.map((c) => ({
    id: c.id,
    name: c.name,
    supplier: c.supplier,
    eta: c.eta ? c.eta.toISOString() : null,
    totalPrice: c.totalPrice,
    origin: c.origin,
    status: estadoEfectivo(c),
    items: itemsPorContenedor.get(c.id) ?? 0,
    docs: c.docs.map((d) => ({
      id: d.id,
      type: d.type,
      name: d.name,
      url: d.url,
      size: d.size,
      uploadedBy: d.uploadedBy,
      createdAt: d.createdAt.toISOString(),
    })),
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Tablero de embarques</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Arrastrá cada contenedor entre etapas y adjuntale la documentación. Si falta un
            papel obligatorio, te avisa acá arriba.
          </p>
        </div>
        <NewContainerButton />
      </div>

      <EmbarquesTabs active="tablero" enCamino={enCaminoCount} recibidos={recibidosCount} />

      {containers.length === 0 ? (
        <div className="card flex flex-col items-center border-dashed px-6 py-16 text-center">
          <h2 className="text-lg font-bold text-white">Todavía no hay embarques</h2>
          <p className="mt-1 max-w-sm text-sm text-zinc-400">
            Creá el primero y va a aparecer en la columna «En producción».
          </p>
          <div className="mt-6">
            <NewContainerButton />
          </div>
        </div>
      ) : (
        <EmbarquesBoard initial={initial} />
      )}
    </div>
  );
}
