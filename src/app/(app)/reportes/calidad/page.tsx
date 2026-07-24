import Link from "next/link";
import ReporteCalidad from "@/components/ReporteCalidad";

export const dynamic = "force-dynamic";

export default function CalidadPage() {
  return (
    <div className="space-y-6">
      <div>
        <Link href="/reportes" className="inline-flex items-center gap-1 text-sm text-zinc-400 transition hover:text-white">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
            <path d="m15 18-6-6 6-6" />
          </svg>
          Reportes
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-white">Calidad de las publicaciones</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Revisa la calidad (health) de las publicaciones activas de MercadoLibre. Para cada una que no está al máximo, arma la
          lista de objetivos concretos a cumplir para subirla.
        </p>
      </div>
      <ReporteCalidad />
    </div>
  );
}
