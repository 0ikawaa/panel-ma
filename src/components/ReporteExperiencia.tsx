"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fmtInt, fmtDateTime, fmtPeso } from "@/lib/format";
import {
  EXPERIENCIA_MAX,
  experienciaEstado,
  type ExperienciaItem,
  type ExperienciaParams,
  type ExperienciaReport,
  type Problema,
  type PubExperiencia,
  type Semaforo,
} from "@/lib/experiencia";

// El GET devuelve el reporte con las marcas de caída pegadas (ver experiencia.server.ts).
type Marca = {
  itemId: string;
  bajoDe: number;
  bajoDelta: number;
  bajoEn: string;
  cruzo100: boolean;
  problema: string | null;
  avisoStatus: string | null;
};
type Reporte = ExperienciaReport & { marcas: Record<string, Marca>; bajaronSinVer: number };
type Config = { enabled: boolean; emailTo: string | null; params: ExperienciaParams };

type Filtro = "todas" | "rojo" | "naranja" | "amarillo" | "bajaron" | "infracciones";

const semTone: Record<Semaforo, { dot: string; ring: string; text: string }> = {
  rojo: { dot: "bg-red-400", ring: "ring-red-500/30", text: "text-red-300" },
  naranja: { dot: "bg-orange-400", ring: "ring-orange-500/30", text: "text-orange-300" },
  amarillo: { dot: "bg-amber-400", ring: "ring-amber-500/30", text: "text-amber-300" },
  verde: { dot: "bg-emerald-400", ring: "ring-emerald-500/30", text: "text-emerald-300" },
};

export default function ReporteExperiencia() {
  const [report, setReport] = useState<Reporte | null>(null);
  const [config, setConfig] = useState<Config | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [busqueda, setBusqueda] = useState("");
  const [abierto, setAbierto] = useState<string | null>(null);
  const [corriendo, setCorriendo] = useState(false);
  const [mailInput, setMailInput] = useState("");
  const [guardando, setGuardando] = useState(false);

  // Al abrir la pantalla vale el reporte cacheado (es instantáneo); «Actualizar»
  // pide explícitamente que se rehaga con los datos de ahora.
  const load = useCallback(async (forzar = false) => {
    setLoading(true);
    setError(null);
    try {
      const url = forzar ? "/api/reportes/experiencia?forzar=1" : "/api/reportes/experiencia";
      const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(115000) });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || `Error ${res.status}`);
      setReport(j.report);
      setConfig(j.config);
      setMailInput(j.config?.emailTo ?? "");
    } catch (e) {
      const err = e as Error;
      setError(err.name === "TimeoutError" ? "La consulta tardó demasiado (timeout)." : err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  /** Corre el chequeo: compara con la corrida anterior, marca y manda el mail. */
  const chequear = async () => {
    setCorriendo(true);
    setError(null);
    setAviso(null);
    try {
      const res = await fetch("/api/reportes/experiencia/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
        signal: AbortSignal.timeout(115000),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || `Error ${res.status}`);
      setReport(j.report);
      if (j.primeraCorrida) {
        setAviso(
          "Primera corrida: se guardó el puntaje de cada publicación como punto de partida. Desde la próxima ya se avisan las caídas.",
        );
      } else {
        // `nuevas` quedan marcadas esperando la confirmación de la próxima
        // corrida (el puntaje del barrido no es comparable con una lectura
        // individual, así que una sola lectura no alcanza para avisar).
        const partes: string[] = [];
        if (j.caidas.length > 0) {
          partes.push(
            `${j.caidas.length} caída${j.caidas.length === 1 ? "" : "s"} confirmada${j.caidas.length === 1 ? "" : "s"} · mail: ${j.email.status}`,
          );
        }
        if (j.nuevas > 0) {
          partes.push(
            `${j.nuevas} nueva${j.nuevas === 1 ? "" : "s"} marcada${j.nuevas === 1 ? "" : "s"}, se avisa${j.nuevas === 1 ? "" : "n"} si en la próxima corrida sigue${j.nuevas === 1 ? "" : "n"} caída${j.nuevas === 1 ? "" : "s"}`,
          );
        }
        if (j.recuperadas > 0) partes.push(`${j.recuperadas} recuperó su puntaje`);
        setAviso(partes.length > 0 ? partes.join(" · ") : "Ninguna publicación bajó de puntaje.");
      }
    } catch (e) {
      const err = e as Error;
      setError(err.name === "TimeoutError" ? "El chequeo tardó demasiado (timeout)." : err.message);
    } finally {
      setCorriendo(false);
    }
  };

  const guardarMail = async () => {
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch("/api/reportes/experiencia/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailTo: mailInput }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || `Error ${res.status}`);
      setConfig((c) => (c ? { ...c, emailTo: j.config.emailTo } : c));
      setMailInput(j.config.emailTo ?? "");
      setAviso("Destino de las alertas guardado.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGuardando(false);
    }
  };

  const marcarVistas = async (itemIds: string[] | "todas") => {
    try {
      const res = await fetch("/api/reportes/experiencia/visto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(itemIds === "todas" ? { todas: true } : { itemIds }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || `Error ${res.status}`);
      // Se saca la marca en pantalla sin rehacer el barrido de ML.
      setReport((r) => {
        if (!r) return r;
        const marcas = { ...r.marcas };
        if (itemIds === "todas") for (const k of Object.keys(marcas)) delete marcas[k];
        else for (const id of itemIds) delete marcas[id];
        return { ...r, marcas, bajaronSinVer: Object.keys(marcas).length };
      });
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const s = report?.summary;
  // Estable entre renders para que el filtro por «bajaron» no se rearme siempre.
  const marcas = useMemo(() => report?.marcas ?? {}, [report]);

  /** ¿Alguna publicación del grupo tiene marca de caída sin ver? */
  const grupoBajo = useCallback(
    (it: ExperienciaItem) => it.publicaciones.some((p) => marcas[p.id]),
    [marcas],
  );

  const items = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return (report?.items ?? []).filter((it) => {
      if (filtro === "rojo" && it.semaforo !== "rojo") return false;
      if (filtro === "naranja" && it.semaforo !== "naranja") return false;
      if (filtro === "amarillo" && it.semaforo !== "amarillo") return false;
      if (filtro === "bajaron" && !grupoBajo(it)) return false;
      if (filtro === "infracciones" && !it.problemas.some((p) => p.code === "infracciones")) return false;
      if (!q) return true;
      return (
        it.codigo.toLowerCase().includes(q) ||
        it.titulo.toLowerCase().includes(q) ||
        it.skus.some((sk) => sk.toLowerCase().includes(q)) ||
        it.publicaciones.some((p) => p.id.toLowerCase().includes(q))
      );
    });
  }, [report, filtro, busqueda, grupoBajo]);

  const toggle = (f: Filtro) => setFiltro((cur) => (cur === f ? "todas" : f));

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="card flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
        <div className="min-w-0 text-sm text-zinc-400">
          {s ? (
            <>
              <span className="font-semibold text-zinc-200">{fmtInt(s.codigos)}</span> SKU a mejorar de{" "}
              <span className="font-semibold text-zinc-200">{fmtInt(s.activas)}</span> publicaciones activas ·{" "}
              promedio{" "}
              <span className="font-semibold text-zinc-200">
                {s.scorePromedio === null ? "—" : `${s.scorePromedio}%`}
              </span>
              {" · "}
              <span className="font-semibold text-teal-300">{fmtInt(s.puntosEnJuego)}</span> pts en juego
              {report ? ` · ${fmtDateTime(report.generadoEn)}` : ""}
            </>
          ) : (
            <span className="text-zinc-500">Evaluando…</span>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            onClick={() => void load(true)}
            disabled={loading || corriendo}
            className="rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm font-semibold text-zinc-200 transition hover:bg-white/10 disabled:opacity-60"
          >
            {loading ? "Evaluando…" : "Actualizar"}
          </button>
          <button
            onClick={() => void chequear()}
            disabled={loading || corriendo}
            className="rounded-xl border border-teal-500/30 bg-teal-500/10 px-3.5 py-2.5 text-sm font-semibold text-teal-200 transition hover:bg-teal-500/20 disabled:opacity-60"
            title="Compara con la corrida anterior, marca lo que bajó y manda el mail"
          >
            {corriendo ? "Chequeando…" : "Chequear caídas y avisar"}
          </button>
          <a
            href="/api/reportes/experiencia/export"
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm font-semibold text-zinc-200 transition hover:bg-white/10"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 21h16" />
            </svg>
            Excel
          </a>
        </div>
      </div>

      {error && <div className="rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2.5 text-sm text-red-300">{error}</div>}
      {aviso && (
        <div className="flex items-start justify-between gap-3 rounded-xl border border-teal-500/25 bg-teal-500/10 px-3 py-2.5 text-sm text-teal-200">
          <span>{aviso}</span>
          <button onClick={() => setAviso(null)} className="shrink-0 text-teal-300/70 hover:text-teal-200">✕</button>
        </div>
      )}
      {report?.fallidos ? (
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
          No se pudo leer la experiencia de {report.fallidos} publicación{report.fallidos === 1 ? "" : "es"} (quedaron afuera del reporte).
        </div>
      ) : null}

      {/* Publicaciones que bajaron: la marca del panel */}
      {report && report.bajaronSinVer > 0 && (
        <div className="flex flex-col gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-red-200">
            <b>{fmtInt(report.bajaronSinVer)}</b> publicación{report.bajaronSinVer === 1 ? "" : "es"} bajó de puntaje desde el último chequeo.
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              onClick={() => setFiltro("bajaron")}
              className="rounded-lg border border-red-400/30 bg-red-500/10 px-2.5 py-1.5 text-xs font-semibold text-red-200 transition hover:bg-red-500/20"
            >
              Ver solo esas
            </button>
            <button
              onClick={() => void marcarVistas("todas")}
              className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-semibold text-zinc-300 transition hover:bg-white/10"
            >
              Marcar todas como vistas
            </button>
          </div>
        </div>
      )}

      {/* KPIs del semáforo (clic para filtrar) */}
      {s && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi label="🔴 Mala (0–39%)" value={fmtInt(s.rojo)} tone="text-red-300" active={filtro === "rojo"} onClick={() => toggle("rojo")} />
          <Kpi label="🟠 Regular (40–59%)" value={fmtInt(s.naranja)} tone="text-orange-300" active={filtro === "naranja"} onClick={() => toggle("naranja")} />
          <Kpi label="🟡 Buena (60–79%)" value={fmtInt(s.amarillo)} tone="text-amber-300" active={filtro === "amarillo"} onClick={() => toggle("amarillo")} />
          <Kpi label="Con infracciones" value={fmtInt(s.conInfracciones)} tone="text-red-300" active={filtro === "infracciones"} onClick={() => toggle("infracciones")} />
          <Kpi label="Perfectas (100%)" value={fmtInt(s.perfectas)} tone="text-emerald-300" />
          <Kpi label="Visitas 30d en juego" value={fmtInt(s.visitas30dEnRiesgo)} />
          <Kpi label="Unidades 30d en juego" value={fmtInt(s.unidades30dEnRiesgo)} />
          <Kpi label="Publicaciones a mejorar" value={fmtInt(s.aMejorar)} />
        </div>
      )}

      {/* Reputación del vendedor: los reclamos que ML sí informa */}
      {report?.reputacion && (
        <div className="card p-3 sm:p-4">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Reputación del vendedor · últimos 120 días
            {report.reputacion.powerSeller && (
              <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] normal-case text-emerald-300">
                {report.reputacion.powerSeller}
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <Mini label="Reclamos" value={fmtInt(report.reputacion.reclamos120d)} sub={report.reputacion.reclamosTasaPct} />
            <Mini label="Demoras de despacho" value={fmtInt(report.reputacion.demoras120d)} sub={report.reputacion.demorasTasaPct} />
            <Mini label="Cancelaciones" value={fmtInt(report.reputacion.cancelaciones120d)} sub={report.reputacion.cancelacionesTasaPct} />
            <Mini label="Ventas completadas" value={fmtInt(report.reputacion.ventasCompletadas120d)} sub={null} />
          </div>
          {!report.reclamosPorSkuDisponibles && (
            <p className="mt-2.5 text-xs leading-relaxed text-zinc-500">
              Estos reclamos son del vendedor completo: MercadoLibre todavía no habilita el permiso
              para verlos <b className="text-zinc-400">por publicación</b>, así que en cada SKU se
              muestran las <b className="text-zinc-400">cancelaciones</b> de sus órdenes como lo más
              cercano. Cuando ML habilite los reclamos, aparecen acá solos.
            </p>
          )}
        </div>
      )}

      {/* Destino de las alertas */}
      <div className="card flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:gap-3 sm:p-4">
        <label htmlFor="mail-alertas" className="shrink-0 text-sm text-zinc-400">
          Avisar las caídas a:
        </label>
        <input
          id="mail-alertas"
          type="text"
          value={mailInput}
          onChange={(e) => setMailInput(e.target.value)}
          placeholder="mail@ejemplo.com, otro@ejemplo.com"
          className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-teal-500/40"
        />
        <button
          onClick={() => void guardarMail()}
          disabled={guardando || mailInput === (config?.emailTo ?? "")}
          className="shrink-0 rounded-xl border border-white/10 bg-white/5 px-3.5 py-2 text-sm font-semibold text-zinc-200 transition hover:bg-white/10 disabled:opacity-50"
        >
          {guardando ? "Guardando…" : "Guardar"}
        </button>
      </div>

      {config && (
        <p className="px-1 text-xs leading-relaxed text-zinc-500">
          Se avisa cuando una publicación pierde <b className="text-zinc-400">{config.params.minCaida} puntos o más</b>, y
          siempre que deje de estar en 100%. Una caída se marca en el panel en cuanto se detecta y el mail sale
          cuando la siguiente corrida confirma que sigue caída: la API de MercadoLibre devuelve hasta 13 puntos de
          diferencia para la misma publicación según cómo se la consulte, así que una sola lectura no alcanza para
          avisar. Si la publicación recupera su puntaje, la marca se borra sola.
        </p>
      )}

      {/* Buscador */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <input
          type="search"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por código, SKU, título o MLU…"
          className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-teal-500/40 sm:max-w-sm"
        />
        {(filtro !== "todas" || busqueda) && (
          <div className="flex items-center gap-2 px-1 text-xs text-zinc-500">
            <span>Mostrando {fmtInt(items.length)} de {fmtInt(report?.items.length ?? 0)}.</span>
            <button
              onClick={() => {
                setFiltro("todas");
                setBusqueda("");
              }}
              className="font-semibold text-teal-300 hover:text-teal-200"
            >
              Limpiar
            </button>
          </div>
        )}
      </div>

      {loading && !report ? (
        <div className="card px-4 py-12 text-center text-sm text-zinc-400">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="mx-auto mb-2 h-5 w-5 animate-spin text-zinc-500">
            <path d="M21 12a9 9 0 1 1-2.64-6.36" strokeLinecap="round" />
          </svg>
          Consultando la experiencia de compra de cada publicación en MercadoLibre…
          <div className="mt-1 text-xs text-zinc-600">Son más de 800 publicaciones, tarda unos segundos.</div>
        </div>
      ) : items.length === 0 ? (
        <div className="card px-4 py-12 text-center">
          <p className="text-sm text-zinc-300">✅ No hay SKU para mostrar con este filtro.</p>
          <p className="mt-1 text-xs text-zinc-500">Probá con otro filtro o limpiá la búsqueda.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {items.map((it) => (
            <Fila
              key={it.codigo}
              it={it}
              marcas={marcas}
              abierto={abierto === it.codigo}
              reclamosDisponibles={report?.reclamosPorSkuDisponibles ?? false}
              onToggle={() => setAbierto(abierto === it.codigo ? null : it.codigo)}
              onVisto={(ids) => void marcarVistas(ids)}
            />
          ))}
        </div>
      )}

      <p className="px-1 text-xs leading-relaxed text-zinc-500">
        La <b className="text-zinc-400">experiencia de compra</b> es un puntaje de 0 a 100 que sale de
        nueve aspectos: ficha técnica/health (25 pts), fotos (15), opiniones (15), envío gratis (10),
        catálogo (10), descripción (10), carrito (5), video (5) e infracciones (5). No es lo mismo que
        el <b className="text-zinc-400">health</b> del reporte de Calidad: el health es uno de los
        nueve. Las filas son <b className="text-zinc-400">SKU unificados</b> (código base: «48000-NEG-40»
        cuenta como «48000»), así se arregla el producto entero de una. El orden prioriza lo que tiene
        más puntos para recuperar y más movimiento. Datos en vivo de MUNDO SHOP.
      </p>
    </div>
  );
}

function Kpi({ label, value, tone, active, onClick }: { label: string; value: string; tone?: string; active?: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`card p-3 text-left transition sm:p-4 ${onClick ? "cursor-pointer hover:bg-white/[0.04]" : "cursor-default"} ${active && onClick ? "ring-2 ring-teal-500/40" : ""}`}
    >
      <div className="text-[11px] text-zinc-500 sm:text-xs">{label}</div>
      <div className={`text-xl font-bold tabular-nums sm:text-2xl ${tone ?? "text-white"}`}>{value}</div>
    </button>
  );
}

function Mini({ label, value, sub }: { label: string; value: string; sub: string | null }) {
  return (
    <div>
      <div className="text-[11px] text-zinc-500">{label}</div>
      <div className="text-base font-semibold tabular-nums text-zinc-100">
        {value}
        {sub ? <span className="ml-1 text-xs font-normal text-zinc-500">({sub})</span> : null}
      </div>
    </div>
  );
}

function Badge({ children, tone }: { children: React.ReactNode; tone: string }) {
  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${tone}`}>{children}</span>;
}

function Fila({
  it,
  marcas,
  abierto,
  reclamosDisponibles,
  onToggle,
  onVisto,
}: {
  it: ExperienciaItem;
  marcas: Record<string, Marca>;
  abierto: boolean;
  reclamosDisponibles: boolean;
  onToggle: () => void;
  onVisto: (itemIds: string[]) => void;
}) {
  const est = experienciaEstado(it.scorePeor);
  const sem = semTone[it.semaforo];
  const bajaron = it.publicaciones.filter((p) => marcas[p.id]);
  const cruzo = bajaron.some((p) => marcas[p.id]?.cruzo100);
  const principal = it.problemaPrincipal;

  return (
    <div className={`card overflow-hidden ${bajaron.length > 0 ? "ring-1 ring-red-500/30" : ""}`}>
      <button onClick={onToggle} className="flex w-full items-start gap-3 p-3 text-left transition hover:bg-white/[0.03]">
        {it.thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={it.thumbnail} alt="" className="h-12 w-12 shrink-0 rounded object-cover" />
        ) : (
          <div className="h-12 w-12 shrink-0 rounded bg-white/5" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${sem.dot}`} aria-hidden />
            <span className="font-mono text-xs font-semibold text-zinc-300">{it.codigo}</span>
            {it.sinSku && <Badge tone="bg-zinc-500/15 text-zinc-400">sin SKU</Badge>}
            {it.publicaciones.length > 1 && (
              <Badge tone="bg-white/5 text-zinc-400">{it.publicaciones.length} publicaciones</Badge>
            )}
            {bajaron.length > 0 && (
              <Badge tone="bg-red-500/20 text-red-300">
                {cruzo ? "dejó el 100%" : `bajó −${Math.max(...bajaron.map((p) => marcas[p.id].bajoDelta))} pts`}
              </Badge>
            )}
          </div>
          <div className="mt-1 line-clamp-2 text-sm font-medium leading-snug text-zinc-100">{it.titulo}</div>
          {principal && (
            <div className="mt-1.5 text-[12px] leading-snug">
              <span className="text-zinc-500">Problema principal: </span>
              <span className={principal.status === "bad" ? "text-red-300" : "text-amber-300"}>
                {principal.label}
              </span>
              <span className="text-zinc-500"> — {principal.detalle}</span>
            </div>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-zinc-500">
            {it.visitas30d > 0 && <span>{fmtInt(it.visitas30d)} visitas/30d</span>}
            {it.ventas.unidades30d > 0 && <span>· {fmtInt(it.ventas.unidades30d)} u. vendidas/30d</span>}
            {it.reviews.total > 0 && (
              <span>· {fmtInt(it.reviews.total)} opiniones {it.reviews.promedio ?? "—"}★</span>
            )}
            <span className="text-teal-400/70">· {EXPERIENCIA_MAX - it.scorePeor} pts para recuperar</span>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className={`text-lg font-bold tabular-nums ${est.tone}`}>{it.scorePeor}%</div>
          <div className="text-[10px] uppercase tracking-wide text-zinc-500">{est.label}</div>
          {it.publicaciones.length > 1 && (
            <div className="text-[10px] text-zinc-600">prom. {it.scorePromedio}%</div>
          )}
        </div>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={`mt-1 h-4 w-4 shrink-0 text-zinc-500 transition-transform ${abierto ? "rotate-90" : ""}`}>
          <path d="m9 18 6-6-6-6" />
        </svg>
      </button>

      {abierto && (
        <div className="border-t border-white/10 p-3 sm:p-4">
          {/* Caídas del grupo */}
          {bajaron.length > 0 && (
            <div className="mb-3 rounded-xl border border-red-500/25 bg-red-500/10 p-2.5">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-red-300">Bajó de puntaje</span>
                <button
                  onClick={() => onVisto(bajaron.map((p) => p.id))}
                  className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[11px] font-semibold text-zinc-300 transition hover:bg-white/10"
                >
                  Marcar como visto
                </button>
              </div>
              <ul className="space-y-1 text-xs text-red-200/90">
                {bajaron.map((p) => {
                  const m = marcas[p.id];
                  return (
                    <li key={p.id}>
                      <span className="font-mono text-red-300/80">{p.sku ?? p.id}</span>{" "}
                      {m.bajoDe}% → {p.score}% (−{m.bajoDelta} pts) · {fmtDateTime(m.bajoEn)}
                      {m.avisoStatus ? <span className="text-red-300/60"> · mail: {m.avisoStatus}</span> : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* Tipos de problema */}
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Tipos de problema ({it.problemas.length})
          </div>
          <ul className="space-y-2">
            {it.problemas.map((p) => (
              <ProblemaLi key={p.code} p={p} totalPubs={it.publicaciones.length} />
            ))}
          </ul>

          {/* Ventas y reclamos */}
          <div className="mt-4 mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Ventas y reclamos
          </div>
          <div className="grid grid-cols-2 gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-3 text-sm sm:grid-cols-3 lg:grid-cols-6">
            <Mini label="Unidades 30d" value={fmtInt(it.ventas.unidades30d)} sub={null} />
            <Mini label="Unidades 90d" value={fmtInt(it.ventas.unidades90d)} sub={null} />
            <Mini label="Órdenes 90d" value={fmtInt(it.ventas.ordenes90d)} sub={null} />
            <Mini label="Canceladas 90d" value={fmtInt(it.ventas.canceladas90d)} sub={null} />
            <Mini
              label="Reclamos 90d"
              value={reclamosDisponibles ? fmtInt(it.ventas.reclamos90d) : "s/d"}
              sub={null}
            />
            <Mini label="Vendidas (histórico)" value={fmtInt(it.vendidasHistorico)} sub={null} />
          </div>
          {!reclamosDisponibles && (
            <p className="mt-1.5 text-[11px] text-zinc-600">
              Los reclamos por publicación los bloquea MercadoLibre (permiso no habilitado). El total
              del vendedor está arriba, y las cancelaciones de este SKU son lo más cercano que hay.
            </p>
          )}

          {/* Publicaciones del grupo */}
          <div className="mt-4 mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Publicaciones ({it.publicaciones.length})
          </div>
          <div className="space-y-1.5">
            {it.publicaciones.map((p) => (
              <PubLinea key={p.id} p={p} bajo={marcas[p.id]} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ProblemaLi({ p, totalPubs }: { p: Problema & { publicaciones: number }; totalPubs: number }) {
  const tone = p.status === "bad" ? "bg-red-500/15 text-red-300" : "bg-amber-500/15 text-amber-300";
  return (
    <li className="rounded-xl border border-white/10 bg-white/[0.02] p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-zinc-100">{p.label}</span>
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${tone}`}>
          {p.status === "bad" ? "Crítico" : "A mejorar"}
        </span>
        <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-400">
          vale {p.peso} pts
        </span>
        {p.publicaciones > 1 && (
          <span className="text-[11px] text-zinc-500">
            en {p.publicaciones} de {totalPubs} publicaciones
          </span>
        )}
      </div>
      <div className="mt-1 text-xs text-zinc-400">
        <span className="text-zinc-500">Ahora: </span>
        {p.detalle}
      </div>
      <div className="mt-1.5 text-xs leading-relaxed text-teal-200/80">
        <span className="font-semibold text-teal-300">Cómo mejorarlo según ML: </span>
        {p.comoMejorar}
      </div>
    </li>
  );
}

function PubLinea({ p, bajo }: { p: PubExperiencia; bajo?: Marca }) {
  const est = experienciaEstado(p.score);
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-white/5 bg-white/[0.02] px-2.5 py-2 text-xs">
      <span className={`h-2 w-2 shrink-0 rounded-full ${semTone[p.semaforo].dot}`} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="truncate text-zinc-200">{p.titulo}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-zinc-500">
          <span className="font-mono">{p.sku ?? p.id}</span>
          {p.precio !== null && <span>· {fmtPeso(p.precio)}</span>}
          {p.disponibles !== null && <span>· stock {fmtInt(p.disponibles)}</span>}
          {p.visitas30d !== null && p.visitas30d > 0 && <span>· {fmtInt(p.visitas30d)} visitas/30d</span>}
          {p.reviews.total > 0 && <span>· {p.reviews.total} opiniones {p.reviews.promedio ?? "—"}★</span>}
          {bajo && <span className="text-red-300">· bajó {bajo.bajoDe}% → {p.score}%</span>}
        </div>
      </div>
      <span className={`shrink-0 font-bold tabular-nums ${est.tone}`}>{p.score}%</span>
      {p.permalink && (
        <a
          href={p.permalink}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="shrink-0 text-teal-300 transition hover:text-teal-200"
          title="Ver en MercadoLibre"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
            <path d="M7 17 17 7M7 7h10v10" />
          </svg>
        </a>
      )}
    </div>
  );
}
