const LOCALE = "es-UY";

export function fmtCBM(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return (
    n.toLocaleString(LOCALE, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 4,
    }) + " m³"
  );
}

/** Volumen total (siempre con 2 decimales). */
export function fmtCBM2(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return (
    n.toLocaleString(LOCALE, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + " m³"
  );
}

export function fmtUSD(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return (
    "US$ " +
    n.toLocaleString(LOCALE, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

export function fmtInt(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString(LOCALE);
}

/** Pesos con separador de miles y signo $ (ej. "$35.148", "-$843"). Redondea. */
export function fmtPeso(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const r = Math.round(n);
  return (r < 0 ? "-$" : "$") + Math.abs(r).toLocaleString(LOCALE);
}

/** Pesos con signo explícito (+/–), útil para envío y ajustes (ej. "+$38"). */
export function fmtPesoSigned(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const r = Math.round(n);
  if (r === 0) return "$0";
  return (r < 0 ? "-$" : "+$") + Math.abs(r).toLocaleString(LOCALE);
}

export function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString(LOCALE, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** Fecha + hora, ej. "22 jul 2026, 14:35". */
export function fmtDateTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString(LOCALE, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
