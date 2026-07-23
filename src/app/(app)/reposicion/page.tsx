import ReposicionLive from "@/components/ReposicionLive";

export const dynamic = "force-dynamic";

export default function ReposicionPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Reposición</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Ventas reales de todos los canales cruzadas con el stock actual: te sugiere cuánto
          pedir de cada código, con lo que ya viene en camino y el valor del pedido al costo de
          origen. Elegí el período y los meses a cubrir.
        </p>
      </div>
      <ReposicionLive />
    </div>
  );
}
