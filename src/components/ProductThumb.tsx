"use client";

// Miniatura de producto reutilizable: muestra la foto (ML o Excel) o un
// placeholder cuando no hay. Tamaño configurable por prop.

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
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
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
