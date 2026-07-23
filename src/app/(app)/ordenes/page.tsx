import OrdenesRealTime from "@/components/OrdenesRealTime";

export const dynamic = "force-dynamic";

export default function OrdenesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Órdenes Real-Time</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Ventas de MercadoLibre en tiempo real, con costo de Odoo (editable), comisión, envío,
          publicidad y margen. Las órdenes con varios ítems (pack) se despliegan.
        </p>
      </div>
      <OrdenesRealTime />
    </div>
  );
}
