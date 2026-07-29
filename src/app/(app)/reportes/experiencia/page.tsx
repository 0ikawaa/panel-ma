import Link from "next/link";
import ReporteExperiencia from "@/components/ReporteExperiencia";

export const dynamic = "force-dynamic";

export default function ExperienciaPage() {
  return (
    <div className="space-y-6">
      <div>
        <Link href="/reportes" className="inline-flex items-center gap-1 text-sm text-zinc-400 transition hover:text-white">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
            <path d="m15 18-6-6 6-6" />
          </svg>
          Reportes
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-white">
          Publicaciones con mala experiencia de compra
        </h1>
        <p className="mt-1 text-sm text-zinc-400">
          Los SKU unificados cuya experiencia de compra en MercadoLibre no llega al 100%, con el
          problema principal de cada uno y qué pide ML para arreglarlo. Cuando una publicación baja
          de puntaje queda marcada acá y se avisa por mail.
        </p>
      </div>
      <ReporteExperiencia />
    </div>
  );
}
