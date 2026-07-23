import RentabilidadSku from "@/components/RentabilidadSku";

export const dynamic = "force-dynamic";

export default function RentabilidadPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Rentabilidad por producto</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Qué SKU deja plata y cuál no, cruzando la venta de todos los canales con el costo
          vigente. Incluye el stock parado que no se movió en el período.
        </p>
      </div>
      <RentabilidadSku />
    </div>
  );
}
