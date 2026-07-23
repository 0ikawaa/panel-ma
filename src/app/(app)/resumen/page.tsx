import ResumenVentas from "@/components/ResumenVentas";

export const dynamic = "force-dynamic";

export default function ResumenPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Resumen de Ventas</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Facturación y rentabilidad por canal (MercadoLibre, Mayorista y Local) en el rango
          elegido. Comisión de ML y envío reales; publicidad y comisión de tarjeta del Local
          configurables.
        </p>
      </div>
      <ResumenVentas />
    </div>
  );
}
