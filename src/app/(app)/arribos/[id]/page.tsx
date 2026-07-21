import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { fmtCBM, fmtDate, fmtInt } from "@/lib/format";
import ProductTable from "@/components/ProductTable";
import UploadExcel from "@/components/UploadExcel";
import DeleteContainerButton from "@/components/DeleteContainerButton";

export const dynamic = "force-dynamic";

export default async function ContainerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const container = await prisma.container.findUnique({
    where: { id },
    include: { products: { orderBy: { rowIndex: "asc" } } },
  });

  if (!container) notFound();

  const products = container.products;
  const cbmTotal = products.reduce((a, p) => a + (p.cbmTotal ?? 0), 0);
  const photos = products.filter((p) => p.photo).length;

  return (
    <div className="space-y-6">
      {/* Migas + volver */}
      <Link
        href="/arribos"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition hover:text-slate-800"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="h-4 w-4">
          <path d="m15 18-6-6 6-6" />
        </svg>
        Volver a Arribos
      </Link>

      {/* Encabezado */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{container.name}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
            {container.supplier && (
              <span className="inline-flex items-center gap-1.5">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} className="h-4 w-4">
                  <path d="M3 21h18M6 21V7l6-4 6 4v14M10 9h4M10 13h4M10 17h4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {container.supplier}
              </span>
            )}
            <span className="inline-flex items-center gap-1.5">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} className="h-4 w-4">
                <path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Arribo: {fmtDate(container.eta)}
            </span>
          </p>
          {container.notes && (
            <p className="mt-2 max-w-2xl text-sm text-slate-500">
              {container.notes}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <UploadExcel containerId={container.id} hasProducts={products.length > 0} />
          <DeleteContainerButton
            containerId={container.id}
            containerName={container.name}
          />
        </div>
      </div>

      {/* Estadísticas del contenedor */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Productos
          </p>
          <p className="mt-1 text-2xl font-bold text-slate-900">
            {fmtInt(products.length)}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            CBM total
          </p>
          <p className="mt-1 text-2xl font-bold text-indigo-600">
            {fmtCBM(cbmTotal)}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Fotos
          </p>
          <p className="mt-1 text-2xl font-bold text-slate-900">
            {fmtInt(photos)}
          </p>
        </div>
      </div>

      {/* Tabla o estado vacío */}
      {products.length === 0 ? (
        <div className="flex flex-col items-center rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
          <div className="brand-gradient mb-4 flex h-16 w-16 items-center justify-center rounded-2xl text-white shadow-lg">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8">
              <path d="M12 16V4M7 9l5-5 5 5M5 20h14" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-slate-900">
            Subí el Excel de este contenedor
          </h2>
          <p className="mt-1 max-w-md text-sm text-slate-500">
            Con las columnas Foto, Código, Precio China, Cantidad por caja, CBM
            unitario y CBM total. Las fotos incrustadas se extraen
            automáticamente.
          </p>
          <div className="mt-6">
            <UploadExcel containerId={container.id} hasProducts={false} />
          </div>
        </div>
      ) : (
        <ProductTable products={products} />
      )}
    </div>
  );
}
