import Link from "next/link";

export default function EmbarquesTabs({
  active,
  enCamino,
  recibidos,
}: {
  active: "camino" | "recibidos" | "buscar";
  enCamino: number;
  recibidos: number;
}) {
  const tab = (
    href: string,
    label: string,
    on: boolean,
    color: "brand" | "emerald" | "indigo",
    count?: number,
  ) => {
    const activeBg =
      color === "brand"
        ? "brand-gradient text-white"
        : color === "emerald"
          ? "bg-emerald-600 text-white"
          : "bg-indigo-600 text-white";
    return (
      <Link
        key={href}
        href={href}
        className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-sm font-semibold transition ${
          on ? activeBg : "text-zinc-400 hover:bg-white/5 hover:text-white"
        }`}
      >
        {label}
        {count !== undefined && (
          <span
            className={`rounded-full px-1.5 py-0.5 text-[11px] font-bold tabular-nums ${
              on ? "bg-white/25 text-white" : "bg-white/10 text-zinc-300"
            }`}
          >
            {count}
          </span>
        )}
      </Link>
    );
  };

  return (
    <div className="flex flex-wrap gap-2">
      {tab("/arribos", "En camino", active === "camino", "brand", enCamino)}
      {tab("/arribos/recibidos", "Recibidos", active === "recibidos", "emerald", recibidos)}
      {tab("/buscar", "Buscar SKU", active === "buscar", "indigo")}
    </div>
  );
}
