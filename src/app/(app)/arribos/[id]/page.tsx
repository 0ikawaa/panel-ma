import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { AUTH_COOKIE, verifySessionToken } from "@/lib/auth";
import { fmtCBM2, fmtDate, fmtInt, fmtUSD } from "@/lib/format";
import ProductTable, { type DetalleLinea } from "@/components/ProductTable";
import UploadExcel from "@/components/UploadExcel";
import DeleteContainerButton from "@/components/DeleteContainerButton";
import EditEtaButton from "@/components/EditEtaButton";
import EditFreightButton from "@/components/EditFreightButton";
import ReceiveButton from "@/components/ReceiveButton";
import OriginSwitch from "@/components/OriginSwitch";

export const dynamic = "force-dynamic";

export default async function ContainerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const token = (await cookies()).get(AUTH_COOKIE)?.value;
  const session = await verifySessionToken(token);
  const canEdit = session?.isAdmin ?? false;

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
    cbmUnitario: p.cbmUnitario,
    cantidadPorCaja: p.cantidadPorCaja,
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
    { label: "CBM total", value: fmtCBM2(cbmTotal), accent: false },
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
        Volver a Embarques
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
          </p>
          {container.notes && (
            <p className="mt-2 max-w-2xl text-sm text-zinc-400">{container.notes}</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ReceiveButton containerId={container.id} received={!!container.receivedAt} />
          {products.length > 0 && (
            <a
              href={`/api/containers/${container.id}/export`}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-zinc-200 transition hover:bg-white/10"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                <path d="M12 4v12m0 0-4-4m4 4 4-4M5 20h14" />
              </svg>
              Exportar Excel
            </a>
          )}
          <UploadExcel containerId={container.id} hasProducts={products.length > 0} />
          <DeleteContainerButton containerId={container.id} containerName={container.name} />
        </div>
      </div>

      {/* Estado y fecha de arribo — destacado */}
      {container.receivedAt ? (
        <div className="flex items-center gap-3 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-5 py-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500 text-white">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-emerald-300/80">
              Recibido en depósito
            </p>
            <p className="text-lg font-bold text-emerald-200">
              {fmtDate(container.receivedAt)}
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-teal-500/30 bg-teal-500/10 px-5 py-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-500 text-white">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
              <path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" />
            </svg>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-teal-300/80">
              Próximo arribo estimado
            </p>
            <p className="text-lg font-bold text-white">
              {container.eta ? fmtDate(container.eta) : "Sin fecha definida"}
            </p>
          </div>
          <div className="ml-auto">
            <EditEtaButton
              containerId={container.id}
              eta={container.eta ? container.eta.toISOString() : null}
            />
          </div>
        </div>
      )}

      {/* Origen del contenedor */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.02] px-5 py-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Origen del contenedor
          </p>
          <p className="text-sm text-zinc-400">
            {container.origin === "brasil"
              ? "Costo nacionalizado = precio origen × 1,15 × 1,22"
              : "Costo nacionalizado con flete + 33% + IVA"}
          </p>
        </div>
        <div className="ml-auto">
          <OriginSwitch containerId={container.id} origin={container.origin} />
        </div>
      </div>

      {/* Costo de flete (solo China) */}
      {container.origin !== "brasil" && (
        <>
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-5 py-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500 text-white">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
                <path d="M10 17h4V5H2v12h3M20 17h1a1 1 0 0 0 1-1v-3.34a1 1 0 0 0-.3-.7l-2.66-2.66a1 1 0 0 0-.7-.3H14v8h1" />
                <circle cx="7.5" cy="17.5" r="1.5" />
                <circle cx="17.5" cy="17.5" r="1.5" />
              </svg>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-amber-300/80">
                Costo de flete del contenedor
              </p>
              <p className="text-lg font-bold text-white">
                {container.freightCost != null
                  ? fmtUSD(container.freightCost)
                  : "Sin definir"}
              </p>
            </div>
            <div className="ml-auto">
              <EditFreightButton
                containerId={container.id}
                freightCost={container.freightCost}
              />
            </div>
          </div>

          {container.freightCost == null && products.length > 0 && (
            <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-300">
              Cargá el costo de flete para ver el <b>costo final nacionalizado</b> de cada producto.
            </div>
          )}
        </>
      )}

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
        <ProductTable
          products={rows}
          freightCost={container.freightCost}
          origin={container.origin}
          canEdit={canEdit}
        />
      )}
    </div>
  );
}
