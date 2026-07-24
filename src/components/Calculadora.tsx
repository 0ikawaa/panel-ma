"use client";

import { useState } from "react";
import { fmtUSD } from "@/lib/format";
import {
  landedCost,
  IVA,
  CBM_POR_CONTENEDOR,
  INCIDENCIA_CHINA,
  INCIDENCIA_BRASIL,
  type Origin,
} from "@/lib/cost";

function parse(v: string): number | null {
  const s = v.trim();
  if (s === "") return null;
  const n = Number(s.replace(",", "."));
  return isFinite(n) ? n : null;
}

export default function Calculadora() {
  const [origin, setOrigin] = useState<Origin>("china");
  const [costo, setCosto] = useState("");
  const [cbm, setCbm] = useState("");
  const [flete, setFlete] = useState("");
  const [ganancia, setGanancia] = useState("");

  const fob = parse(costo);
  const cbmU = parse(cbm);
  const freight = parse(flete);
  const lc = landedCost(origin, fob, cbmU, freight);

  const gananciaPct = parse(ganancia);
  const precioVentaNeto = lc && gananciaPct != null ? lc.nacionalizado * (1 + gananciaPct / 100) : null;
  const gananciaUSD = lc && precioVentaNeto != null ? precioVentaNeto - lc.nacionalizado : null;
  const precioVentaIva = precioVentaNeto != null ? precioVentaNeto * IVA : null;

  const faltan =
    origin === "china"
      ? [
          fob == null ? "el costo FOB" : null,
          cbmU == null ? "el CBM unitario" : null,
          freight == null ? "el costo de flete" : null,
        ].filter(Boolean)
      : [fob == null ? "el costo de origen" : null].filter(Boolean);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Entradas */}
      <div className="card space-y-5 p-4 sm:p-6">
        <div>
          <label className="mb-2 block text-sm font-medium text-zinc-300">Origen</label>
          <div className="grid grid-cols-2 gap-2">
            {(["china", "brasil"] as const).map((o) => (
              <button
                key={o}
                type="button"
                onClick={() => setOrigin(o)}
                className={`rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${
                  origin === o
                    ? "border-teal-500/40 bg-teal-500/15 text-teal-200"
                    : "border-white/10 bg-white/[0.02] text-zinc-400 hover:bg-white/5"
                }`}
              >
                {o === "china" ? "🇨🇳 China" : "🇧🇷 Brasil"}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-300">
            Costo del producto en {origin === "china" ? "China (FOB)" : "Brasil"} (US$)
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={costo}
            onChange={(e) => setCosto(e.target.value)}
            placeholder="0.00"
            className="field"
            autoFocus
          />
        </div>

        {origin === "china" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-300">CBM unitario (m³)</label>
              <input
                type="number"
                step="0.0001"
                min="0"
                value={cbm}
                onChange={(e) => setCbm(e.target.value)}
                placeholder="0.0000"
                className="field"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-300">Flete del contenedor (US$)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={flete}
                onChange={(e) => setFlete(e.target.value)}
                placeholder="0.00"
                className="field"
              />
            </div>
          </div>
        )}

        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-300">Ganancia que querés marcar (%)</label>
          <input
            type="number"
            step="0.1"
            min="0"
            value={ganancia}
            onChange={(e) => setGanancia(e.target.value)}
            placeholder="0"
            className="field"
          />
        </div>

        <p className="rounded-xl border border-white/10 bg-white/[0.02] px-3.5 py-2.5 text-xs text-zinc-400">
          {origin === "china" ? (
            <>
              Fórmula: (FOB + flete unitario) × {INCIDENCIA_CHINA} × {IVA}, con flete unitario ={" "}
              (flete ÷ {CBM_POR_CONTENEDOR} CBM) × CBM unitario.
            </>
          ) : (
            <>Fórmula: costo origen × {INCIDENCIA_BRASIL} × {IVA} (IVA incluido).</>
          )}
        </p>
      </div>

      {/* Resultado */}
      <div className="card flex flex-col p-4 sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Costo final por unidad (nacionalizado)
        </p>

        {lc ? (
          <>
            <p className="mt-2 text-4xl font-bold text-teal-300">{fmtUSD(lc.nacionalizado)}</p>

            <div className="mt-6 space-y-2.5 border-t border-white/10 pt-5 text-sm">
              {origin === "china" ? (
                <>
                  <Row label="FOB" value={fmtUSD(lc.fob)} />
                  <Row label="+ Flete unitario" value={fmtUSD(lc.fleteUnitario)} />
                  <Row label="= Base" value={fmtUSD(lc.base)} strong />
                  <Row label={`× ${lc.incidencia} (nacionalización)`} value={fmtUSD(lc.nacionalizado)} strong accent />
                  <Row label={`+ IVA (${IVA})`} value={`(${fmtUSD(lc.final)} IVA inc.)`} />
                </>
              ) : (
                <>
                  <Row label="Precio origen" value={fmtUSD(lc.fob)} />
                  <Row label={`× ${lc.incidencia} (nacionalización)`} value={fmtUSD(lc.nacionalizado)} strong accent />
                  <Row label={`+ IVA (${IVA})`} value={`(${fmtUSD(lc.final)} IVA inc.)`} />
                </>
              )}
            </div>

            {precioVentaNeto != null && gananciaPct != null && (
              <div className="mt-5 space-y-2.5 border-t border-white/10 pt-5 text-sm">
                <Row label={`+ Ganancia (${gananciaPct}%)`} value={fmtUSD(gananciaUSD!)} />
                <div className="mt-3 rounded-xl border border-teal-500/30 bg-teal-500/10 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-teal-400/80">
                    Precio de venta sugerido
                  </p>
                  <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <p className="text-3xl font-bold text-teal-200">{fmtUSD(precioVentaNeto)}</p>
                    <p className="text-sm text-teal-400/80">+ IVA ({fmtUSD(precioVentaIva!)} IVA inc.)</p>
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center py-8 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-white/5 text-zinc-500">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
                <rect x="4" y="2" width="16" height="20" rx="2" />
                <path d="M8 6h8M8 10h8M8 14h3M8 18h3" />
              </svg>
            </div>
            <p className="text-sm text-zinc-400">
              Completá {faltan.join(", ").replace(/, ([^,]*)$/, " y $1")} para ver el costo final.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  strong,
  accent,
}: {
  label: string;
  value: string;
  strong?: boolean;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className={`${accent ? "text-teal-300" : "text-zinc-400"}`}>{label}</span>
      <span
        className={`tabular-nums ${
          accent ? "font-bold text-teal-200" : strong ? "font-semibold text-white" : "text-zinc-200"
        }`}
      >
        {value}
      </span>
    </div>
  );
}
