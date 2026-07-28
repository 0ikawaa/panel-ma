"use client";

// Panel lateral con el detalle de una orden de MercadoLibre: qué se vendió, a
// cuánto, qué se llevó la plataforma, cómo quedó el envío y cuánta utilidad
// sobró. Se abre al tocar una fila en la pantalla de Órdenes.
//
// No tiene estado propio: recibe la orden y las funciones de cálculo de la
// pantalla, así que los números que muestra son exactamente los de la tabla.

import { fmtPeso, fmtPesoSigned } from "@/lib/format";
import { fmtFechaLargaMl } from "@/lib/fechaVentas";
import type { ApiItem, ApiOrder, MetricasOrden } from "@/lib/tiposOrdenes";
import ProductThumb from "./ProductThumb";
import TipoBadges from "./TipoBadges";

export default function OrdenDetallePanel({
  detail,
  metrics,
  effCost,
  publiPct,
  onClose,
  onEditCost,
}: {
  detail: ApiOrder;
  metrics: (o: ApiOrder) => MetricasOrden;
  effCost: (it: ApiItem) => number | null;
  publiPct: number;
  onClose: () => void;
  onEditCost: (sku: string, title: string, current: number | null) => void;
}) {
  const m = metrics(detail);
  const plataforma = m.comision + m.publi;
  const margenProd = m.venta - m.costo;
  const util = Math.max(0, m.margen);
  const totalSeg = m.costo + plataforma + util || 1;
  const wCosto = (m.costo / totalSeg) * 100;
  const wPlat = (plataforma / totalSeg) * 100;
  const wUtil = (util / totalSeg) * 100;
  const pctOf = (v: number) => (m.venta ? Math.round((v / m.venta) * 100) : 0);
  const mlUrl = `https://www.mercadolibre.com.uy/ventas/${detail.orderId}/detalle`;

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-stretch sm:justify-end">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="animate-in relative max-h-[90vh] w-full overflow-y-auto rounded-t-2xl border-t border-white/10 bg-[#131319] shadow-2xl sm:h-full sm:max-h-none sm:max-w-[420px] sm:rounded-none sm:border-l sm:border-t-0">
        <div className="sticky top-0 z-10 border-b border-white/10 bg-[#131319]/95 backdrop-blur">
          <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-white/20 sm:hidden" />
          <div className="flex items-center justify-between px-4 py-3 sm:px-5 sm:py-4">
            <h2 className="text-lg font-bold text-white">Detalle</h2>
            <button onClick={onClose} className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-white/10 hover:text-white" aria-label="Cerrar">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5"><path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" /></svg>
            </button>
          </div>
        </div>

        <div className="space-y-6 px-4 py-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:px-5">
          {/* PRODUCTO */}
          <Section label="Producto">
            {detail.items.map((it, i) => (
              <div key={it.itemId || i} className="mb-1.5 flex items-start gap-3">
                <ProductThumb src={it.photo} alt={it.sku} size={52} />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold leading-snug text-zinc-100">{it.title || "—"}</div>
                  <div className="mt-0.5 text-xs text-zinc-500">
                    {it.sku || "sin SKU"}{it.qty > 1 ? ` · ${it.qty} u.` : ""}
                  </div>
                </div>
              </div>
            ))}
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
              <span>Orden #{detail.orderId}</span>
              <a href={mlUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 font-medium text-teal-300 hover:text-teal-200">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-3.5 w-3.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3" strokeLinecap="round" strokeLinejoin="round" /></svg>
                Ver venta en ML
              </a>
            </div>
          </Section>

          {/* VENTA */}
          <Section label="Venta">
            <DetailRow label="Precio" value={fmtPeso(m.venta)} strong />
            <DetailRow label="Fecha" value={fmtFechaLargaMl(detail.date)} />
          </Section>

          {/* COSTO PRODUCTO */}
          <Section label="Costo producto">
            {detail.items.map((it, i) => {
              const c = effCost(it);
              return (
                <div key={it.itemId || i} className="flex items-center justify-between py-0.5">
                  <span className="text-zinc-400">Costo unit.{detail.items.length > 1 && it.sku ? ` · ${it.sku}` : ""}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); onEditCost(it.sku, it.title, c); }}
                    className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 transition hover:bg-white/10"
                    title="Editar costo del SKU"
                  >
                    <span className={`tabular-nums font-semibold ${c == null ? "text-amber-300" : "text-zinc-100"}`}>{c == null ? "sin costo" : fmtPeso(c)}</span>
                    <span className="flex h-5 w-5 items-center justify-center rounded bg-teal-500/15 text-teal-300">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-3 w-3"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </span>
                  </button>
                </div>
              );
            })}
            <div className="mt-2 border-t border-white/10 pt-2">
              <DetailRow label="Margen producto" value={`${fmtPeso(margenProd)} (${pctOf(margenProd)}%)`} tone={margenProd < 0 ? "red" : "green"} strong />
            </div>
            {!m.hasCost && (
              <p className="mt-1.5 text-xs text-amber-300/90">Costo incompleto: la utilidad es estimada.</p>
            )}
          </Section>

          {/* PLATAFORMA ML */}
          <Section label="Plataforma ML">
            <DetailRow label="Comisión" value={m.comision ? "-" + fmtPeso(m.comision) : "$0"} tone="red" />
            {m.publi > 0 && <DetailRow label={`Publicidad (${publiPct}%)`} value={"-" + fmtPeso(m.publi)} tone="red" />}
          </Section>

          {/* ENVÍO */}
          <Section label="Envío">
            <div className="flex items-center justify-between py-0.5">
              <span className="text-zinc-400">Tipo</span>
              <TipoBadges o={detail} />
            </div>
            <DetailRow label="ML te pasa" value={fmtPesoSigned(detail.shipSave ?? 0)} tone={(detail.shipSave ?? 0) >= 0 ? "green" : "red"} />
            <DetailRow label="Cadete" value={detail.shipCost ? "-" + fmtPeso(detail.shipCost) : "$0"} tone="red" />
            <div className="mt-2 border-t border-white/10 pt-2">
              <DetailRow label="Neto envío" value={fmtPesoSigned(m.envio)} tone={m.envio < 0 ? "red" : "green"} strong />
            </div>
          </Section>

          {/* RESULTADO */}
          <Section label="Resultado">
            <DetailRow label="Venta" value={fmtPeso(m.venta)} />
            <DetailRow label="Margen producto" value={fmtPeso(margenProd)} tone={margenProd < 0 ? "red" : "green"} />
            <DetailRow label="Plataforma" value={plataforma ? "-" + fmtPeso(plataforma) : "$0"} tone="red" />
            <DetailRow label="Envío neto" value={fmtPesoSigned(m.envio)} tone={m.envio < 0 ? "red" : "green"} />
            <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-3">
              <span className="text-base font-bold text-white">UTILIDAD</span>
              <span className={`text-xl font-bold tabular-nums ${m.margen < 0 ? "text-red-400" : "text-emerald-400"}`}>
                {fmtPeso(m.margen)} <span className="text-sm">({(m.pct * 100).toFixed(0)}%)</span>
              </span>
            </div>
            <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-white/5">
              <div style={{ width: `${wCosto}%` }} className="bg-red-500/70" />
              <div style={{ width: `${wPlat}%` }} className="bg-amber-500/70" />
              <div style={{ width: `${wUtil}%` }} className="bg-emerald-500/70" />
            </div>
            <div className="mt-1.5 flex justify-between text-[11px] font-medium">
              <span className="text-red-400">Costo {pctOf(m.costo)}%</span>
              <span className="text-amber-300">ML {pctOf(plataforma)}%</span>
              <span className="text-emerald-400">Utilidad {pctOf(m.margen)}%</span>
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-teal-400">{label}</div>
      <div className="space-y-0.5 text-sm">{children}</div>
    </section>
  );
}

function DetailRow({ label, value, tone, strong }: { label: string; value: string; tone?: "red" | "green"; strong?: boolean }) {
  const color = tone === "red" ? "text-red-400" : tone === "green" ? "text-emerald-400" : "text-zinc-100";
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-zinc-400">{label}</span>
      <span className={`tabular-nums ${strong ? "font-bold" : "font-medium"} ${color}`}>{value}</span>
    </div>
  );
}
