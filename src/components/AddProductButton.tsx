"use client";

import { useState } from "react";
import type { Origin } from "@/lib/cost";
import ProductFormModal from "./ProductFormModal";

/**
 * Alta manual de un ítem del embarque, para lo que no vino en el Excel. Usa el
 * mismo formulario que la edición.
 */
export default function AddProductButton({
  containerId,
  origin,
  freightCost,
}: {
  containerId: string;
  origin: Origin;
  freightCost: number | null;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-zinc-200 transition hover:bg-white/10"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
          <path d="M12 5v14M5 12h14" />
        </svg>
        Agregar ítem
      </button>

      {open && (
        <ProductFormModal
          containerId={containerId}
          origin={origin}
          freightCost={freightCost}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
