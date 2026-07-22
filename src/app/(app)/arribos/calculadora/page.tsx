import { prisma } from "@/lib/prisma";
import EmbarquesTabs from "@/components/EmbarquesTabs";
import Calculadora from "@/components/Calculadora";

export const dynamic = "force-dynamic";

export default async function CalculadoraPage() {
  const [enCamino, recibidos] = await Promise.all([
    prisma.container.count({ where: { receivedAt: null } }),
    prisma.container.count({ where: { receivedAt: { not: null } } }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Importaciones</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Calculá a cuánto queda un producto nacionalizado, con la misma lógica de los embarques.
        </p>
      </div>

      <EmbarquesTabs active="calculadora" enCamino={enCamino} recibidos={recibidos} />

      <Calculadora />
    </div>
  );
}
