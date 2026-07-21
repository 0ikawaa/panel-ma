"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "Inicio" },
  { href: "/arribos", label: "Arribos" },
];

export default function MobileNav() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur md:hidden">
      <div className="flex items-center gap-2">
        <div className="brand-gradient flex h-8 w-8 items-center justify-center rounded-lg text-xs font-black text-white">
          MA
        </div>
        <nav className="flex gap-1">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                isActive(item.href)
                  ? "brand-gradient text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
      <form action="/api/logout" method="post">
        <button
          type="submit"
          className="rounded-lg p-2 text-slate-500 hover:bg-red-50 hover:text-red-600"
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
