import Link from "next/link";
import ReporteVentasAceleradas from "@/components/ReporteVentasAceleradas";

export const dynamic = "force-dynamic";

export default function VentasAceleradasPage() {
  return (
    <div className="space-y-6">
      <div>
        <Link href="/reportes" className="inline-flex items-center gap-1 text-sm text-zinc-400 transition hover:text-white">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
            <path d="m15 18-6-6 6-6" />
          </svg>
          Reportes
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-white">Ventas aceleradas / riesgo de quiebre</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Compara la velocidad de venta reciente de cada código contra su ritmo histórico y la
          cruza con el stock actual y lo que viene en camino. Marca los productos que se están
          vendiendo más rápido de lo normal y donde no vas a llegar con la reposición.
        </p>
      </div>
      <ReporteVentasAceleradas />
    </div>
  );
}
