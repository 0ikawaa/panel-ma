import Link from "next/link";

export default function EmbarquesTabs({
  active,
  enCamino,
  recibidos,
}: {
  active: "camino" | "recibidos";
  enCamino: number;
  recibidos: number;
}) {
  const Tab = ({
    href,
    label,
    count,
    on,
    color,
  }: {
    href: string;
    label: string;
    count: number;
    on: boolean;
    color: "brand" | "emerald";
  }) => {
    const activeBg =
      color === "brand" ? "brand-gradient text-white" : "bg-emerald-600 text-white";
    return (
      <Link
        href={href}
        className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-sm font-semibold transition ${
          on ? activeBg : "text-zinc-400 hover:bg-white/5 hover:text-white"
        }`}
      >
        {label}
        <span
          className={`rounded-full px-1.5 py-0.5 text-[11px] font-bold tabular-nums ${
            on ? "bg-white/25 text-white" : "bg-white/10 text-zinc-300"
          }`}
        >
          {count}
        </span>
      </Link>
    );
  };

  return (
    <div className="flex gap-2">
      <Tab
        href="/arribos"
        label="En camino"
        count={enCamino}
        on={active === "camino"}
        color="brand"
      />
      <Tab
        href="/arribos/recibidos"
        label="Recibidos"
        count={recibidos}
        on={active === "recibidos"}
        color="emerald"
      />
    </div>
  );
}
