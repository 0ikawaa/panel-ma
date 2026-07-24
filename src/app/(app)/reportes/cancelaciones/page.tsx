import Link from "next/link";
import ReporteCancelaciones from "@/components/ReporteCancelaciones";

export const dynamic = "force-dynamic";

export default function CancelacionesPage() {
  return (
    <div className="space-y-6">
      <div>
        <Link href="/reportes" className="inline-flex items-center gap-1 text-sm text-zinc-400 transition hover:text-white">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
            <path d="m15 18-6-6 6-6" />
          </svg>
          Reportes
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-white">Cancelaciones de MercadoLibre</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Órdenes canceladas por semana o mes, con la tasa de cancelación y el motivo. Compara el
          último período cerrado contra el anterior. Cuando se habilite el sync de reclamos, los
          sumamos acá mismo.
        </p>
      </div>
      <ReporteCancelaciones />
    </div>
  );
}
