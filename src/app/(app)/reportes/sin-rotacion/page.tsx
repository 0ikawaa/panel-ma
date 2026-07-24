import Link from "next/link";
import ReporteSinRotacion from "@/components/ReporteSinRotacion";

export const dynamic = "force-dynamic";

export default function SinRotacionPage() {
  return (
    <div className="space-y-6">
      <div>
        <Link href="/reportes" className="inline-flex items-center gap-1 text-sm text-zinc-400 transition hover:text-white">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
            <path d="m15 18-6-6 6-6" />
          </svg>
          Reportes
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-white">Publicaciones sin rotación</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Agrupa las ventas por código padre y compara lo que se vendió en el último período contra
          el mes pasado y contra el mismo período del año pasado. Marca los productos que se venden
          menos que antes y estima el motivo probable de la caída.
        </p>
      </div>
      <ReporteSinRotacion />
    </div>
  );
}
