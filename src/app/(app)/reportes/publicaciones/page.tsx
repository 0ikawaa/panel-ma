import Link from "next/link";
import ReportePublicaciones from "@/components/ReportePublicaciones";

export const dynamic = "force-dynamic";

export default function PublicacionesPage() {
  return (
    <div className="space-y-6">
      <div>
        <Link href="/reportes" className="inline-flex items-center gap-1 text-sm text-zinc-400 transition hover:text-white">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
            <path d="m15 18-6-6 6-6" />
          </svg>
          Reportes
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-white">Publicaciones a revisar</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Publicaciones pausadas o cerradas en MercadoLibre que todavía tienen stock en Odoo (con el motivo de por qué están
          inactivas), y publicaciones activas que no vendieron nada en una ventana configurable.
        </p>
      </div>
      <ReportePublicaciones />
    </div>
  );
}
