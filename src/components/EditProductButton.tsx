"use client";

import { useState } from "react";
import type { Origin } from "@/lib/cost";
import ProductFormModal from "./ProductFormModal";
import type { ProductRow } from "./ProductTable";

export default function EditProductButton({
  containerId,
  product,
  origin,
  freightCost,
}: {
  containerId: string;
  product: ProductRow;
  origin: Origin;
  freightCost: number | null;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        title="Editar producto"
        className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-white/10 bg-white/5 text-zinc-400 transition hover:bg-white/10 hover:text-white"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
          <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
      </button>

      {open && (
        <ProductFormModal
          containerId={containerId}
          product={product}
          origin={origin}
          freightCost={freightCost}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
