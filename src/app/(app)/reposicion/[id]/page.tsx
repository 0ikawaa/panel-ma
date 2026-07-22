import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { fmtDate, fmtInt } from "@/lib/format";
import {
  combinarReposicion,
  type VentaItem,
  type StockItem,
} from "@/lib/reposicion";
import UploadReposicionExcel from "@/components/UploadReposicionExcel";
import ReposicionTable from "@/components/ReposicionTable";
import DeleteReposicionButton from "@/components/DeleteReposicionButton";
import EditMesesButton from "@/components/EditMesesButton";

export const dynamic = "force-dynamic";

export default async function ReposicionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const repo = await prisma.reposicion.findUnique({ where: { id } });
  if (!repo) notFound();

  const ventas = (repo.ventas as unknown as VentaItem[] | null) ?? null;
  const stock = (repo.stock as unknown as StockItem[] | null) ?? null;
  const bothLoaded = !!ventas && !!stock;

  const rows = bothLoaded ? combinarReposicion(ventas, stock, repo.meses) : [];
  const totalReponer = rows.reduce((a, r) => a + r.sugerida, 0);

  return (
    <div className="space-y-6">
      <Link
        href="/reposicion"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-400 transition hover:text-white"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="h-4 w-4">
          <path d="m15 18-6-6 6-6" />
        </svg>
        Volver a Reposición
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">{repo.name}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 text-sm text-zinc-400">
            {repo.periodo && <span>Período: {repo.periodo}</span>}
            <span>Creado {fmtDate(repo.createdAt)}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <EditMesesButton reposicionId={repo.id} meses={repo.meses} />
          <DeleteReposicionButton reposicionId={repo.id} name={repo.name} />
        </div>
      </div>

      {/* Subidas */}
      <div className="grid gap-3 sm:grid-cols-2">
        <UploadReposicionExcel
          reposicionId={repo.id}
          tipo="ventas"
          loaded={!!ventas}
          count={ventas?.length}
        />
        <UploadReposicionExcel
          reposicionId={repo.id}
          tipo="stock"
          loaded={!!stock}
          count={stock?.length}
        />
      </div>

      {bothLoaded ? (
        <>
          {/* Resumen */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
            <div className="card p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Códigos con ventas</p>
              <p className="mt-1 text-2xl font-bold text-white">{fmtInt(rows.length)}</p>
            </div>
            <div className="card p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Meses a cubrir</p>
              <p className="mt-1 text-2xl font-bold text-white">{repo.meses}</p>
            </div>
            <div className="brand-gradient brand-glow col-span-2 rounded-2xl p-4 text-white lg:col-span-1">
              <p className="text-xs font-medium uppercase tracking-wide text-white/80">Total a reponer</p>
              <p className="mt-1 text-2xl font-bold">{fmtInt(totalReponer)} u.</p>
            </div>
          </div>

          <ReposicionTable rows={rows} meses={repo.meses} />
        </>
      ) : (
        <div className="card flex flex-col items-center border-dashed px-6 py-12 text-center">
          <div className="brand-gradient brand-glow mb-4 flex h-14 w-14 items-center justify-center rounded-2xl text-white">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7">
              <path d="M3 3v18h18M7 14l3-3 3 3 5-6" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-white">Subí los dos Excels</h2>
          <p className="mt-1 max-w-md text-sm text-zinc-400">
            Necesito el Excel de <b>ventas del mes</b> y el de <b>stock actual</b> para
            cruzarlos por código y sugerir la reposición.
          </p>
        </div>
      )}
    </div>
  );
}
