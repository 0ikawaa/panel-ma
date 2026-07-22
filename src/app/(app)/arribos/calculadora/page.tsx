import Calculadora from "@/components/Calculadora";

export const dynamic = "force-dynamic";

export default function CalculadoraPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Calculadora</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Calculá a cuánto queda un producto nacionalizado, con la misma lógica de los embarques.
        </p>
      </div>

      <Calculadora />
    </div>
  );
}
