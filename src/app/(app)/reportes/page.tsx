import Link from "next/link";

export const dynamic = "force-dynamic";

// Índice de la sección Reportes. Por ahora un reporte; pensado para crecer.
const REPORTES = [
  {
    href: "/reportes/ventas-aceleradas",
    titulo: "Ventas aceleradas / riesgo de quiebre",
    desc: "SKUs que se están vendiendo mucho más rápido que su ritmo habitual y cuyo stock (más lo que viene en camino) no alcanza a cubrir la demanda: te avisa antes de quedarte sin producto.",
    tag: "Diario · WhatsApp",
    activo: true,
  },
  {
    href: "/reportes/sin-rotacion",
    titulo: "Publicaciones sin rotación",
    desc: "Productos (por código padre) que se venden menos que el mes pasado y que el mismo período del año pasado. Detalla la caída y el motivo probable (agotado, viene en camino, o con stock que no rota).",
    tag: "En vivo",
    activo: true,
  },
  {
    href: "/reportes/cancelaciones",
    titulo: "Cancelaciones de MercadoLibre",
    desc: "Órdenes canceladas por semana o mes, con la tasa de cancelación, el motivo (no pagada / fraude) y la comparación contra el período anterior. Después le sumamos los reclamos cuando se habiliten.",
    tag: "En vivo",
    activo: true,
  },
  {
    href: "/reportes/calidad",
    titulo: "Calidad de las publicaciones",
    desc: "Publicaciones activas cuya calidad (health de ML) no está al máximo, con la lista de objetivos concretos a cumplir para subirla: foto principal, fotos, ficha técnica, carrito, infracciones y visibilidad.",
    tag: "En vivo",
    activo: true,
  },
  {
    href: "/reportes/publicaciones",
    titulo: "Publicaciones a revisar",
    desc: "Publicaciones inactivas en ML que todavía tienen stock en Odoo (con el motivo de por qué están pausadas o cerradas), y publicaciones activas que no venden hace semanas o meses (configurable).",
    tag: "En vivo",
    activo: true,
  },
];

export default function ReportesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Reportes</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Alertas y análisis del negocio. Se muestran acá y, según su configuración, se envían
          automáticamente por WhatsApp.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {REPORTES.map((r) => (
          <Link
            key={r.href}
            href={r.href}
            className="card group flex flex-col gap-3 p-5 transition hover:border-white/20 hover:bg-white/[0.04]"
          >
            <div className="flex items-start justify-between gap-3">
              <span className="brand-gradient brand-glow flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                  <path d="M4 4v16h16" />
                  <path d="M8 16v-4M12 16V8M16 16v-6" />
                </svg>
              </span>
              <span className="rounded-full border border-teal-400/30 bg-teal-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-teal-200">
                {r.tag}
              </span>
            </div>
            <div>
              <h2 className="text-base font-semibold text-white group-hover:text-teal-200">{r.titulo}</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">{r.desc}</p>
            </div>
            <span className="mt-auto inline-flex items-center gap-1 text-sm font-semibold text-teal-300">
              Ver reporte
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                <path d="m9 18 6-6-6-6" />
              </svg>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
