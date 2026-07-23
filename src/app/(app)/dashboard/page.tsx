import DashboardPanorama from "@/components/DashboardPanorama";

export const dynamic = "force-dynamic";

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Panorama general de cómo va todo: ventas por canal, importaciones en tránsito y
          reposición sugerida. Entrá a cada sección para el detalle.
        </p>
      </div>
      <DashboardPanorama />
    </div>
  );
}
