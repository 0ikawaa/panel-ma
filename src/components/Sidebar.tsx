"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  {
    href: "/",
    label: "Inicio",
    icon: <path d="M3 10.5 12 3l9 7.5M5 9.5V21h5v-6h4v6h5V9.5" />,
  },
  {
    href: "/arribos",
    label: "En camino",
    icon: (
      <>
        <path d="M3 7h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
        <path d="M3 7l2-3h14l2 3M9 7v12M15 7v12" />
      </>
    ),
  },
  {
    href: "/arribos/recibidos",
    label: "Recibidos",
    icon: (
      <>
        <path d="M3 12h4l2 3h6l2-3h4" />
        <path d="M5 12V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v6M12 3v6m0 0-2.5-2.5M12 9l2.5-2.5" />
      </>
    ),
  },
  {
    href: "/buscar",
    label: "Buscar SKU",
    icon: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m21 21-4.3-4.3" />
      </>
    ),
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    if (href === "/arribos")
      return (
        pathname === "/arribos" ||
        (pathname.startsWith("/arribos/") &&
          !pathname.startsWith("/arribos/recibidos"))
      );
    return pathname.startsWith(href);
  };

  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-white/10 bg-white/[0.02] backdrop-blur-xl md:flex">
      <div className="px-6 py-6">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo-ma.png"
          alt="MA Importaciones"
          className="h-11 w-auto object-contain"
        />
        <p className="mt-2 text-xs text-zinc-500">Gestión de arribos</p>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-2">
        {NAV.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                active
                  ? "brand-gradient brand-glow text-white"
                  : "text-zinc-400 hover:bg-white/5 hover:text-white"
              }`}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5"
              >
                {item.icon}
              </svg>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <form action="/api/logout" method="post" className="p-3">
        <button
          type="submit"
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-zinc-500 transition hover:bg-red-500/10 hover:text-red-400"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5"
          >
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
          </svg>
          Cerrar sesión
        </button>
      </form>
    </aside>
  );
}
