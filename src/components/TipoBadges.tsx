"use client";

// Etiquetas del tipo de envío de una orden de MercadoLibre.
// Se usa en las tablas de Órdenes y en el panel de detalle.

import type { ApiOrder } from "@/lib/tiposOrdenes";

export default function TipoBadges({ o }: { o: ApiOrder }) {
  const badges: { label: string; cls: string }[] = [];
  const lt = o.logisticType;
  if (lt === "self_service") badges.push({ label: "Flex", cls: "bg-sky-500/15 text-sky-200" });
  else if (lt === "fulfillment") badges.push({ label: "Full", cls: "bg-teal-500/15 text-teal-200" });
  else if (lt) badges.push({ label: lt.replace(/_/g, " "), cls: "bg-white/5 text-zinc-300" });
  // Heurística: si el vendedor pagó envío → gratis para el comprador; si no, pago.
  if (o.shipCost && o.shipCost > 0) badges.push({ label: "Pago", cls: "bg-amber-500/15 text-amber-200" });
  else if (lt) badges.push({ label: "Gratis", cls: "bg-emerald-500/15 text-emerald-200" });
  if (badges.length === 0) return <span className="text-xs text-zinc-600">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {badges.map((b, i) => (
        <span key={i} className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${b.cls}`}>{b.label}</span>
      ))}
    </div>
  );
}
