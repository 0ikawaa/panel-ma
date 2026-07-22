"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", module: "inicio", label: "Inicio" },
  { href: "/arribos", module: "embarques", label: "Embarques" },
  { href: "/buscar", module: "buscar", label: "Buscar SKU" },
  { href: "/admin", module: "admin", label: "Admin" },
];

export default function MobileNav({
  modules,
  isAdmin,
}: {
  modules: string[];
  isAdmin: boolean;
}) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  const items = NAV.filter((n) => isAdmin || modules.includes(n.module));

  return (
    <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-white/10 bg-black/40 px-4 py-3 backdrop-blur-xl md:hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo-ma.png"
        alt="MA Importaciones"
        className="h-6 w-auto shrink-0 object-contain"
      />
      <nav className="flex flex-1 gap-1 overflow-x-auto">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
              isActive(item.href)
                ? "brand-gradient text-white"
                : "text-zinc-400 hover:bg-white/5 hover:text-white"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <form action="/api/logout" method="post">
        <button
          type="submit"
          className="rounded-lg p-2 text-zinc-500 transition hover:bg-red-500/10 hover:text-red-400"
          aria-label="Cerrar sesión"
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
        </button>
      </form>
    </header>
  );
}
