"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fmtPeso, fmtInt, fmtUSD, fmtCBM2, fmtDate } from "@/lib/format";

// ---------- Tipos de las APIs ----------
type Channel = {
  ordenes: number;
  facturado: number;
  ventaConCosto: number;
  costo: number;
  comision: number;
  envio: number;
};
type ResumenResp = { channels: { ml: Channel; mayorista: Channel; otros: Channel; local: Channel } };
type ReposRow = { sku: string; titulo: string | null; vendidas: number; stock: number | null; costoOrigen: number | null };
type ReposResp = { rows: ReposRow[] };
type ImportResp = {
  contenedores: number;
  items: number;
  cbmTotal: number;
  transitoCount: number;
  transitoValorUSD: number;
  enCaminoSkus: number;
  enCaminoUnidades: number;
  proximoArribo: { name: string; eta: string | null } | null;
  trend: { month: string; facturado: number }[];
};

const PUBLI_PCT = 5;
const COM_LOCAL_PCT = 3;
const REPOS_MESES = 4;
const REPOS_MESES_PERIODO = 3;

const CH_KEYS = ["ml", "mayorista", "otros", "local"] as const;
const CH_META: Record<string, { label: string; bar: string }> = {
  ml: { label: "MercadoLibre", bar: "bg-sky-400" },
  mayorista: { label: "Mayorista", bar: "bg-emerald-400" },
  otros: { label: "Otros", bar: "bg-violet-400" },
  local: { label: "Local", bar: "bg-amber-400" },
};

// ---------- Fechas ----------
function fmtLocal(d: Date): string {
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}
function mtdRange() {
  const d = new Date();
  return { desde: fmtLocal(new Date(d.getFullYear(), d.getMonth(), 1)), hasta: fmtLocal(d) };
}
function prevMonthRange() {
  const d = new Date();
  const y = d.getFullYear();
  const m = d.getMonth();
  const diasPrev = new Date(y, m, 0).getDate(); // último día del mes anterior
  const dia = Math.min(d.getDate(), diasPrev);
  return { desde: fmtLocal(new Date(y, m - 1, 1)), hasta: fmtLocal(new Date(y, m - 1, dia)) };
}
function monthsAgoStr(n: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return fmtLocal(d);
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

// Métricas de ventas derivadas de un /api/resumen.
function deriveVentas(resp: ResumenResp) {
  const ch = resp.channels;
  let facturado = 0;
  let ventaCC = 0;
  let margen = 0;
  let ordenes = 0;
  const porCanal = CH_KEYS.map((k) => {
    const c = ch[k];
    const publi = k === "ml" ? (c.ventaConCosto * PUBLI_PCT) / 100 : 0;
    const comT = k === "local" ? (c.ventaConCosto * COM_LOCAL_PCT) / 100 : 0;
    const m = c.ventaConCosto - c.costo - (c.comision + comT) + c.envio - publi;
    facturado += c.facturado;
    ventaCC += c.ventaConCosto;
    margen += m;
    ordenes += c.ordenes;
    return { key: k as string, facturado: c.facturado, margen: m, pct: c.ventaConCosto ? m / c.ventaConCosto : 0, ordenes: c.ordenes };
  });
  return { facturado, margen, ventaCC, ordenes, pct: ventaCC ? margen / ventaCC : 0, ticket: ordenes ? facturado / ordenes : 0, porCanal };
}

const MES_LARGO = new Intl.DateTimeFormat("es-UY", { month: "long", year: "numeric" }).format(new Date());
function monthShort(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return ym;
  return new Intl.DateTimeFormat("es-UY", { month: "short" }).format(new Date(y, m - 1, 1));
}

export default function DashboardPanorama() {
  const [cur, setCur] = useState<{ data: ResumenResp | null; status: number } | null>(null);
  const [prev, setPrev] = useState<{ data: ResumenResp | null; status: number } | null>(null);
  const [imp, setImp] = useState<{ data: ImportResp | null; status: number } | null>(null);
  const [repos, setRepos] = useState<{ data: ReposResp | null; status: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const mtd = mtdRange();
    const pm = prevMonthRange();
    const desdeRepos = monthsAgoStr(REPOS_MESES_PERIODO);
    Promise.all([
      getJson<ResumenResp>(`/api/resumen?desde=${mtd.desde}&hasta=${mtd.hasta}`),
      getJson<ResumenResp>(`/api/resumen?desde=${pm.desde}&hasta=${pm.hasta}`),
      getJson<ImportResp>(`/api/dashboard`),
      getJson<ReposResp>(`/api/reposicion?desde=${desdeRepos}&hasta=${mtd.hasta}`),
    ]).then(([c, p, i, r]) => {
      if (!alive) return;
      setCur(c);
      setPrev(p);
      setImp(i);
      setRepos(r);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  const vCur = cur?.data ? deriveVentas(cur.data) : null;
  const vPrev = prev?.data ? deriveVentas(prev.data) : null;

  // Reposición: resumen + top a reponer.
  const reposCalc = (() => {
    const rows = repos?.data?.rows;
    if (!rows) return null;
    let skus = 0;
    let unidades = 0;
    let valor = 0;
    let conCosto = 0;
    const items: { sku: string; titulo: string | null; sugerida: number }[] = [];
    for (const r of rows) {
      const promMes = r.vendidas / REPOS_MESES_PERIODO;
      const sugerida = Math.max(0, Math.round(promMes * REPOS_MESES - Math.max(0, r.stock ?? 0)));
      if (sugerida <= 0) continue;
      skus += 1;
      unidades += sugerida;
      if (r.costoOrigen != null) {
        valor += sugerida * r.costoOrigen;
        conCosto += 1;
      }
      items.push({ sku: r.sku, titulo: r.titulo, sugerida });
    }
    items.sort((a, b) => b.sugerida - a.sugerida);
    return { skus, unidades, valor, conCosto, top: items.slice(0, 4) };
  })();

  const trend = imp?.data?.trend ?? [];
  const maxTrend = Math.max(1, ...trend.map((t) => t.facturado));
  const maxCanal = vCur ? Math.max(1, ...vCur.porCanal.map((c) => c.facturado)) : 1;

  return (
    <div className="space-y-4">
      {/* ---------- KPIs con variación vs mes anterior ---------- */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label={`Facturación · ${MES_LARGO}`} value={vCur ? fmtPeso(vCur.facturado) : "—"} delta={pctChange(vCur?.facturado, vPrev?.facturado)} loading={loading} />
        <Kpi label="Margen del mes" value={vCur ? fmtPeso(vCur.margen) : "—"} sub={vCur ? `${(vCur.pct * 100).toFixed(0)}% s/ venta` : undefined} delta={pctChange(vCur?.margen, vPrev?.margen)} tone={vCur && vCur.margen < 0 ? "red" : "green"} loading={loading} />
        <Kpi label="Órdenes del mes" value={vCur ? fmtInt(vCur.ordenes) : "—"} delta={pctChange(vCur?.ordenes, vPrev?.ordenes)} loading={loading} />
        <Kpi label="Ticket promedio" value={vCur ? fmtPeso(vCur.ticket) : "—"} delta={pctChange(vCur?.ticket, vPrev?.ticket)} loading={loading} />
      </div>

      {/* ---------- VENTAS: tendencia + canales ---------- */}
      <Panel title="Ventas" subtitle="Tendencia y desglose por canal" href="/resumen"
        icon={<><path d="M3 3v18h18" /><path d="M7 14l3-3 3 3 5-6" /></>} accent="from-emerald-500/15"
        loading={loading} status={cur?.status}>
        {vCur && (
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Tendencia 6 meses */}
            <div>
              <p className="mb-3 text-xs font-medium uppercase tracking-wide text-zinc-500">Facturación · últimos 6 meses</p>
              {trend.length > 0 ? (
                <div className="flex h-40 items-end gap-2">
                  {trend.map((t, i) => {
                    const isLast = i === trend.length - 1;
                    return (
                      <div key={t.month} className="flex flex-1 flex-col items-center gap-1.5" title={fmtPeso(t.facturado)}>
                        <div className="flex w-full flex-1 items-end">
                          <div className={`w-full rounded-t ${isLast ? "brand-gradient" : "bg-white/15"}`} style={{ height: `${Math.max(3, (t.facturado / maxTrend) * 100)}%` }} />
                        </div>
                        <span className={`text-[10px] ${isLast ? "font-semibold text-teal-300" : "text-zinc-500"}`}>{monthShort(t.month)}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex h-40 items-center text-sm text-zinc-600">Sin datos de tendencia.</div>
              )}
            </div>
            {/* Canales */}
            <div>
              <p className="mb-3 text-xs font-medium uppercase tracking-wide text-zinc-500">Por canal · {MES_LARGO}</p>
              <div className="space-y-2.5">
                {vCur.porCanal.map((c) => {
                  const pc = vPrev?.porCanal.find((x) => x.key === c.key);
                  return (
                    <div key={c.key} className="flex items-center gap-2 text-sm">
                      <span className="w-24 shrink-0 text-zinc-300">{CH_META[c.key].label}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded bg-white/5">
                        <div className={`h-full ${CH_META[c.key].bar}`} style={{ width: `${(c.facturado / maxCanal) * 100}%` }} />
                      </div>
                      <span className="w-20 shrink-0 text-right tabular-nums text-zinc-200">{fmtPeso(c.facturado)}</span>
                      <span className={`w-12 shrink-0 text-right tabular-nums text-xs ${c.pct < 0 ? "text-red-400" : "text-emerald-400"}`}>{(c.pct * 100).toFixed(0)}%</span>
                      <span className="w-12 shrink-0 text-right"><DeltaChip pct={pctChange(c.facturado, pc?.facturado)} small /></span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ---------- IMPORTACIONES ---------- */}
        <Panel title="Importaciones" subtitle="Contenedores y mercadería en tránsito" href="/"
          icon={<><path d="M3 7h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" /><path d="M3 7l2-3h14l2 3M9 7v12M15 7v12" /></>}
          accent="from-indigo-500/15" loading={loading} status={imp?.status}>
          {imp?.data && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Stat label="Contenedores" value={fmtInt(imp.data.contenedores)} />
                <Stat label="En tránsito" value={fmtUSD(imp.data.transitoValorUSD)} tone="green" sub={`${imp.data.transitoCount} sin recibir`} />
                <Stat label="Unidades en camino" value={fmtInt(imp.data.enCaminoUnidades)} sub={`${imp.data.enCaminoSkus} SKUs`} />
                <Stat label="CBM total" value={fmtCBM2(imp.data.cbmTotal)} />
              </div>
              {imp.data.proximoArribo && (
                <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5 text-sm">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} className="h-4 w-4 text-indigo-300"><path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  <span className="text-zinc-400">Próximo arribo:</span>
                  <span className="font-semibold text-zinc-100">{imp.data.proximoArribo.name}</span>
                  <span className="ml-auto tabular-nums text-zinc-400">{fmtDate(imp.data.proximoArribo.eta)}</span>
                </div>
              )}
            </div>
          )}
        </Panel>

        {/* ---------- REPOSICIÓN ---------- */}
        <Panel title="Reposición" subtitle={`Sugerido · ${REPOS_MESES}m de cobertura`} href="/reposicion"
          icon={<><path d="M3 3v18h18M7 14l3-3 3 3 5-6" /></>} accent="from-teal-500/15"
          loading={loading} status={repos?.status}>
          {reposCalc && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <Stat label="SKUs a reponer" value={fmtInt(reposCalc.skus)} />
                <Stat label="Unidades" value={fmtInt(reposCalc.unidades)} />
                <Stat label="Valor (USD)" value={fmtUSD(reposCalc.valor)} tone="green" sub={`${reposCalc.conCosto}/${reposCalc.skus} con costo`} />
              </div>
              {reposCalc.top.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">Top a reponer</p>
                  <div className="space-y-1">
                    {reposCalc.top.map((t) => (
                      <div key={t.sku} className="flex items-center gap-2 text-xs">
                        <span className="w-16 shrink-0 font-mono text-zinc-400">{t.sku}</span>
                        <span className="flex-1 truncate text-zinc-300" title={t.titulo ?? ""}>{t.titulo ?? "—"}</span>
                        <span className="shrink-0 font-semibold tabular-nums text-teal-300">{fmtInt(t.sugerida)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

// ---------- Helpers de UI ----------
function pctChange(cur?: number, prev?: number): number | null {
  if (cur == null || prev == null || prev <= 0) return null;
  return (cur - prev) / prev;
}

function DeltaChip({ pct, small }: { pct: number | null; small?: boolean }) {
  if (pct == null) return small ? <span className="text-[10px] text-zinc-600">—</span> : null;
  const up = pct >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 tabular-nums ${small ? "text-[10px]" : "text-xs font-semibold"} ${up ? "text-emerald-400" : "text-red-400"}`}>
      {up ? "▲" : "▼"}{Math.abs(pct * 100).toFixed(0)}%
    </span>
  );
}

function Kpi({ label, value, sub, delta, tone, loading }: { label: string; value: string; sub?: string; delta?: number | null; tone?: "red" | "green"; loading?: boolean }) {
  const color = tone === "red" ? "text-red-400" : tone === "green" ? "text-emerald-400" : "text-white";
  return (
    <div className="card p-4">
      <div className="truncate text-xs text-zinc-500" title={label}>{label}</div>
      <div className={`mt-0.5 text-2xl font-bold tabular-nums ${color}`}>{loading ? "…" : value}</div>
      <div className="mt-1 flex items-center gap-2">
        {delta != null && <DeltaChip pct={delta} />}
        {sub && <span className="text-[11px] text-zinc-500">{sub}</span>}
        {delta != null && <span className="text-[11px] text-zinc-600">vs mes ant.</span>}
      </div>
    </div>
  );
}

function Panel({ title, subtitle, href, icon, accent, loading, status, children }: {
  title: string; subtitle: string; href: string; icon: React.ReactNode; accent: string; loading: boolean; status?: number; children: React.ReactNode;
}) {
  const denied = status === 403;
  const failed = !loading && status !== undefined && status !== 200 && status !== 403;
  return (
    <div className="card relative overflow-hidden p-5">
      <div className={`pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-gradient-to-br ${accent} to-transparent blur-2xl`} />
      <div className="relative mb-4 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="brand-gradient flex h-10 w-10 items-center justify-center rounded-xl text-white">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">{icon}</svg>
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">{title}</h2>
            <p className="text-xs text-zinc-500">{subtitle}</p>
          </div>
        </div>
        <Link href={href} className="text-sm font-semibold text-indigo-400 transition hover:text-indigo-300">Ver detalle →</Link>
      </div>
      <div className="relative">
        {loading ? (
          <div className="flex h-24 items-center text-sm text-zinc-500">Cargando…</div>
        ) : denied ? (
          <div className="flex h-24 items-center text-sm text-zinc-500">No tenés acceso a esta sección.</div>
        ) : failed ? (
          <div className="flex h-24 items-center text-sm text-amber-400/80">No se pudieron cargar los datos.</div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, tone, sub }: { label: string; value: string; tone?: "red" | "green"; sub?: string }) {
  const color = tone === "red" ? "text-red-400" : tone === "green" ? "text-emerald-400" : "text-white";
  return (
    <div>
      <div className="text-xs text-zinc-500">{label}</div>
      <div className={`text-xl font-bold tabular-nums ${color}`}>{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-zinc-500">{sub}</div>}
    </div>
  );
}
