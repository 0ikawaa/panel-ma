"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fmtPeso, fmtInt, fmtUSD, fmtCBM2 } from "@/lib/format";

// ---------- Tipos de las APIs ----------
type Channel = {
  ordenes: number;
  facturado: number;
  ordenesConCosto: number;
  ventaConCosto: number;
  costo: number;
  comision: number;
  envio: number;
};
type ResumenResp = { channels: { ml: Channel; mayorista: Channel; otros: Channel; local: Channel } };
type ReposRow = { vendidas: number; stock: number | null; costoOrigen: number | null };
type ReposResp = { rows: ReposRow[] };
type ImportResp = {
  contenedores: number;
  items: number;
  cbmTotal: number;
  transitoCount: number;
  transitoValorUSD: number;
  enCaminoSkus: number;
  enCaminoUnidades: number;
};

// Publicidad ML y comisión de tarjeta del Local por defecto (igual que Resumen).
const PUBLI_PCT = 5;
const COM_LOCAL_PCT = 3;
// Parámetros de reposición por defecto (igual que la pantalla de Reposición).
const REPOS_MESES = 4;
const REPOS_MESES_PERIODO = 3;

function todayStr(): string {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}
function firstOfMonthStr(): string {
  const d = new Date();
  const off = d.getTimezoneOffset();
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  return new Date(first.getTime() - off * 60000).toISOString().slice(0, 10);
}
function monthsAgoStr(n: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

async function getJson<T>(u: string): Promise<{ data: T | null; status: number }> {
  try {
    const res = await fetch(u, { cache: "no-store", signal: AbortSignal.timeout(60000) });
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      /* no-JSON */
    }
    return { data: res.ok ? (json as T) : null, status: res.status };
  } catch {
    return { data: null, status: 0 };
  }
}

const MES_LARGO = new Intl.DateTimeFormat("es-UY", { month: "long", year: "numeric" }).format(new Date());

export default function DashboardPanorama() {
  const [ventas, setVentas] = useState<{ data: ResumenResp | null; status: number } | null>(null);
  const [imp, setImp] = useState<{ data: ImportResp | null; status: number } | null>(null);
  const [repos, setRepos] = useState<{ data: ReposResp | null; status: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const desdeMes = firstOfMonthStr();
    const hoy = todayStr();
    const desdeRepos = monthsAgoStr(REPOS_MESES_PERIODO);
    Promise.all([
      getJson<ResumenResp>(`/api/resumen?desde=${desdeMes}&hasta=${hoy}`),
      getJson<ImportResp>(`/api/dashboard`),
      getJson<ReposResp>(`/api/reposicion?desde=${desdeRepos}&hasta=${hoy}`),
    ]).then(([v, i, r]) => {
      if (!alive) return;
      setVentas(v);
      setImp(i);
      setRepos(r);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  // ---------- Derivados de Ventas ----------
  const ventasCalc = (() => {
    const ch = ventas?.data?.channels;
    if (!ch) return null;
    const keys = ["ml", "mayorista", "otros", "local"] as const;
    let facturado = 0;
    let ventaCC = 0;
    let margen = 0;
    const barras = keys.map((k) => {
      const c = ch[k];
      const publi = k === "ml" ? (c.ventaConCosto * PUBLI_PCT) / 100 : 0;
      const comTarjeta = k === "local" ? (c.ventaConCosto * COM_LOCAL_PCT) / 100 : 0;
      const m = c.ventaConCosto - c.costo - (c.comision + comTarjeta) + c.envio - publi;
      facturado += c.facturado;
      ventaCC += c.ventaConCosto;
      margen += m;
      return { key: k, facturado: c.facturado };
    });
    const pct = ventaCC ? margen / ventaCC : 0;
    return { facturado, margen, pct, barras };
  })();

  // ---------- Derivados de Reposición ----------
  const reposCalc = (() => {
    const rows = repos?.data?.rows;
    if (!rows) return null;
    let skus = 0;
    let unidades = 0;
    let valor = 0;
    for (const r of rows) {
      const promMes = r.vendidas / REPOS_MESES_PERIODO;
      const stockPos = Math.max(0, r.stock ?? 0);
      const sugerida = Math.max(0, Math.round(promMes * REPOS_MESES - stockPos));
      if (sugerida <= 0) continue;
      skus += 1;
      unidades += sugerida;
      if (r.costoOrigen != null) valor += sugerida * r.costoOrigen;
    }
    return { skus, unidades, valor };
  })();

  const META: Record<string, { label: string; bar: string }> = {
    ml: { label: "MercadoLibre", bar: "bg-sky-400" },
    mayorista: { label: "Mayorista", bar: "bg-emerald-400" },
    otros: { label: "Otros", bar: "bg-violet-400" },
    local: { label: "Local", bar: "bg-amber-400" },
  };
  const maxFact = ventasCalc ? Math.max(1, ...ventasCalc.barras.map((b) => b.facturado)) : 1;

  return (
    <div className="space-y-4">
      {/* ---------- VENTAS ---------- */}
      <Panel
        title="Ventas"
        subtitle={`Facturación de ${MES_LARGO}`}
        href="/resumen"
        icon={<><path d="M3 3v18h18" /><path d="M7 14l3-3 3 3 5-6" /></>}
        accent="from-emerald-500/15"
        loading={loading}
        status={ventas?.status}
      >
        {ventasCalc && (
          <div className="grid gap-4 lg:grid-cols-[auto_1fr]">
            <div className="flex gap-8">
              <Stat label="Facturado" value={fmtPeso(ventasCalc.facturado)} big />
              <Stat
                label={`Margen (${(ventasCalc.pct * 100).toFixed(0)}%)`}
                value={fmtPeso(ventasCalc.margen)}
                tone={ventasCalc.margen < 0 ? "red" : "green"}
                big
              />
            </div>
            <div className="min-w-0 space-y-1.5 self-center">
              {ventasCalc.barras.map((b) => (
                <div key={b.key} className="flex items-center gap-2 text-xs">
                  <span className="w-24 shrink-0 text-zinc-400">{META[b.key].label}</span>
                  <div className="h-2.5 flex-1 overflow-hidden rounded bg-white/5">
                    <div className={`h-full ${META[b.key].bar}`} style={{ width: `${(b.facturado / maxFact) * 100}%` }} />
                  </div>
                  <span className="w-24 shrink-0 text-right tabular-nums text-zinc-300">{fmtPeso(b.facturado)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ---------- IMPORTACIONES ---------- */}
        <Panel
          title="Importaciones"
          subtitle="Contenedores y mercadería en tránsito"
          href="/"
          icon={<><path d="M3 7h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" /><path d="M3 7l2-3h14l2 3M9 7v12M15 7v12" /></>}
          accent="from-indigo-500/15"
          loading={loading}
          status={imp?.status}
        >
          {imp?.data && (
            <div className="grid grid-cols-2 gap-4">
              <Stat label="Contenedores" value={fmtInt(imp.data.contenedores)} />
              <Stat label="En tránsito" value={fmtUSD(imp.data.transitoValorUSD)} tone="green" />
              <Stat label="Unidades en camino" value={fmtInt(imp.data.enCaminoUnidades)} />
              <Stat label="CBM total" value={fmtCBM2(imp.data.cbmTotal)} />
            </div>
          )}
        </Panel>

        {/* ---------- REPOSICIÓN ---------- */}
        <Panel
          title="Reposición"
          subtitle={`Sugerido (${REPOS_MESES}m, últimos ${REPOS_MESES_PERIODO} meses)`}
          href="/reposicion"
          icon={<><path d="M3 3v18h18M7 14l3-3 3 3 5-6" /></>}
          accent="from-teal-500/15"
          loading={loading}
          status={repos?.status}
        >
          {reposCalc && (
            <div className="grid grid-cols-3 gap-4">
              <Stat label="SKUs a reponer" value={fmtInt(reposCalc.skus)} />
              <Stat label="Unidades" value={fmtInt(reposCalc.unidades)} />
              <Stat label="Valor (USD)" value={fmtUSD(reposCalc.valor)} tone="green" />
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

// ---------- Subcomponentes ----------
function Panel({
  title,
  subtitle,
  href,
  icon,
  accent,
  loading,
  status,
  children,
}: {
  title: string;
  subtitle: string;
  href: string;
  icon: React.ReactNode;
  accent: string;
  loading: boolean;
  status?: number;
  children: React.ReactNode;
}) {
  const denied = status === 403;
  const failed = !loading && status !== undefined && status !== 200 && status !== 403;
  return (
    <div className={`card relative overflow-hidden p-5`}>
      <div className={`pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-gradient-to-br ${accent} to-transparent blur-2xl`} />
      <div className="relative mb-4 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="brand-gradient flex h-10 w-10 items-center justify-center rounded-xl text-white">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
              {icon}
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">{title}</h2>
            <p className="text-xs text-zinc-500">{subtitle}</p>
          </div>
        </div>
        <Link href={href} className="text-sm font-semibold text-indigo-400 transition hover:text-indigo-300">
          Ver detalle →
        </Link>
      </div>
      <div className="relative">
        {loading ? (
          <div className="flex h-16 items-center text-sm text-zinc-500">Cargando…</div>
        ) : denied ? (
          <div className="flex h-16 items-center text-sm text-zinc-500">No tenés acceso a esta sección.</div>
        ) : failed ? (
          <div className="flex h-16 items-center text-sm text-amber-400/80">No se pudieron cargar los datos.</div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, tone, big }: { label: string; value: string; tone?: "red" | "green"; big?: boolean }) {
  const color = tone === "red" ? "text-red-400" : tone === "green" ? "text-emerald-400" : "text-white";
  return (
    <div>
      <div className="text-xs text-zinc-500">{label}</div>
      <div className={`${big ? "text-2xl" : "text-xl"} font-bold tabular-nums ${color}`}>{value}</div>
    </div>
  );
}
