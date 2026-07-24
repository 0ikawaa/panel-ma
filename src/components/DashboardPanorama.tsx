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
function monthsAgoStr(n: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return fmtLocal(d);
}
function currentYm(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
// Rango (desde/hasta) de un mes "YYYY-MM": si es el mes en curso llega hasta hoy
// (MTD); si es un mes pasado, el mes completo.
function ymRange(ym: string): { desde: string; hasta: string } {
  const [y, m] = ym.split("-").map(Number);
  const first = new Date(y, m - 1, 1);
  const today = new Date();
  const esActual = y === today.getFullYear() && m - 1 === today.getMonth();
  const last = esActual ? today : new Date(y, m, 0); // 0 = último día del mes
  return { desde: fmtLocal(first), hasta: fmtLocal(last) };
}
// Mes anterior a "YYYY-MM", hasta el mismo día que el rango elegido (comparación
// pareja: MTD vs misma porción del mes previo; mes completo vs mes completo).
function ymPrevRange(ym: string): { desde: string; hasta: string } {
  const [y, m] = ym.split("-").map(Number);
  const diaTope = Number(ymRange(ym).hasta.slice(8, 10));
  const diasPrev = new Date(y, m - 1, 0).getDate();
  const dia = Math.min(diaTope, diasPrev);
  return { desde: fmtLocal(new Date(y, m - 2, 1)), hasta: fmtLocal(new Date(y, m - 2, dia)) };
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

function ymLong(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return ym;
  return new Intl.DateTimeFormat("es-UY", { month: "long", year: "numeric" }).format(new Date(y, m - 1, 1));
}
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
  // Mes elegido en el gráfico de tendencia (YYYY-MM). Arranca en el mes en curso.
  const [selMonth, setSelMonth] = useState<string>(currentYm);

  // Tendencia, importaciones y reposición: una sola vez (no dependen del mes).
  useEffect(() => {
    let alive = true;
    const desdeRepos = monthsAgoStr(REPOS_MESES_PERIODO);
    getJson<ImportResp>(`/api/dashboard`).then((i) => { if (alive) setImp(i); });
    getJson<ReposResp>(`/api/reposicion?desde=${desdeRepos}&hasta=${fmtLocal(new Date())}`).then((r) => { if (alive) setRepos(r); });
    return () => {
      alive = false;
    };
  }, []);

  // Ventas del mes seleccionado (+ mes anterior para la variación). Se re-consulta
  // al cambiar de mes en el gráfico.
  useEffect(() => {
    let alive = true;
    setCur(null);
    setPrev(null);
    const r = ymRange(selMonth);
    const p = ymPrevRange(selMonth);
    getJson<ResumenResp>(`/api/resumen?desde=${r.desde}&hasta=${r.hasta}`).then((c) => { if (alive) setCur(c); });
    getJson<ResumenResp>(`/api/resumen?desde=${p.desde}&hasta=${p.hasta}`).then((pp) => { if (alive) setPrev(pp); });
    return () => {
      alive = false;
    };
  }, [selMonth]);

  const selLong = ymLong(selMonth);

  // Loading por sección (cada estado es null hasta que su fetch resuelve).
  const loadingVentas = cur === null;
  const loadingImp = imp === null;
  const loadingRepos = repos === null;

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
        <Kpi label={`Facturación · ${selLong}`} value={vCur ? fmtPeso(vCur.facturado) : "—"} delta={pctChange(vCur?.facturado, vPrev?.facturado)} loading={loadingVentas} />
        <Kpi label="Margen del mes" value={vCur ? fmtPeso(vCur.margen) : "—"} sub={vCur ? `${(vCur.pct * 100).toFixed(0)}% s/ venta` : undefined} delta={pctChange(vCur?.margen, vPrev?.margen)} tone={vCur && vCur.margen < 0 ? "red" : "green"} loading={loadingVentas} />
        <Kpi label="Órdenes del mes" value={vCur ? fmtInt(vCur.ordenes) : "—"} delta={pctChange(vCur?.ordenes, vPrev?.ordenes)} loading={loadingVentas} />
        <Kpi label="Ticket promedio" value={vCur ? fmtPeso(vCur.ticket) : "—"} delta={pctChange(vCur?.ticket, vPrev?.ticket)} loading={loadingVentas} />
      </div>

      {/* ---------- VENTAS: tendencia + canales (cada columna carga por su cuenta) ---------- */}
      <Panel title="Ventas" subtitle="Tendencia y desglose por canal" href="/resumen"
        icon={<><path d="M3 3v18h18" /><path d="M7 14l3-3 3 3 5-6" /></>} accent="from-emerald-500/15"
        loading={false}>
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Tendencia 6 meses — viene de /api/dashboard, independiente de ventas */}
          <div>
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-zinc-500">
              Facturación · últimos 6 meses <span className="normal-case text-zinc-600">· tocá un mes</span>
            </p>
            {loadingImp ? (
              <div className="flex h-40 items-center text-sm text-zinc-500">Cargando…</div>
            ) : trend.length > 0 ? (
              <div className="flex h-40 items-end gap-2">
                {trend.map((t) => {
                  const isSel = t.month === selMonth;
                  // Altura en px (no %): el % no resuelve dentro de un flex-col sin
                  // altura definida y las barras quedaban colapsadas. 144px ≈ alto
                  // útil de la columna (h-40 = 160px menos la etiqueta).
                  const h = Math.max(4, Math.round((t.facturado / maxTrend) * 144));
                  return (
                    <button
                      key={t.month}
                      type="button"
                      onClick={() => setSelMonth(t.month)}
                      className="group flex flex-1 flex-col items-center justify-end gap-1.5"
                      title={`${monthShort(t.month)} · ${fmtPeso(t.facturado)}`}
                    >
                      <div className={`w-full rounded-t transition ${isSel ? "brand-gradient" : "bg-white/15 group-hover:bg-white/30"}`} style={{ height: `${h}px` }} />
                      <span className={`text-[10px] transition ${isSel ? "font-semibold text-teal-300" : "text-zinc-500 group-hover:text-zinc-300"}`}>{monthShort(t.month)}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="flex h-40 items-center text-sm text-zinc-600">
                {imp && imp.status !== 200 ? "No se pudo cargar la tendencia." : "Sin datos de tendencia."}
              </div>
            )}
          </div>
          {/* Canales — viene de /api/resumen */}
          <div>
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-zinc-500">Por canal · {selLong}</p>
            {loadingVentas ? (
              <div className="flex h-40 items-center text-sm text-zinc-500">Cargando…</div>
            ) : vCur ? (
              <div className="space-y-2.5">
                {vCur.porCanal.map((c) => {
                  const pc = vPrev?.porCanal.find((x) => x.key === c.key);
                  return (
                    <div key={c.key} className="text-sm sm:flex sm:items-center sm:gap-2">
                      {/* En celular el importe va arriba de la barra; en desktop, a la derecha. */}
                      <div className="flex items-baseline justify-between gap-2 sm:block sm:w-24 sm:shrink-0">
                        <span className="text-zinc-300">{CH_META[c.key].label}</span>
                        <span className="flex items-baseline gap-2 sm:hidden">
                          <span className="tabular-nums text-zinc-200">{fmtPeso(c.facturado)}</span>
                          <span className={`text-xs tabular-nums ${c.pct < 0 ? "text-red-400" : "text-emerald-400"}`}>{(c.pct * 100).toFixed(0)}%</span>
                          <DeltaChip pct={pctChange(c.facturado, pc?.facturado)} small />
                        </span>
                      </div>
                      <div className="mt-1 h-2 overflow-hidden rounded bg-white/5 sm:mt-0 sm:flex-1">
                        <div className={`h-full ${CH_META[c.key].bar}`} style={{ width: `${(c.facturado / maxCanal) * 100}%` }} />
                      </div>
                      <span className="hidden w-20 shrink-0 text-right tabular-nums text-zinc-200 sm:block">{fmtPeso(c.facturado)}</span>
                      <span className={`hidden w-12 shrink-0 text-right text-xs tabular-nums sm:block ${c.pct < 0 ? "text-red-400" : "text-emerald-400"}`}>{(c.pct * 100).toFixed(0)}%</span>
                      <span className="hidden w-12 shrink-0 text-right sm:block"><DeltaChip pct={pctChange(c.facturado, pc?.facturado)} small /></span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex h-40 items-center text-sm text-zinc-600">
                {cur?.status === 403 ? "No tenés acceso a ventas." : "No se pudieron cargar los canales."}
              </div>
            )}
          </div>
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ---------- IMPORTACIONES ---------- */}
        <Panel title="Importaciones" subtitle="Contenedores y mercadería en tránsito" href="/"
          icon={<><path d="M3 7h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" /><path d="M3 7l2-3h14l2 3M9 7v12M15 7v12" /></>}
          accent="from-indigo-500/15" loading={loadingImp} status={imp?.status}>
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
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} className="h-4 w-4 shrink-0 text-indigo-300"><path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  <span className="hidden shrink-0 text-zinc-400 sm:inline">Próximo arribo:</span>
                  <span className="min-w-0 truncate font-semibold text-zinc-100">{imp.data.proximoArribo.name}</span>
                  <span className="ml-auto shrink-0 tabular-nums text-zinc-400">{fmtDate(imp.data.proximoArribo.eta)}</span>
                </div>
              )}
            </div>
          )}
        </Panel>

        {/* ---------- REPOSICIÓN ---------- */}
        <Panel title="Reposición" subtitle={`Sugerido · ${REPOS_MESES}m de cobertura`} href="/reposicion"
          icon={<><path d="M3 3v18h18M7 14l3-3 3 3 5-6" /></>} accent="from-teal-500/15"
          loading={loadingRepos} status={repos?.status}>
          {reposCalc && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
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
    <div className="card p-3 sm:p-4">
      <div className="truncate text-[11px] text-zinc-500 sm:text-xs" title={label}>{label}</div>
      <div className={`mt-0.5 text-xl font-bold tabular-nums sm:text-2xl ${color}`}>{loading ? "…" : value}</div>
      <div className="mt-1 flex flex-wrap items-center gap-x-2">
        {delta != null && <DeltaChip pct={delta} />}
        {sub && <span className="text-[11px] text-zinc-500">{sub}</span>}
        {delta != null && <span className="hidden text-[11px] text-zinc-600 sm:inline">vs mes ant.</span>}
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
    <div className="card relative overflow-hidden p-4 sm:p-5">
      <div className={`pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-gradient-to-br ${accent} to-transparent blur-2xl`} />
      <div className="relative mb-4 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="brand-gradient flex h-10 w-10 items-center justify-center rounded-xl text-white">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">{icon}</svg>
          </div>
          <div>
            <h2 className="text-base font-bold text-white sm:text-lg">{title}</h2>
            <p className="text-xs text-zinc-500">{subtitle}</p>
          </div>
        </div>
        <Link href={href} className="shrink-0 text-xs font-semibold text-indigo-400 transition hover:text-indigo-300 sm:text-sm">Ver detalle →</Link>
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
      <div className={`text-lg font-bold tabular-nums sm:text-xl ${color}`}>{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-zinc-500">{sub}</div>}
    </div>
  );
}
