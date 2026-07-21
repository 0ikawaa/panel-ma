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

export function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString(LOCALE, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
