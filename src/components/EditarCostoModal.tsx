"use client";

// Modal para pisar el costo unitario de un SKU.
//
// La API MUNDO SHOP es de solo lectura, así que el costo editado acá se guarda
// en la base propia (`CostOverride`) y manda por sobre el `standard_price` de
// Odoo para ese SKU en todas las órdenes.

export interface CostoEnEdicion {
  sku: string;
  title: string;
  current: number | null;
}

export default function EditarCostoModal({
  edit,
  value,
  onValueChange,
  error,
  loading,
  onCancel,
  onSave,
}: {
  edit: CostoEnEdicion;
  value: string;
  onValueChange: (v: string) => void;
  error: string | null;
  loading: boolean;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !loading && onCancel()} />
      <div className="animate-in card relative w-full max-w-sm border-white/10 p-6 shadow-2xl">
        <h2 className="mb-1 text-lg font-bold text-white">Costo del producto</h2>
        <p className="mb-1 text-sm text-zinc-400">
          SKU <span className="font-mono text-zinc-200">{edit.sku || "—"}</span>
        </p>
        <p className="mb-4 line-clamp-2 text-xs text-zinc-500">{edit.title}</p>
        <label className="mb-1 block text-xs font-medium text-zinc-500">Costo unitario (pesos)</label>
        <input type="number" min={0} step="0.01" value={value} onChange={(e) => onValueChange(e.target.value)} className="field" autoFocus placeholder="0" />
        <p className="mt-2 text-xs text-zinc-500">Pisa al costo de Odoo para este SKU en todas las órdenes.</p>
        {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onCancel} disabled={loading} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-zinc-300 transition hover:bg-white/5">Cancelar</button>
          <button onClick={onSave} disabled={loading} className="brand-gradient brand-glow rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60">
            {loading ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}
