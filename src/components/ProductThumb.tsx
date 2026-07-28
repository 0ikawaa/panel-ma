"use client";

// Miniatura de producto reutilizable: muestra la foto (manual, de ML o del
// Excel) o un placeholder cuando no hay. Tamaño configurable por prop.
//
// Va con next/image y no con <img> porque las fotos del Excel se guardan tal
// cual las manda el proveedor —400 KB de promedio, alguna de 3 MB— y acá se ven
// a 40 píxeles. Next las sirve redimensionadas y en WebP, así que una tabla de
// 50 ítems pasa de bajar decenas de megas a unos pocos cientos de kilobytes.
// Los hosts permitidos están en `next.config.ts`.

import Image from "next/image";
import { esOptimizable } from "@/lib/fotoOptimizable";

export default function ProductThumb({
  src,
  alt = "",
  size = 40,
  className = "",
}: {
  src?: string | null;
  alt?: string;
  size?: number;
  className?: string;
}) {
  const dim = { width: size, height: size };
  if (src) {
    return (
      <Image
        src={src}
        alt={alt}
        width={size}
        height={size}
        loading="lazy"
        // Una foto que no está en los hosts permitidos rompería el optimizador;
        // como el origen lo decide el dato y no el código, se sirve sin
        // optimizar en vez de mostrar un hueco.
        unoptimized={!esOptimizable(src)}
        style={dim}
        className={`shrink-0 rounded-md border border-white/10 bg-white/5 object-cover ${className}`}
      />
    );
  }
  return (
    <div
      style={dim}
      className={`flex shrink-0 items-center justify-center rounded-md border border-dashed border-white/10 bg-white/5 text-zinc-600 ${className}`}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-1/2 w-1/2">
        <path d="M3 5h18v14H3zM3 15l5-5 4 4 3-3 6 6" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="8.5" cy="9" r="1.5" />
      </svg>
    </div>
  );
}
