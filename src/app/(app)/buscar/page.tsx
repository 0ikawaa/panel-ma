import { prisma } from "@/lib/prisma";
import { fmtCBM, fmtDate, fmtUSD } from "@/lib/format";
import { cbmPorUnidad } from "@/lib/cost";
import type { DetalleLinea } from "@/components/ProductTable";
import EmbarquesTabs from "@/components/EmbarquesTabs";

export const dynamic = "force-dynamic";

interface Resultado {
  codigo: string;
  precioChina: number | null;
  cbmUnitario: number | null;
  hasPlanned: boolean;
  nextEta: Date | null;
  containers: { name: string; eta: Date | null; received: boolean }[];
}

export default async function BuscarPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q: rawQ } = await searchParams;
  const q = (rawQ ?? "").trim();

  const [enCamino, recibidos] = await Promise.all([
    prisma.container.count({ where: { receivedAt: null } }),
    prisma.container.count({ where: { receivedAt: { not: null } } }),
  ]);

  let resultados: Resultado[] = [];

  if (q) {
    const products = await prisma.product.findMany({
      select: {
        codigo: true,
        precioChina: true,
        cbmUnitario: true,
        cantidadPorCaja: true,
        detalle: true,
        container: {
          select: { name: true, eta: true, receivedAt: true },
        },
      },
    });

    const ql = q.toLowerCase();
    const matched = products.filter((p) => {
      if (p.codigo && p.codigo.toLowerCase().includes(ql)) return true;
      const det = (p.detalle as DetalleLinea[] | null) ?? [];
      return det.some((l) => (l.codigos ?? []).some((c) => c.toLowerCase().includes(ql)));
    });

    const groups = new Map<string, typeof matched>();
    for (const p of matched) {
      const key = p.codigo ?? "—";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(p);
    }

    resultados = [...groups.entries()].map(([codigo, recs]) => {
      const inTransit = recs
        .filter((r) => !r.container.receivedAt && r.container.eta)
        .sort(
          (a, b) =>
            new Date(a.container.eta!).getTime() - new Date(b.container.eta!).getTime(),
        );
      const ref =
        inTransit[0] ?? recs.find((r) => !r.container.receivedAt) ?? recs[0];
      return {
        codigo,
        precioChina: ref.precioChina,
        cbmUnitario: cbmPorUnidad(ref.cbmUnitario, ref.cantidadPorCaja),
        hasPlanned: recs.some((r) => !r.container.receivedAt),
        nextEta: inTransit[0]?.container.eta ?? null,
        containers: recs.map((r) => ({
          name: r.container.name,
          eta: r.container.eta,
          received: !!r.container.receivedAt,
        })),
      };
    });
    resultados.sort((a, b) => a.codigo.localeCompare(b.codigo, "es", { numeric: true }));
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Importaciones</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Buscá un código para ver su precio en China, el CBM unitario y el próximo arribo.
        </p>
      </div>

      <EmbarquesTabs active="buscar" enCamino={enCamino} recibidos={recibidos} />

      <form method="get" className="flex gap-2">
        <div className="relative flex-1">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-500"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            name="q"
            defaultValue={q}
            placeholder="Ej: 48108, 54108, 48108-BEI-39…"
            autoFocus
            className="field !pl-11"
          />
        </div>
        <button
          type="submit"
          className="brand-gradient brand-glow rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
        >
          Buscar
        </button>
      </form>

      {q && resultados.length === 0 && (
        <div className="card border-dashed px-6 py-12 text-center">
          <p className="text-zinc-300">
            No se encontró ningún producto con el código{" "}
            <span className="font-semibold text-white">“{q}”</span>.
          </p>
          <p className="mt-1 text-sm text-zinc-500">
            Probá con el código completo o parte de él.
          </p>
        </div>
      )}

      {resultados.length > 0 && (
        <div className="space-y-4">
          {resultados.map((r) => (
            <div key={r.codigo} className="card p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                    Código
                  </p>
                  <p className="text-xl font-bold text-white">{r.codigo}</p>
                </div>

                {/* Próximo arribo, destacado */}
                {r.hasPlanned ? (
                  <div className="rounded-xl border border-teal-500/30 bg-teal-500/10 px-4 py-2.5 text-right">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-teal-300/80">
                      Próximo arribo
                    </p>
                    <p className="text-base font-bold text-teal-200">
                      {r.nextEta ? fmtDate(r.nextEta) : "En camino (sin fecha)"}
                    </p>
                  </div>
                ) : (
                  <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-right">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                      Arribo
                    </p>
                    <p className="text-base font-bold text-zinc-400">
                      No hay arribo planeado
                    </p>
                  </div>
                )}
              </div>

              <div className="mt-4 grid grid-cols-2 gap-4 border-t border-white/10 pt-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                    Precio en China (FOB)
                  </p>
                  <p className="mt-0.5 text-lg font-bold text-white">
                    {fmtUSD(r.precioChina)}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                    CBM unitario
                  </p>
                  <p className="mt-0.5 text-lg font-bold text-white">
                    {fmtCBM(r.cbmUnitario)}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2 border-t border-white/10 pt-4">
                {r.containers.map((c, i) => (
                  <span
                    key={i}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium ${
                      c.received
                        ? "bg-emerald-500/10 text-emerald-300"
                        : "bg-teal-500/10 text-teal-200"
                    }`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${c.received ? "bg-emerald-400" : "bg-teal-400"}`} />
                    {c.name}
                    <span className="text-zinc-500">
                      · {c.received ? "recibido" : c.eta ? fmtDate(c.eta) : "en camino"}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
