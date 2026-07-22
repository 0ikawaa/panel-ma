import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { fmtCBM, fmtDate, fmtInt, fmtUSD } from "@/lib/format";
import ProductTable, { type DetalleLinea } from "@/components/ProductTable";
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
  const unidades = products.reduce((a, p) => a + (p.unidades ?? 0), 0);

  const rows = products.map((p) => ({
    id: p.id,
    rowIndex: p.rowIndex,
    photo: p.photo,
    codigo: p.codigo,
    precioChina: p.precioChina,
    unidades: p.unidades,
    montoTotal: p.montoTotal,
    unidad: p.unidad,
    remark: p.remark,
    cbmTotal: p.cbmTotal,
    detalle: (p.detalle as DetalleLinea[] | null) ?? [],
  }));

  const stats = [
    { label: "Ítems", value: fmtInt(products.length), accent: false },
    { label: "Unidades", value: fmtInt(unidades), accent: false },
    { label: "CBM total", value: fmtCBM(cbmTotal), accent: false },
    {
      label: "Precio del contenedor",
      value: fmtUSD(container.totalPrice),
      accent: true,
    },
  ];

  return (
    <div className="space-y-6">
      <Link
        href="/arribos"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-400 transition hover:text-white"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="h-4 w-4">
          <path d="m15 18-6-6 6-6" />
        </svg>
        Volver a Arribos
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">{container.name}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-zinc-400">
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
            <p className="mt-2 max-w-2xl text-sm text-zinc-400">{container.notes}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <UploadExcel containerId={container.id} hasProducts={products.length > 0} />
          <DeleteContainerButton containerId={container.id} containerName={container.name} />
        </div>
      </div>

      {/* Estadísticas del contenedor */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <div
            key={s.label}
            className={
              s.accent
                ? "brand-gradient brand-glow rounded-2xl p-4 text-white"
                : "card p-4"
            }
          >
            <p
              className={`text-xs font-medium uppercase tracking-wide ${s.accent ? "text-white/80" : "text-zinc-500"}`}
            >
              {s.label}
            </p>
            <p
              className={`mt-1 text-2xl font-bold ${s.accent ? "text-white" : "text-white"}`}
            >
              {s.value}
            </p>
          </div>
        ))}
      </div>

      {products.length === 0 ? (
        <div className="card flex flex-col items-center border-dashed px-6 py-16 text-center">
          <div className="brand-gradient brand-glow mb-4 flex h-16 w-16 items-center justify-center rounded-2xl text-white">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8">
              <path d="M12 16V4M7 9l5-5 5 5M5 20h14" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-white">Subí el Excel de este contenedor</h2>
          <p className="mt-1 max-w-md text-sm text-zinc-400">
            Con las columnas Foto, MA Code, FOB, Quantity, CBM y Amount. Las fotos
            incrustadas se extraen automáticamente y los ítems con varias líneas se
            agrupan solos.
          </p>
          <div className="mt-6">
            <UploadExcel containerId={container.id} hasProducts={false} />
          </div>
        </div>
      ) : (
        <ProductTable products={rows} />
      )}
    </div>
  );
}
