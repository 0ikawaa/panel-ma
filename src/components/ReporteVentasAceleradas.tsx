"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fmtInt, fmtDateTime } from "@/lib/format";
import type { VentasAceleradasItem, VentasAceleradasParams } from "@/lib/reportes";

type Config = { enabled: boolean; whatsappTo: string | null; params: VentasAceleradasParams };
type Summary = { total: number; sinReposicion: number; unidadesSugeridas: number };

function fmtDec(n: number, dec = 1): string {
  return n.toLocaleString("es-UY", { minimumFractionDigits: 0, maximumFractionDigits: dec });
}

// Traduce el estado técnico del envío a algo legible.
function waLabel(status: string | null | undefined): { text: string; tone: "ok" | "warn" | "err" | "muted" } {
  if (!status) return { text: "—", tone: "muted" };
  if (status === "sent") return { text: "Enviado por WhatsApp ✓", tone: "ok" };
  if (status === "partial") return { text: "Enviado a algunos destinatarios", tone: "warn" };
  if (status.startsWith("error:")) return { text: "Error al enviar: " + status.slice(6), tone: "err" };
  if (status === "skipped:sin-config")
    return { text: "WhatsApp sin configurar (falta el token de Meta)", tone: "warn" };
  if (status === "skipped:sin-destino") return { text: "Falta cargar el número destino", tone: "warn" };
  if (status === "skipped:deshabilitado") return { text: "Envío automático desactivado", tone: "muted" };
  if (status === "skipped:sin-riesgo") return { text: "Sin riesgo: no se envió", tone: "muted" };
  if (status.startsWith("skipped:")) return { text: "No enviado (" + status.slice(8) + ")", tone: "muted" };
  return { text: status, tone: "muted" };
}

const toneClass: Record<string, string> = {
  ok: "text-teal-300",
  warn: "text-amber-300",
  err: "text-red-300",
  muted: "text-zinc-500",
};

export default function ReporteVentasAceleradas() {
  const [items, setItems] = useState<VentasAceleradasItem[]>([]);
  const [summary, setSummary] = useState<Summary>({ total: 0, sinReposicion: 0, unidadesSugeridas: 0 });
  const [config, setConfig] = useState<Config | null>(null);
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);
  const [lastTrigger, setLastTrigger] = useState<string | null>(null);
  const [waStatus, setWaStatus] = useState<string | null>(null);
  const [waTo, setWaTo] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sending, setSending] = useState(false);
  const [savingCfg, setSavingCfg] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [live, setLive] = useState(false); // true = datos recién generados en vivo

  const [showCfg, setShowCfg] = useState(false);
  const [numero, setNumero] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [p, setP] = useState<VentasAceleradasParams | null>(null);

  // Carga inicial: última corrida persistida + config (rápido, sin API externa).
  const loadLatest = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/reportes/ventas-aceleradas/latest", { cache: "no-store" });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || `Error ${res.status}`);
      const cfg: Config = j.config;
      setConfig(cfg);
      setNumero(cfg.whatsappTo ?? "");
      setEnabled(cfg.enabled);
      setP(cfg.params);
      if (j.run) {
        setItems((j.run.items as VentasAceleradasItem[]) ?? []);
        setSummary(j.run.summary as Summary);
        setLastRunAt(j.run.createdAt);
        setLastTrigger(j.run.trigger);
        setWaStatus(j.run.whatsappStatus);
        setWaTo(j.run.whatsappTo);
        setLive(false);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLatest();
  }, [loadLatest]);

  // Genera el reporte en vivo (no persiste, no envía).
  async function refresh() {
    setRefreshing(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/reportes/ventas-aceleradas", {
        cache: "no-store",
        signal: AbortSignal.timeout(60000),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || `Error ${res.status}`);
      setItems(j.report.items);
      setSummary(j.report.summary);
      setConfig(j.config);
      setLastRunAt(j.report.generadoEn);
      setLastTrigger("en vivo");
      setLive(true);
    } catch (e) {
      const err = e as Error;
      setError(err.name === "TimeoutError" ? "La consulta tardó demasiado (timeout)." : err.message);
    } finally {
      setRefreshing(false);
    }
  }

  // Corre + persiste + envía por WhatsApp ahora.
  async function enviarAhora() {
    setSending(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/reportes/ventas-aceleradas/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ send: true }),
        signal: AbortSignal.timeout(60000),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || `Error ${res.status}`);
      setItems(j.report.items);
      setSummary(j.report.summary);
      setLastRunAt(j.runAt);
      setLastTrigger("manual");
      setWaStatus(j.whatsapp.status);
      setWaTo(j.whatsapp.to);
      setLive(false);
      const lbl = waLabel(j.whatsapp.status);
      setNotice(lbl.tone === "ok" ? "Reporte enviado por WhatsApp." : "Reporte generado. " + lbl.text);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  async function guardarConfig() {
    setSavingCfg(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/reportes/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ whatsappTo: numero, enabled, params: p }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || `Error ${res.status}`);
      setConfig(j.config);
      setNumero(j.config.whatsappTo ?? "");
      setNotice("Configuración guardada.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSavingCfg(false);
    }
  }

  const wa = waLabel(waStatus);
  const setParam = (k: keyof VentasAceleradasParams, v: number) =>
    setP((prev) => (prev ? { ...prev, [k]: v } : prev));

  const ventanaDias = config?.params.ventanaDias ?? 30;

  const empty = !loading && items.length === 0;
  const sortedInfo = useMemo(() => (live ? "Generado en vivo" : lastTrigger === "cron" ? "Envío automático" : lastTrigger === "manual" ? "Corrida manual" : lastTrigger ?? ""), [live, lastTrigger]);

  return (
    <div className="space-y-4">
      {/* ---------- Barra de acciones ---------- */}
      <div className="card flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
        <div className="min-w-0 text-sm text-zinc-400">
          {lastRunAt ? (
            <>
              <span className="text-zinc-300">{sortedInfo}</span> · {fmtDateTime(lastRunAt)}
              {waStatus && (
                <>
                  {" · "}
                  <span className={toneClass[wa.tone]}>{wa.text}</span>
                  {waTo && wa.tone === "ok" ? <span className="text-zinc-500"> ({waTo})</span> : null}
                </>
              )}
            </>
          ) : (
            <span className="text-zinc-500">Todavía no se generó ninguna corrida.</span>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            onClick={refresh}
            disabled={refreshing || sending}
            className="rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm font-semibold text-zinc-200 transition hover:bg-white/10 disabled:opacity-60"
          >
            {refreshing ? "Generando…" : "Actualizar"}
          </button>
          <a
            href="/api/reportes/ventas-aceleradas/export"
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm font-semibold text-zinc-200 transition hover:bg-white/10"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 21h16" />
            </svg>
            Excel
          </a>
          <button
            onClick={enviarAhora}
            disabled={sending || refreshing}
            className="brand-gradient brand-glow inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z" />
            </svg>
            {sending ? "Enviando…" : "Enviar por WhatsApp"}
          </button>
        </div>
      </div>

      {error && <div className="rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2.5 text-sm text-red-300">{error}</div>}
      {notice && <div className="rounded-xl border border-teal-500/25 bg-teal-500/10 px-3 py-2.5 text-sm text-teal-200">{notice}</div>}

      {/* ---------- KPIs ---------- */}
      <div className="grid grid-cols-3 gap-3">
        <Kpi label="SKUs en riesgo" value={fmtInt(summary.total)} accent />
        <Kpi label="Sin reposición en camino" value={fmtInt(summary.sinReposicion)} />
        <Kpi label="Unidades sugeridas" value={fmtInt(summary.unidadesSugeridas)} />
      </div>

      {/* ---------- Config ---------- */}
      <div className="card overflow-hidden">
        <button
          onClick={() => setShowCfg((v) => !v)}
          className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold text-zinc-200 transition hover:bg-white/[0.03]"
        >
          <span className="flex items-center gap-2">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-zinc-400">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
            </svg>
            Configuración y envío automático
          </span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={`h-4 w-4 transition-transform ${showCfg ? "rotate-90" : ""}`}>
            <path d="m9 18 6-6-6-6" />
          </svg>
        </button>
        {showCfg && p && (
          <div className="space-y-4 border-t border-white/10 p-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <div>
                <label className="mb-1 block text-[11px] font-medium text-zinc-500">Número(s) de WhatsApp (con código de país)</label>
                <input
                  value={numero}
                  onChange={(e) => setNumero(e.target.value)}
                  placeholder="59899123456"
                  inputMode="tel"
                  className="field text-sm"
                />
                <p className="mt-1 text-[11px] text-zinc-500">Ej: 598 + celular sin el 0. Podés poner varios separados por coma.</p>
              </div>
              <label className="flex items-center gap-3 lg:pt-6">
                <button
                  type="button"
                  onClick={() => setEnabled((v) => !v)}
                  className={`relative h-6 w-11 shrink-0 rounded-full transition ${enabled ? "bg-teal-500" : "bg-white/15"}`}
                >
                  <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${enabled ? "left-[22px]" : "left-0.5"}`} />
                </button>
                <span className="text-sm text-zinc-300">
                  Envío automático diario (9:00 AM Uruguay)
                  <span className="block text-[11px] text-zinc-500">Si está activo, el cron manda el reporte cada mañana cuando hay SKUs en riesgo.</span>
                </span>
              </label>
            </div>

            <div>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Umbrales de detección</div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <NumField label="Ventana reciente (días)" value={p.ventanaDias} onChange={(v) => setParam("ventanaDias", v)} />
                <NumField label="Histórico previo (días)" value={p.baseDias} onChange={(v) => setParam("baseDias", v)} />
                <NumField label="Aceleración mínima (×)" value={p.ratioMin} step={0.1} onChange={(v) => setParam("ratioMin", v)} />
                <NumField label="Cobertura máx. (días)" value={p.coberturaMax} onChange={(v) => setParam("coberturaMax", v)} />
                <NumField label="Mín. unidades vendidas" value={p.minUnidades} onChange={(v) => setParam("minUnidades", v)} />
                <NumField label="Objetivo cobertura (días)" value={p.objetivoDias} onChange={(v) => setParam("objetivoDias", v)} />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2">
              <button onClick={loadLatest} className="rounded-lg px-3 py-2 text-sm text-zinc-400 transition hover:text-white">Deshacer</button>
              <button
                onClick={guardarConfig}
                disabled={savingCfg}
                className="brand-gradient rounded-xl px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
              >
                {savingCfg ? "Guardando…" : "Guardar configuración"}
              </button>
            </div>
          </div>
        )}
      </div>

      {empty ? (
        <div className="card px-4 py-12 text-center">
          <p className="text-sm text-zinc-300">✅ No hay SKUs en riesgo de quiebre.</p>
          <p className="mt-1 text-xs text-zinc-500">
            Con los umbrales actuales, el stock cubre la demanda de todos los productos. Tocá
            «Actualizar» para recalcular con los datos de hoy.
          </p>
        </div>
      ) : (
        <>
          {/* ---------- Cards (celular) ---------- */}
          <div className="space-y-2.5 lg:hidden">
            {items.map((r) => (
              <MobileCard key={r.sku} r={r} />
            ))}
          </div>

          {/* ---------- Tabla (desktop) ---------- */}
          <div className="card hidden overflow-x-auto lg:block">
            <table className="w-full border-collapse text-sm">
              <thead className="border-b border-white/10 bg-white/[0.03] text-xs uppercase tracking-wide text-zinc-400">
                <tr>
                  <th className="px-3 py-3 text-left font-semibold">Código</th>
                  <th className="px-3 py-3 text-left font-semibold">Título</th>
                  <th className="px-3 py-3 text-right font-semibold">u/día ({ventanaDias}d)</th>
                  <th className="px-3 py-3 text-right font-semibold text-teal-300">Aceleración</th>
                  <th className="px-3 py-3 text-right font-semibold">Stock</th>
                  <th className="px-3 py-3 text-right font-semibold">En camino</th>
                  <th className="px-3 py-3 text-right font-semibold">Cobertura</th>
                  <th className="px-3 py-3 text-right font-semibold">Pedir</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {items.map((r) => (
                  <tr key={r.sku} className="transition hover:bg-white/[0.03]">
                    <td className="whitespace-nowrap px-3 py-2.5 font-mono font-medium text-zinc-100">{r.sku}</td>
                    <td className="max-w-[260px] truncate px-3 py-2.5 text-zinc-300" title={r.titulo ?? ""}>
                      {r.titulo ?? <span className="text-zinc-600">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-zinc-200">{fmtDec(r.velReciente, 1)}</td>
                    <td className="px-3 py-2.5 text-right"><Accel r={r} /></td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-zinc-300">
                      {r.stock === null ? <span className="text-zinc-600">—</span> : fmtInt(r.stock)}
                    </td>
                    <td className={`px-3 py-2.5 text-right tabular-nums ${r.enCamino > 0 ? "text-sky-300" : "text-zinc-600"}`}>
                      {r.enCamino > 0 ? fmtInt(r.enCamino) : "sin repo"}
                    </td>
                    <td className="px-3 py-2.5 text-right"><Cobertura dias={r.diasCobertura} /></td>
                    <td className="px-3 py-2.5 text-right font-bold tabular-nums text-teal-300">{fmtInt(r.sugerido)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <p className="px-1 text-xs leading-relaxed text-zinc-500">
        Se marca un código cuando: vendió al menos <b>{config?.params.minUnidades ?? 5}</b> unidades en los últimos{" "}
        <b>{ventanaDias}</b> días, su velocidad actual es al menos <b>{fmtDec(config?.params.ratioMin ?? 1.5, 1)}×</b> la de su
        histórico previo, y con el stock + lo que viene en camino le quedan <b>≤ {config?.params.coberturaMax ?? 30}</b> días de
        cobertura al ritmo actual. «Pedir» estima las unidades para llegar a {config?.params.objetivoDias ?? 45} días de cobertura.
        Ventas = ML + Odoo (local, mayorista y otros), sin duplicar ML.
      </p>
    </div>
  );
}

// ---------- Subcomponentes ----------
function Kpi({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`card p-3 sm:p-4 ${accent ? "ring-1 ring-teal-500/25" : ""}`}>
      <div className="text-[11px] text-zinc-500 sm:text-xs">{label}</div>
      <div className={`text-xl font-bold tabular-nums sm:text-2xl ${accent ? "text-teal-300" : "text-white"}`}>{value}</div>
    </div>
  );
}

function NumField({ label, value, onChange, step = 1 }: { label: string; value: number; onChange: (v: number) => void; step?: number }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium text-zinc-500">{label}</span>
      <input
        type="number"
        min={0}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="field !py-2 text-sm"
      />
    </label>
  );
}

function Accel({ r }: { r: VentasAceleradasItem }) {
  if (r.sinHistorial) {
    return <span className="rounded bg-fuchsia-500/15 px-1.5 py-0.5 text-xs font-semibold text-fuchsia-300">nuevo</span>;
  }
  const a = r.aceleracion ?? 0;
  return <span className="font-semibold tabular-nums text-teal-300">{fmtDec(a, 1)}×</span>;
}

function Cobertura({ dias }: { dias: number | null }) {
  if (dias === null) return <span className="text-zinc-600">—</span>;
  const d = Math.round(dias);
  const tone = d <= 7 ? "text-red-300" : d <= 15 ? "text-amber-300" : "text-zinc-300";
  return <span className={`font-semibold tabular-nums ${tone}`}>{d} d</span>;
}

function MobileCard({ r }: { r: VentasAceleradasItem }) {
  return (
    <div className="card p-3">
      <div className="line-clamp-2 text-sm font-medium leading-snug text-zinc-100">
        {r.titulo ?? <span className="text-zinc-600">—</span>}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
        <span className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-zinc-300">{r.sku}</span>
        <span className="text-zinc-500">{fmtDec(r.velReciente, 1)} u/día</span>
        <Accel r={r} />
      </div>
      <div className="mt-2.5 grid grid-cols-4 gap-2 border-t border-white/5 pt-2.5 text-center">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-zinc-500">Stock</div>
          <div className="text-sm font-semibold tabular-nums text-zinc-300">{r.stock === null ? "—" : fmtInt(r.stock)}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-zinc-500">Camino</div>
          <div className={`text-sm font-semibold tabular-nums ${r.enCamino > 0 ? "text-sky-300" : "text-zinc-600"}`}>
            {r.enCamino > 0 ? fmtInt(r.enCamino) : "—"}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-zinc-500">Cobertura</div>
          <div className="text-sm"><Cobertura dias={r.diasCobertura} /></div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-teal-300/80">Pedir</div>
          <div className="text-sm font-bold tabular-nums text-teal-300">{fmtInt(r.sugerido)}</div>
        </div>
      </div>
    </div>
  );
}
