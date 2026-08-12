import Link from "next/link";
import ReporteSemanal from "@/components/ReporteSemanal";

export const dynamic = "force-dynamic";

export default function SemanalPage() {
  return (
    <div className="space-y-6">
      <div>
        <Link href="/reportes" className="inline-flex items-center gap-1 text-sm text-zinc-400 transition hover:text-white">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
            <path d="m15 18-6-6 6-6" />
          </svg>
          Reportes
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-white">Reporte semanal de ventas y reposición</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Lo que se vendió la semana que cerró (lunes a domingo), variante por variante y con la
          foto de cada producto, cruzado con el stock actual y lo que viene en camino para saber
          cuánto hay que pedir y cubrir los próximos meses. Sale solo por mail los lunes a las 9:00,
          con el Excel adjunto.
        </p>
      </div>
      <ReporteSemanal />
    </div>
  );
}
