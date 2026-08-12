"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fmtInt, fmtDateTime } from "@/lib/format";
import { fmtCobertura, type SemanalItem, type SemanalParams, type Ventana } from "@/lib/semanal";

type Config = { enabled: boolean; emailTo: string | null; params: SemanalParams };
type Summary = {
  variantes: number;
  productos: number;
  unidadesSemana: number;
  aReponer: number;
  unidadesAPedir: number;
  sinStock: number;
};

/** Traduce el estado técnico del envío a algo que se entienda. */
function mailLabel(status: string | null | undefined): { text: string; tone: "ok" | "warn" | "err" | "muted" } {
  if (!status) return { text: "—", tone: "muted" };
  if (status === "sent") return { text: "Enviado por mail ✓", tone: "ok" };
  if (status.startsWith("error:")) return { text: "Error al enviar: " + status.slice(6), tone: "err" };
  if (status === "skipped:sin-config")
    return { text: "Mail sin configurar (falta RESEND_API_KEY)", tone: "warn" };
  if (status === "skipped:sin-destino") return { text: "Falta cargar el mail destino", tone: "warn" };
  if (status === "skipped:deshabilitado") return { text: "Envío automático desactivado", tone: "muted" };
  if (status.startsWith("skipped:")) return { text: "No enviado (" + status.slice(8) + ")", tone: "muted" };
  return { text: status, tone: "muted" };
}

const toneClass: Record<string, string> = {
  ok: "text-teal-300",
  warn: "text-amber-300",
  err: "text-red-300",
  muted: "text-zinc-500",
};

const fmtDec = (n: number, dec = 1) =>
  n.toLocaleString("es-UY", { minimumFractionDigits: 0, maximumFractionDigits: dec });

export default function ReporteSemanal() {
  const [items, setItems] = useState<SemanalItem[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [ventana, setVentana] = useState<Ventana | null>(null);
  const [config, setConfig] = useState<Config | null>(null);
  const [ultima, setUltima] = useState<{ at: string; trigger: string; emailStatus: string | null } | null>(null);

  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [savingCfg, setSavingCfg] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [showCfg, setShowCfg] = useState(false);
  const [mail, setMail] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [p, setP] = useState<SemanalParams | null>(null);

  // Filtros de la tabla.
  const [soloReponer, setSoloReponer] = useState(false);
  const [q, setQ] = useState("");

  // Ojo: nada de tocar estado antes del primer `await`. El estado ya arranca en
  // "cargando" y el botón «Actualizar» lo prende por su cuenta; hacerlo acá
  // sería un setState síncrono dentro del efecto, que encadena renders de más.
  const load = useCallback(async (forzar = false) => {
    try {
      const res = await fetch(`/api/reportes/semanal${forzar ? "?forzar=1" : ""}`, { cache: "no-store" });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || `Error ${res.status}`);
      setItems(j.report.items);
      setSummary(j.report.summary);
      setVentana(j.report.ventana);
      setConfig(j.config);
      setUltima(j.ultimaCorrida ? { at: j.ultimaCorrida.at, trigger: j.ultimaCorrida.trigger, emailStatus: j.ultimaCorrida.emailStatus } : null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  // La carga inicial va dentro de una función async propia (mismo patrón que el
  // resto de los reportes): así el efecto no toca estado de forma síncrona.
  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  /**
   * El formulario de configuración se siembra al abrirlo, no al cargar la
   * página: así lo que se ve siempre sale de la config guardada (y no de una
   * edición a medias de hace un rato).
   */
  const toggleCfg = useCallback(() => {
    setShowCfg((abierto) => {
      if (!abierto && config) {
        setMail(config.emailTo ?? "");
        setEnabled(config.enabled);
        setP(config.params);
      }
      return !abierto;
    });
  }, [config]);

  /** Recalcula contra la API (lo que hace el botón «Actualizar»). */
  const actualizar = useCallback(() => {
    setLoading(true);
    setError(null);
    setNotice(null);
    void load(true);
  }, [load]);

  const enviar = useCallback(async () => {
    setSending(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/reportes/semanal/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ send: true }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || `Error ${res.status}`);
      const l = mailLabel(j.mail?.status);
      setNotice(`${l.text}${j.mail?.to ? ` (${j.mail.to})` : ""} · ${j.fotos} fotos en el Excel`);
      setUltima({ at: j.runAt, trigger: "manual", emailStatus: j.mail?.status ?? null });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  }, []);

  const guardar = useCallback(async () => {
    if (!p) return;
    setSavingCfg(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/reportes/semanal/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, emailTo: mail, params: p }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || `Error ${res.status}`);
      setConfig(j.config);
      setNotice("Configuración guardada. Se aplica en el próximo envío.");
      void load(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSavingCfg(false);
    }
  }, [enabled, mail, p, load]);

  const filtrados = useMemo(() => {
    const t = q.trim().toLowerCase();
    return items.filter((it) => {
      if (soloReponer && it.alcanza) return false;
      if (!t) return true;
      return (
        it.sku.toLowerCase().includes(t) ||
        (it.titulo ?? "").toLowerCase().includes(t) ||
        (it.categoria ?? "").toLowerCase().includes(t)
      );
    });
  }, [items, soloReponer, q]);

  const estado = mailLabel(ultima?.emailStatus);

  return (
    <div className="space-y-5">
      {/* Barra de acciones */}
      <div className="card flex flex-wrap items-center gap-3 p-4">
        <button onClick={actualizar} disabled={loading} className="rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm font-semibold text-zinc-200 transition hover:bg-white/10 disabled:opacity-60">
          {loading ? "Calculando…" : "Actualizar"}
        </button>
        <a href="/api/reportes/semanal/export" className="rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm font-semibold text-zinc-200 transition hover:bg-white/10 disabled:opacity-60">
          Descargar Excel
        </a>
        <button onClick={() => void enviar()} disabled={sending || loading} className="brand-gradient brand-glow inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60">
          {sending ? "Enviando…" : "Enviar ahora por mail"}
        </button>
        <button onClick={toggleCfg} className="rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm font-semibold text-zinc-200 transition hover:bg-white/10 disabled:opacity-60">
          {showCfg ? "Cerrar configuración" : "Configuración"}
        </button>
        {ultima && (
          <span className="ml-auto text-xs text-zinc-500">
            Último envío: {fmtDateTime(ultima.at)} ({ultima.trigger}) ·{" "}
            <span className={toneClass[estado.tone]}>{estado.text}</span>
          </span>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">{error}</div>
      )}
      {notice && (
        <div className="rounded-xl border border-teal-400/30 bg-teal-500/10 p-4 text-sm text-teal-200">{notice}</div>
      )}

      {/* Configuración */}
      {showCfg && p && (
        <div className="card space-y-4 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Mail destino</span>
              <input
                value={mail}
                onChange={(e) => setMail(e.target.value)}
                placeholder="alguien@maimportaciones.com.uy, otro@…"
                className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-teal-400/50"
              />
              <span className="mt-1 block text-xs text-zinc-500">Separá varios con coma.</span>
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Meses a cubrir</span>
              <input
                type="number"
                min={0.25}
                step={0.25}
                value={p.mesesObjetivo}
                onChange={(e) => setP({ ...p, mesesObjetivo: Number(e.target.value) })}
                className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-teal-400/50"
              />
              <span className="mt-1 block text-xs text-zinc-500">
                Cuánto stock querés tener por delante. Por defecto 4 meses.
              </span>
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Días para medir el ritmo
              </span>
              <input
                type="number"
                min={7}
                step={1}
                value={p.ritmoDias}
                onChange={(e) => setP({ ...p, ritmoDias: Number(e.target.value) })}
                className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-teal-400/50"
              />
              <span className="mt-1 block text-xs text-zinc-500">
                Con qué historial se proyecta. Una sola semana es muy poco: 90 días es más estable.
              </span>
            </label>
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-sm text-zinc-300">
                <input
                  type="checkbox"
                  checked={p.descontarEnCamino}
                  onChange={(e) => setP({ ...p, descontarEnCamino: e.target.checked })}
                  className="h-4 w-4 accent-teal-400"
                />
                Descontar lo que ya viene en camino
              </label>
              <label className="flex items-center gap-2 text-sm text-zinc-300">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                  className="h-4 w-4 accent-teal-400"
                />
                Enviar automáticamente los lunes a las 9:00
              </label>
            </div>
          </div>
          <button onClick={() => void guardar()} disabled={savingCfg} className="brand-gradient brand-glow inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60">
            {savingCfg ? "Guardando…" : "Guardar"}
          </button>
        </div>
      )}

      {/* Resumen */}
      {summary && ventana && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Tile label={`Semana ${ventana.label}`} value={fmtInt(summary.unidadesSemana)} sub="unidades vendidas" />
          <Tile label="Variantes vendidas" value={fmtInt(summary.variantes)} sub={`${fmtInt(summary.productos)} productos`} />
          <Tile
            label={`No llegan a ${config?.params.mesesObjetivo ?? 4} meses`}
            value={fmtInt(summary.aReponer)}
            sub={`pedir ${fmtInt(summary.unidadesAPedir)} u`}
            alerta={summary.aReponer > 0}
          />
          <Tile label="Sin stock" value={fmtInt(summary.sinStock)} sub="vendieron y están en cero" alerta={summary.sinStock > 0} />
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por SKU, producto o categoría…"
          className="w-full max-w-sm rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-teal-400/50"
        />
        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={soloReponer}
            onChange={(e) => setSoloReponer(e.target.checked)}
            className="h-4 w-4 accent-teal-400"
          />
          Sólo las que hay que reponer
        </label>
        <span className="text-xs text-zinc-500">{fmtInt(filtrados.length)} variantes</span>
      </div>

      {/* Tabla */}
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-zinc-400">
            <tr>
              <th className="p-3">Foto</th>
              <th className="p-3">Variante</th>
              <th className="p-3 text-right">Semana</th>
              <th className="p-3 text-right">Ritmo</th>
              <th className="p-3 text-right">Stock</th>
              <th className="p-3 text-right">En camino</th>
              <th className="p-3 text-right">Cubre</th>
              <th className="p-3 text-right">Pedir</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={8} className="p-6 text-center text-zinc-500">
                  Calculando la semana…
                </td>
              </tr>
            )}
            {!loading && filtrados.length === 0 && (
              <tr>
                <td colSpan={8} className="p-6 text-center text-zinc-500">
                  No hay variantes que mostrar.
                </td>
              </tr>
            )}
            {filtrados.map((it) => (
              <tr key={it.sku} className="border-b border-white/5 last:border-0">
                <td className="p-2">
                  {it.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={it.photo} alt="" className="h-12 w-12 rounded-lg bg-white/5 object-contain" />
                  ) : (
                    <div className="h-12 w-12 rounded-lg bg-white/5" />
                  )}
                </td>
                <td className="p-3">
                  <div className="font-semibold text-white">{it.sku}</div>
                  <div className="text-xs text-zinc-400">{it.titulo ?? "sin título"}</div>
                </td>
                <td className="p-3 text-right font-semibold text-white">{fmtInt(it.unidadesSemana)}</td>
                <td className="p-3 text-right text-zinc-400">{fmtDec(it.velDia)} u/d</td>
                <td className="p-3 text-right text-zinc-300">{fmtInt(it.stock)}</td>
                <td className="p-3 text-right text-zinc-400">{it.enCamino > 0 ? fmtInt(it.enCamino) : "—"}</td>
                <td className={`p-3 text-right ${it.alcanza ? "text-teal-300" : "text-amber-300"}`}>
                  {fmtCobertura(it.mesesCobertura)}
                </td>
                <td className="p-3 text-right">
                  {it.pedir > 0 ? (
                    <span className="font-semibold text-red-300">{fmtInt(it.pedir)}</span>
                  ) : (
                    <span className="text-zinc-600">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Tile({ label, value, sub, alerta }: { label: string; value: string; sub: string; alerta?: boolean }) {
  return (
    <div className="card p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-400">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${alerta ? "text-amber-300" : "text-white"}`}>{value}</div>
      <div className="mt-0.5 text-xs text-zinc-500">{sub}</div>
    </div>
  );
}
