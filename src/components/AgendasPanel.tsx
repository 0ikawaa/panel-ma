"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AGENDA_TZ, type Agenda, type AgendaStats } from "@/lib/agendas";

type Vista = "proximas" | "pasadas";
type FiltroModo = "todas" | "meet" | "office";

interface Respuesta {
  agendas: Agenda[];
  stats: AgendaStats;
}

// ------------------------------------------------------------------- formato

const fecha = (iso: string, opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("es-UY", { timeZone: AGENDA_TZ, ...opts }).format(new Date(iso));

const hora = (iso: string) => fecha(iso, { hour: "2-digit", minute: "2-digit", hour12: false });

const diaLargo = (iso: string) =>
  fecha(iso, { weekday: "long", day: "numeric", month: "long" });

const capitalizar = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "en 3 días", "hoy", "hace 2 semanas". */
function cuandoRelativo(iso: string, ahora: Date): string {
  const dias = Math.round((new Date(iso).getTime() - ahora.getTime()) / 864e5);
  if (dias === 0) return "hoy";
  if (dias === 1) return "mañana";
  if (dias === -1) return "ayer";
  const rtf = new Intl.RelativeTimeFormat("es", { numeric: "auto" });
  if (Math.abs(dias) < 7) return rtf.format(dias, "day");
  if (Math.abs(dias) < 30) return rtf.format(Math.round(dias / 7), "week");
  return rtf.format(Math.round(dias / 30), "month");
}

const estadoInvitado: Record<string, { label: string; clase: string }> = {
  accepted: { label: "Confirmó", clase: "bg-emerald-500/15 text-emerald-300" },
  declined: { label: "Rechazó", clase: "bg-red-500/15 text-red-300" },
  tentative: { label: "Quizás", clase: "bg-amber-500/15 text-amber-300" },
  needsAction: { label: "Sin responder", clase: "bg-zinc-500/15 text-zinc-400" },
};

// --------------------------------------------------------------- componentes

function Tarjeta({ valor, label, destacado }: { valor: number; label: string; destacado?: boolean }) {
  return (
    <div className="card p-4">
      <p className={`text-2xl font-bold ${destacado && valor > 0 ? "text-teal-300" : "text-white"}`}>
        {valor}
      </p>
      <p className="mt-0.5 text-xs font-medium text-zinc-400">{label}</p>
    </div>
  );
}

function FilaAgenda({ a, ahora, pasada }: { a: Agenda; ahora: Date; pasada: boolean }) {
  const [abierta, setAbierta] = useState(false);
  const esMeet = a.mode === "meet";
  const estado = a.guestStatus ? estadoInvitado[a.guestStatus] : null;

  return (
    <div className={`card overflow-hidden transition ${pasada ? "opacity-60" : ""}`}>
      <button
        type="button"
        onClick={() => setAbierta((v) => !v)}
        className="flex w-full items-center gap-3 p-3 text-left transition hover:bg-white/[0.03] sm:gap-4 sm:p-4"
      >
        {/* Fecha */}
        <div className="flex w-14 shrink-0 flex-col items-center rounded-xl border border-white/10 bg-white/[0.03] py-2">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
            {fecha(a.start, { month: "short" }).replace(".", "")}
          </span>
          <span className="text-lg font-bold leading-tight text-white">
            {fecha(a.start, { day: "numeric" })}
          </span>
        </div>

        {/* Datos principales */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-semibold text-white">{a.name}</p>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                esMeet ? "bg-indigo-500/15 text-indigo-300" : "bg-teal-500/15 text-teal-300"
              }`}
            >
              {esMeet ? "Videollamada" : "Presencial"}
            </span>
            {estado && (
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${estado.clase}`}>
                {estado.label}
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-sm text-zinc-400">
            {capitalizar(diaLargo(a.start))} · {hora(a.start)} a {hora(a.end)} h
            {!pasada && <span className="text-zinc-500"> · {cuandoRelativo(a.start, ahora)}</span>}
          </p>
        </div>

        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`h-4 w-4 shrink-0 text-zinc-500 transition-transform ${abierta ? "rotate-90" : ""}`}
        >
          <path d="m9 18 6-6-6-6" />
        </svg>
      </button>

      {abierta && (
        <div className="space-y-3 border-t border-white/10 px-3 py-3 sm:px-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Dato label="Email">
              {a.email ? (
                <a href={`mailto:${a.email}`} className="text-teal-300 hover:underline">
                  {a.email}
                </a>
              ) : (
                "—"
              )}
            </Dato>
            <Dato label="Teléfono">
              {a.phone ? (
                <a
                  href={`https://wa.me/${a.phone.replace(/\D/g, "")}`}
                  target="_blank"
                  rel="noopener"
                  className="text-teal-300 hover:underline"
                >
                  {a.phone}
                </a>
              ) : (
                "—"
              )}
            </Dato>
          </div>

          {a.notes && (
            <Dato label="Qué quiere importar">
              <span className="whitespace-pre-wrap text-zinc-300">{a.notes}</span>
            </Dato>
          )}

          {esMeet && a.meetLink && (
            <Dato label="Videollamada">
              <a
                href={a.meetLink}
                target="_blank"
                rel="noopener"
                className="break-all text-teal-300 hover:underline"
              >
                {a.meetLink}
              </a>
            </Dato>
          )}

          {!esMeet && a.location && <Dato label="Lugar">{a.location}</Dato>}

          <div className="flex flex-wrap gap-2 pt-1">
            {a.htmlLink && (
              <a
                href={a.htmlLink}
                target="_blank"
                rel="noopener"
                className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-semibold text-zinc-300 transition hover:border-white/20 hover:text-white"
              >
                Abrir en Google Calendar
              </a>
            )}
            {esMeet && a.meetLink && !pasada && (
              <a
                href={a.meetLink}
                target="_blank"
                rel="noopener"
                className="brand-gradient rounded-lg px-3 py-1.5 text-xs font-semibold text-white"
              >
                Entrar a la reunión
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Dato({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-0.5 text-sm text-zinc-200">{children}</p>
    </div>
  );
}

// ------------------------------------------------------------------ principal

export default function AgendasPanel() {
  const [data, setData] = useState<Respuesta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [vista, setVista] = useState<Vista>("proximas");
  const [modo, setModo] = useState<FiltroModo>("todas");
  const [busqueda, setBusqueda] = useState("");

  // Se fija una sola vez para que los "en 3 días" no bailen entre renders.
  const [ahora] = useState(() => new Date());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/agendas", { cache: "no-store" });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || `Error ${res.status}`);
      setData(j);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // El wrapper async difiere el setState del efecto: evita el render en
    // cascada que marca react-hooks/set-state-in-effect.
    void (async () => {
      await load();
    })();
  }, [load]);

  const visibles = useMemo(() => {
    const todas = data?.agendas ?? [];
    const q = busqueda.trim().toLowerCase();

    return todas
      .filter((a) => {
        const futura = new Date(a.start) >= ahora;
        if (vista === "proximas" ? !futura : futura) return false;
        if (modo !== "todas" && a.mode !== modo) return false;
        if (!q) return true;
        return [a.name, a.email, a.phone, a.notes].join(" ").toLowerCase().includes(q);
      })
      .sort((a, b) =>
        vista === "proximas"
          ? a.start.localeCompare(b.start)
          : b.start.localeCompare(a.start),
      );
  }, [data, vista, modo, busqueda, ahora]);

  // Se agrupan por día para que la lista se lea como una agenda.
  const porDia = useMemo(() => {
    const grupos = new Map<string, Agenda[]>();
    for (const a of visibles) {
      const key = a.start.slice(0, 10);
      const lista = grupos.get(key);
      if (lista) lista.push(a);
      else grupos.set(key, [a]);
    }
    return [...grupos.entries()];
  }, [visibles]);

  const s = data?.stats;

  return (
    <div className="space-y-4">
      {/* Métricas */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tarjeta valor={s?.hoy ?? 0} label="Hoy" destacado />
        <Tarjeta valor={s?.semana ?? 0} label="Próximos 7 días" />
        <Tarjeta valor={s?.mes ?? 0} label="Resto del mes" />
        <Tarjeta valor={s?.proximas ?? 0} label="Próximas en total" />
      </div>

      {/* Controles */}
      <div className="card flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-white/10 p-0.5">
            {(["proximas", "pasadas"] as Vista[]).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setVista(v)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                  vista === v ? "brand-gradient text-white" : "text-zinc-400 hover:text-white"
                }`}
              >
                {v === "proximas" ? "Próximas" : "Historial"}
              </button>
            ))}
          </div>

          <div className="flex rounded-lg border border-white/10 p-0.5">
            {(
              [
                ["todas", "Todas"],
                ["meet", "Videollamada"],
                ["office", "Presencial"],
              ] as [FiltroModo, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setModo(key)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                  modo === key ? "bg-white/10 text-white" : "text-zinc-400 hover:text-white"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre, mail o consulta…"
            className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-sm text-white placeholder:text-zinc-500 focus:border-teal-400/50 focus:outline-none sm:w-64"
          />
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="shrink-0 rounded-lg border border-white/10 p-2 text-zinc-400 transition hover:border-white/20 hover:text-white disabled:opacity-50"
            title="Actualizar"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
            >
              <path d="M21 2v6h-6M3 22v-6h6" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L21 8M21 15a9 9 0 0 1-14.85 3.36L3 16" />
            </svg>
          </button>
        </div>
      </div>

      {/* Estados */}
      {error && (
        <div className="card border-red-500/30 bg-red-500/5 p-4">
          <p className="text-sm font-semibold text-red-300">No se pudieron cargar las asesorías</p>
          <p className="mt-1 text-sm text-zinc-400">{error}</p>
        </div>
      )}

      {loading && !data && (
        <div className="card p-10 text-center text-sm text-zinc-400">Cargando asesorías…</div>
      )}

      {!loading && !error && visibles.length === 0 && (
        <div className="card p-10 text-center">
          <p className="text-sm font-medium text-zinc-300">
            {vista === "proximas"
              ? "No hay asesorías agendadas."
              : "No hay asesorías en el historial."}
          </p>
          <p className="mt-1 text-sm text-zinc-500">
            {busqueda || modo !== "todas"
              ? "Probá quitando los filtros."
              : "Cuando alguien reserve desde la web, aparece acá."}
          </p>
        </div>
      )}

      {/* Lista agrupada por día */}
      {porDia.map(([dia, lista]) => (
        <div key={dia} className="space-y-2">
          <p className="px-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            {capitalizar(diaLargo(lista[0].start))}
            <span className="ml-2 font-normal normal-case tracking-normal text-zinc-600">
              {lista.length} {lista.length === 1 ? "asesoría" : "asesorías"}
            </span>
          </p>
          {lista.map((a) => (
            <FilaAgenda key={a.id} a={a} ahora={ahora} pasada={vista === "pasadas"} />
          ))}
        </div>
      ))}
    </div>
  );
}
