"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fmtInt, fmtDateTime } from "@/lib/format";
import {
  SEMAFORO_TEXTO,
  VENTANA_DIAS,
  experienciaEstado,
  type CambioSku,
  type ExperienciaParams,
  type ExperienciaReport,
  type ExperienciaSku,
  type ProblemaTipo,
} from "@/lib/experiencia";

// La forma que devuelve el GET. Se declara acá y no se importa de
// `experiencia.server` porque ese módulo arrastra Prisma al bundle del cliente.
type SnapshotMeta = {
  id: string;
  capturadoEn: string;
  importadoEn: string;
  importadoPor: string | null;
  publicaciones: number;
  conDetalle: number;
  skus: number;
  reclamos: number;
};
type Reporte = ExperienciaReport & {
  snapshot: SnapshotMeta;
  comparadoCon: SnapshotMeta | null;
  cambios: CambioSku[];
  sinVentasBd: boolean;
};
type Config = { enabled: boolean; emailTo: string | null; params: ExperienciaParams };

type Filtro = "todas" | "rojo" | "reclamos" | "empeoraron" | "sin-ventas";

export default function ReporteExperiencia() {
  const [report, setReport] = useState<Reporte | null>(null);
  const [config, setConfig] = useState<Config | null>(null);
  const [historial, setHistorial] = useState<SnapshotMeta[]>([]);
  const [hayCaptura, setHayCaptura] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [busqueda, setBusqueda] = useState("");
  const [abierto, setAbierto] = useState<string | null>(null);
  const [importando, setImportando] = useState(false);
  const [mailInput, setMailInput] = useState("");
  const [guardando, setGuardando] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async (forzar = false) => {
    setLoading(true);
    setError(null);
    try {
      const url = forzar ? "/api/reportes/experiencia?forzar=1" : "/api/reportes/experiencia";
      const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(115000) });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || `Error ${res.status}`);
      setReport(j.report);
      setHayCaptura(j.report !== null);
      setConfig(j.config);
      setHistorial(j.historial ?? []);
      setMailInput(j.config?.emailTo ?? "");
    } catch (e) {
      const err = e as Error;
      setError(err.name === "TimeoutError" ? "La consulta tardó demasiado (timeout)." : err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** Sube los JSON de la captura del panel. */
  const importar = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setImportando(true);
    setError(null);
    setAviso(null);
    try {
      const form = new FormData();
      for (const f of Array.from(files)) form.append("captura", f);
      const res = await fetch("/api/reportes/experiencia/import", {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(115000),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || `Error ${res.status}`);
      setReport(j.report);
      setHayCaptura(true);
      const partes = [
        `Captura importada: ${fmtInt(j.snapshot.publicaciones)} publicaciones, ${fmtInt(j.snapshot.skus)} SKU a mejorar`,
      ];
      if (j.primeraCaptura) {
        partes.push("es la primera, así que no hay con qué comparar todavía");
      } else if (j.empeoraron > 0) {
        partes.push(`${j.empeoraron} SKU empeoró${j.empeoraron === 1 ? "" : "aron"} · mail: ${j.email.status}`);
      } else {
        partes.push("ningún SKU empeoró respecto de la captura anterior");
      }
      setAviso(partes.join(" · "));
      await load(true);
    } catch (e) {
      const err = e as Error;
      setError(err.name === "TimeoutError" ? "La importación tardó demasiado (timeout)." : err.message);
    } finally {
      setImportando(false);
      if (fileRef.current) fileRef.current.value = "";
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

  const s = report?.summary;
  const empeoraron = useMemo(
    () => new Set((report?.cambios ?? []).map((c) => c.clave)),
    [report],
  );

  const items = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return (report?.items ?? []).filter((it) => {
      if (filtro === "rojo" && it.semaforo !== "rojo") return false;
      if (filtro === "reclamos" && it.reclamos === 0) return false;
      if (filtro === "empeoraron" && !empeoraron.has(it.clave)) return false;
      if (filtro === "sin-ventas" && it.situacion !== "sin-ventas") return false;
      if (!q) return true;
      return (
        it.clave.toLowerCase().includes(q) ||
        it.titulo.toLowerCase().includes(q) ||
        it.problemaPrincipalTexto.toLowerCase().includes(q) ||
        it.publicaciones.some((p) => p.id.toLowerCase().includes(q))
      );
    });
  }, [report, filtro, busqueda, empeoraron]);

  const toggle = (f: Filtro) => setFiltro((cur) => (cur === f ? "todas" : f));

  const botonImportar = (
    <>
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        multiple
        onChange={(e) => void importar(e.target.files)}
        className="hidden"
        id="captura-experiencia"
      />
      <label
        htmlFor="captura-experiencia"
        className={`inline-flex cursor-pointer items-center gap-2 rounded-xl border border-teal-500/30 bg-teal-500/10 px-3.5 py-2.5 text-sm font-semibold text-teal-200 transition hover:bg-teal-500/20 ${importando ? "pointer-events-none opacity-60" : ""}`}
        title="Subir el JSON de la captura del panel de vendedor"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
          <path d="M12 21V9m0 0 4 4m-4-4-4 4M4 3h16" />
        </svg>
        {importando ? "Importando…" : "Importar captura"}
      </label>
    </>
  );

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="card flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
        <div className="min-w-0 text-sm text-zinc-400">
          {s && report ? (
            <>
              <span className="font-semibold text-zinc-200">{fmtInt(s.skus)}</span> SKU a mejorar ·{" "}
              <span className="font-semibold text-red-300">{fmtInt(s.reclamosTotales)}</span> problemas de
              compradores en {VENTANA_DIAS} días · captura del{" "}
              <span className="text-zinc-300">{fmtDateTime(report.capturadoEn)}</span>
            </>
          ) : loading ? (
            <span className="text-zinc-500">Cargando…</span>
          ) : (
            <span className="text-zinc-500">Sin capturas importadas.</span>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            onClick={() => void load(true)}
            disabled={loading || importando}
            className="rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm font-semibold text-zinc-200 transition hover:bg-white/10 disabled:opacity-60"
          >
            {loading ? "Cargando…" : "Actualizar"}
          </button>
          {botonImportar}
          {hayCaptura && (
            <a
              href="/api/reportes/experiencia/export"
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm font-semibold text-zinc-200 transition hover:bg-white/10"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 21h16" />
              </svg>
              Excel
            </a>
          )}
        </div>
      </div>

      {error && <div className="rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2.5 text-sm text-red-300">{error}</div>}
      {aviso && (
        <div className="flex items-start justify-between gap-3 rounded-xl border border-teal-500/25 bg-teal-500/10 px-3 py-2.5 text-sm text-teal-200">
          <span>{aviso}</span>
          <button onClick={() => setAviso(null)} className="shrink-0 text-teal-300/70 hover:text-teal-200">✕</button>
        </div>
      )}

      {/* Sin capturas: qué hay que hacer */}
      {!loading && !hayCaptura && (
        <div className="card space-y-3 p-4 sm:p-6">
          <h2 className="text-base font-semibold text-white">Todavía no hay ninguna captura</h2>
          <p className="text-sm leading-relaxed text-zinc-400">
            La experiencia de compra es el único dato del panel que MercadoLibre{" "}
            <b className="text-zinc-300">no expone por API</b>: los problemas de los compradores
            necesitan un permiso que ML no habilita. Así que el reporte se alimenta de una captura del
            panel de vendedor, que se hace con el navegador (sesión de ML de por medio) y se importa
            acá.
          </p>
          <p className="text-sm leading-relaxed text-zinc-400">
            Subí los JSON de la captura con <b className="text-zinc-300">Importar captura</b>: el del
            listado completo (todas las publicaciones con su % de experiencia) y el del diagnóstico
            (el detalle de problemas de las que están por debajo de 100). Se pueden subir juntos.
          </p>
        </div>
      )}

      {/* Lo que empeoró desde la captura anterior */}
      {report && report.cambios.length > 0 && (
        <div className="flex flex-col gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-red-200">
            <b>{fmtInt(report.cambios.length)}</b> SKU empeoró
            {report.cambios.length === 1 ? "" : "aron"} desde la captura del{" "}
            {report.comparadoCon ? fmtDateTime(report.comparadoCon.capturadoEn) : "—"}.
          </div>
          <button
            onClick={() => setFiltro("empeoraron")}
            className="shrink-0 rounded-lg border border-red-400/30 bg-red-500/10 px-2.5 py-1.5 text-xs font-semibold text-red-200 transition hover:bg-red-500/20"
          >
            Ver solo esos
          </button>
        </div>
      )}

      {/* KPIs (clic para filtrar) */}
      {s && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi label={`${SEMAFORO_TEXTO.rojo} — mala experiencia`} value={fmtInt(s.rojo)} tone="text-red-300" active={filtro === "rojo"} onClick={() => toggle("rojo")} />
          <Kpi label="SKU con reclamos" value={fmtInt(s.conReclamos)} tone="text-amber-300" active={filtro === "reclamos"} onClick={() => toggle("reclamos")} />
          <Kpi label={`Problemas (${VENTANA_DIAS} d)`} value={fmtInt(s.reclamosTotales)} tone="text-red-300" />
          <Kpi label={`Sin ventas en ${VENTANA_DIAS} d`} value={fmtInt(s.sinVentas)} active={filtro === "sin-ventas"} onClick={() => toggle("sin-ventas")} />
          <Kpi label="Unidades vendidas por los SKU con reclamos" value={fmtInt(s.ventasConReclamos)} />
          <Kpi label="SKU sin reclamos" value={fmtInt(s.sinReclamos)} tone="text-emerald-300" />
          <Kpi label="Publicaciones a mejorar" value={fmtInt(s.publicaciones)} />
          <Kpi
            label={`Revisadas (${fmtInt(s.sinPuntaje)} sin puntaje${s.noLeidas > 0 ? `, ${fmtInt(s.noLeidas)} sin leer` : ""})`}
            value={fmtInt(s.publicacionesCapturadas)}
          />
        </div>
      )}

      {/* Ranking: por dónde empezar */}
      {s && s.ranking.length > 0 && (
        <div className="card p-3 sm:p-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Por dónde empezar · problema principal de cada SKU
          </div>
          <div className="space-y-2">
            {s.ranking.map((r) => (
              <div key={r.categoria} className="rounded-xl border border-white/10 bg-white/[0.02] p-2.5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold text-zinc-100">{r.categoria}</span>
                  <span className="text-xs text-zinc-400">
                    <b className="text-red-300">{fmtInt(r.reclamos)}</b> reclamos en{" "}
                    <b className="text-zinc-200">{fmtInt(r.skus)}</b> SKU
                  </span>
                </div>
                {r.comoMejorar && (
                  <p className="mt-1 text-xs leading-relaxed text-teal-200/80">{r.comoMejorar}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Destino de las alertas */}
      {hayCaptura && (
        <>
          <div className="card flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:gap-3 sm:p-4">
            <label htmlFor="mail-alertas" className="shrink-0 text-sm text-zinc-400">
              Avisar lo que empeora a:
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
          <p className="px-1 text-xs leading-relaxed text-zinc-500">
            El mail sale <b className="text-zinc-400">al importar una captura nueva</b>, comparándola
            con la anterior: avisa los SKU que sumaron{" "}
            {config ? config.params.minReclamos : 1} reclamo o más, o que perdieron puntos de
            experiencia. La primera captura no manda nada porque no hay con qué comparar.
          </p>
        </>
      )}

      {/* Buscador */}
      {hayCaptura && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por SKU, título, problema o MLU…"
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
      )}

      {loading && !report ? (
        <div className="card px-4 py-12 text-center text-sm text-zinc-400">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="mx-auto mb-2 h-5 w-5 animate-spin text-zinc-500">
            <path d="M21 12a9 9 0 1 1-2.64-6.36" strokeLinecap="round" />
          </svg>
          Armando el reporte con la última captura…
        </div>
      ) : hayCaptura && items.length === 0 ? (
        <div className="card px-4 py-12 text-center">
          <p className="text-sm text-zinc-300">✅ No hay SKU para mostrar con este filtro.</p>
          <p className="mt-1 text-xs text-zinc-500">Probá con otro filtro o limpiá la búsqueda.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {items.map((it) => (
            <Fila
              key={it.clave}
              it={it}
              cambio={report?.cambios.find((c) => c.clave === it.clave) ?? null}
              abierto={abierto === it.clave}
              onToggle={() => setAbierto(abierto === it.clave ? null : it.clave)}
            />
          ))}
        </div>
      )}

      {/* Historial de capturas */}
      {historial.length > 1 && (
        <div className="card p-3 sm:p-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Capturas importadas
          </div>
          <ul className="space-y-1 text-xs text-zinc-500">
            {historial.map((h, i) => (
              <li key={h.id} className={i === 0 ? "text-zinc-300" : ""}>
                {fmtDateTime(h.capturadoEn)} · {fmtInt(h.publicaciones)} publicaciones ·{" "}
                {fmtInt(h.skus)} SKU · {fmtInt(h.reclamos)} problemas
                {h.importadoPor ? ` · subió ${h.importadoPor}` : ""}
                {i === 0 ? " · en uso" : ""}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="px-1 text-xs leading-relaxed text-zinc-500">
        La <b className="text-zinc-400">experiencia de compra</b> es lo que ML mide con los problemas
        que tuvieron los compradores en las ventas de los últimos {VENTANA_DIAS} días, comparado
        contra productos parecidos de la competencia. No es lo mismo que la{" "}
        <b className="text-zinc-400">calidad</b> de la publicación (ficha, fotos, catálogo), que tiene
        su propio reporte. Las filas son <b className="text-zinc-400">SKU</b>: ML calcula la
        experiencia a nivel producto, así que las publicaciones que comparten SKU traen los mismos
        reclamos y los números se cuentan una sola vez.
        {report?.sinVentasBd ? " Las ventas de nuestra base no se pudieron leer en esta corrida." : ""}
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

function Badge({ children, tone }: { children: React.ReactNode; tone: string }) {
  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${tone}`}>{children}</span>;
}

function Fila({
  it,
  cambio,
  abierto,
  onToggle,
}: {
  it: ExperienciaSku;
  cambio: CambioSku | null;
  abierto: boolean;
  onToggle: () => void;
}) {
  const est = experienciaEstado(it);
  const ventas = it.ventas180d ?? it.ventasBd180d;
  const ventasDeLaBase = it.ventas180d === null && it.ventasBd180d !== null;

  return (
    <div className={`card overflow-hidden ${cambio ? "ring-1 ring-red-500/30" : ""}`}>
      <button onClick={onToggle} className="flex w-full items-start gap-3 p-3 text-left transition hover:bg-white/[0.03]">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${est.dot}`} aria-hidden />
            <span className="font-mono text-xs font-semibold text-zinc-300">
              {it.sku ?? it.clave}
            </span>
            {it.sinSku && <Badge tone="bg-zinc-500/15 text-zinc-400">sin SKU</Badge>}
            {it.publicaciones.length > 1 && (
              <Badge tone="bg-white/5 text-zinc-400">{it.publicaciones.length} publicaciones</Badge>
            )}
            {it.nivel && (
              <Badge tone={it.nivel === "Mala" ? "bg-red-500/20 text-red-300" : it.nivel === "Media" ? "bg-amber-500/20 text-amber-300" : "bg-emerald-500/15 text-emerald-300"}>
                {it.nivel}
              </Badge>
            )}
            {cambio && (
              <Badge tone="bg-red-500/20 text-red-300">
                {cambio.cayoEnRojo ? "pasó a rojo" : `+${cambio.deltaReclamos} reclamo${cambio.deltaReclamos === 1 ? "" : "s"}`}
              </Badge>
            )}
          </div>
          <div className="mt-1 line-clamp-2 text-sm font-medium leading-snug text-zinc-100">{it.titulo}</div>
          <div className="mt-1.5 text-[12px] leading-snug">
            <span className="text-zinc-500">Problema principal: </span>
            <span className={it.reclamos > 0 ? "text-amber-300" : "text-zinc-400"}>
              {it.problemaPrincipalTexto}
            </span>
          </div>
          {it.comoMejorar && (
            <div className="mt-1 text-[12px] leading-relaxed text-teal-200/70 line-clamp-2">
              {it.comoMejorar}
            </div>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-zinc-500">
            {ventas !== null && (
              <span>
                {fmtInt(ventas)} ventas/{VENTANA_DIAS}d{ventasDeLaBase ? " (nuestra base)" : ""}
              </span>
            )}
            {it.tiposProblema > 0 && <span>· {it.tiposProblema} tipo{it.tiposProblema === 1 ? "" : "s"} de problema</span>}
            {it.cancelaciones > 0 && <span>· {fmtInt(it.cancelaciones)} cancelaciones</span>}
            {it.experiencia !== null && <span>· listado {it.experiencia}%</span>}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className={`text-lg font-bold tabular-nums ${it.reclamos > 0 ? "text-red-300" : "text-zinc-500"}`}>
            {it.reclamos > 0 ? fmtInt(it.reclamos) : "—"}
          </div>
          <div className="text-[10px] uppercase tracking-wide text-zinc-500">
            {it.reclamos > 0 ? `reclamo${it.reclamos === 1 ? "" : "s"}` : est.label}
          </div>
        </div>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={`mt-1 h-4 w-4 shrink-0 text-zinc-500 transition-transform ${abierto ? "rotate-90" : ""}`}>
          <path d="m9 18 6-6-6-6" />
        </svg>
      </button>

      {abierto && (
        <div className="border-t border-white/10 p-3 sm:p-4">
          {cambio && (
            <div className="mb-3 rounded-xl border border-red-500/25 bg-red-500/10 p-2.5 text-xs text-red-200/90">
              <span className="font-semibold text-red-300">Empeoró: </span>
              reclamos {cambio.reclamosAntes} → {cambio.reclamos}
              {cambio.deltaExperiencia !== null &&
                ` · experiencia ${cambio.experienciaAntes}% → ${cambio.experiencia}%`}
              {cambio.nuevo && " · no estaba en la captura anterior"}
            </div>
          )}

          {it.aviso && (
            <div className="mb-3 rounded-xl border border-amber-500/25 bg-amber-500/10 px-2.5 py-2 text-xs leading-relaxed text-amber-200">
              {it.aviso}
            </div>
          )}

          {it.problemas.length > 0 ? (
            <>
              <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Tipos de problema ({it.problemas.length})
              </div>
              <ul className="space-y-2">
                {it.problemas.map((p, i) => (
                  <ProblemaLi key={p.codigo ?? `${p.categoria}-${i}`} p={p} />
                ))}
              </ul>
            </>
          ) : (
            <p className="text-xs text-zinc-500">
              {it.situacion === "sin-ventas"
                ? `MercadoLibre no calculó la experiencia: la publicación no tuvo ventas en ${VENTANA_DIAS} días.`
                : it.situacion === "sin-datos"
                  ? "No se pudo leer el detalle de esta publicación en la captura."
                  : "No hay problemas de compradores registrados en este SKU."}
            </p>
          )}

          {it.dist.length > 0 && (
            <>
              <div className="mt-4 mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Distribución por tipo de problema
              </div>
              <ul className="space-y-1 text-xs text-zinc-400">
                {it.dist.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            </>
          )}

          <div className="mt-4 mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Publicaciones ({it.publicaciones.length})
          </div>
          <div className="space-y-1.5">
            {it.publicaciones.map((p) => (
              <div key={p.id} className="flex items-center gap-2.5 rounded-lg border border-white/5 bg-white/[0.02] px-2.5 py-2 text-xs">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-zinc-200">{p.titulo}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-zinc-500">
                    <span className="font-mono">{p.id}</span>
                    {p.precio && <span>· {p.precio}</span>}
                    {p.stock && <span>· {p.stock}</span>}
                    {p.estadoMl && p.estadoMl !== "active" && <span>· {p.estadoMl}</span>}
                    {p.catalogo && <span>· catálogo</span>}
                    {p.calidad !== null && <span>· calidad {p.calidad}%</span>}
                  </div>
                </div>
                {p.experiencia !== null && (
                  <span className="shrink-0 font-bold tabular-nums text-zinc-300">{p.experiencia}%</span>
                )}
                {p.url && (
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="shrink-0 text-teal-300 transition hover:text-teal-200"
                    title="Abrir en MercadoLibre"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                      <path d="M7 17 17 7M7 7h10v10" />
                    </svg>
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ProblemaLi({ p }: { p: ProblemaTipo }) {
  return (
    <li className="rounded-xl border border-white/10 bg-white/[0.02] p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-zinc-100">{p.categoria}</span>
        {p.principal && <Badge tone="bg-orange-500/20 text-orange-300">Problema principal</Badge>}
        <Badge tone="bg-white/5 text-zinc-400">
          {p.cantidad} problema{p.cantidad === 1 ? "" : "s"}
        </Badge>
        {p.cancelaciones > 0 && (
          <Badge tone="bg-white/5 text-zinc-400">{p.cancelaciones} cancelaciones</Badge>
        )}
      </div>
      {p.detalle && <div className="mt-1 text-xs text-zinc-400">{p.detalle}</div>}
      {p.comoMejorar && (
        <div className="mt-1.5 text-xs leading-relaxed text-teal-200/80">
          <span className="font-semibold text-teal-300">Cómo mejorar según ML: </span>
          {p.comoMejorar}
        </div>
      )}
      {p.accion && <div className="mt-1 text-[11px] text-zinc-500">ML propone: {p.accion}</div>}
    </li>
  );
}
