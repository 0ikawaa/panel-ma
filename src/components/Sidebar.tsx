"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { upload as uploadToBlob } from "@vercel/blob/client";

const importIcon = (
  <>
    <path d="M3 7h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
    <path d="M3 7l2-3h14l2 3M9 7v12M15 7v12" />
  </>
);

export default function Sidebar({
  modules,
  isAdmin,
  name,
  photoUrl,
}: {
  modules: string[];
  isAdmin: boolean;
  name?: string;
  photoUrl?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();

  // Foto de perfil: estado optimista + subida a Blob.
  const [photo, setPhoto] = useState<string | undefined>(photoUrl);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onPickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite re-elegir el mismo archivo
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setPhotoError("Elegí una imagen.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setPhotoError("La imagen supera 5 MB.");
      return;
    }
    setPhotoBusy(true);
    setPhotoError(null);
    try {
      const blob = await uploadToBlob(`avatar-${Date.now()}-${file.name}`, file, {
        access: "public",
        handleUploadUrl: "/api/blob/upload",
        contentType: file.type,
      });
      const res = await fetch("/api/profile/photo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: blob.url }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || `Error ${res.status}`);
      }
      setPhoto(blob.url);
      router.refresh(); // refresca la sesión (nueva cookie con la foto)
    } catch (err) {
      setPhotoError((err as Error).message || "No se pudo subir la foto.");
    } finally {
      setPhotoBusy(false);
    }
  }

  async function removePhoto() {
    setPhotoBusy(true);
    setPhotoError(null);
    try {
      const res = await fetch("/api/profile/photo", { method: "DELETE" });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      setPhoto(undefined);
      router.refresh();
    } catch (err) {
      setPhotoError((err as Error).message || "No se pudo quitar la foto.");
    } finally {
      setPhotoBusy(false);
    }
  }
  const can = (m: string) => isAdmin || modules.includes(m);

  const isDashboard = pathname.startsWith("/dashboard");
  const isInicio = pathname === "/"; // Resumen de Importaciones
  const isCalculadora = pathname.startsWith("/arribos/calculadora");
  const isEmbarques =
    (pathname.startsWith("/arribos") && !isCalculadora) || pathname.startsWith("/buscar");
  const impActive = isInicio || isEmbarques || isCalculadora;

  const [open, setOpen] = useState(false);
  const showChildren = open || impActive;

  const isReposicion = pathname.startsWith("/reposicion");
  const isOrdenes = pathname.startsWith("/ordenes");
  const isResumen = pathname.startsWith("/resumen");
  const ventasActive = isReposicion || isOrdenes || isResumen;
  const [ventasOpen, setVentasOpen] = useState(false);
  const showVentas = ventasOpen || ventasActive;

  const linkClass = (active: boolean) =>
    `group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
      active ? "brand-gradient brand-glow text-white" : "text-zinc-400 hover:bg-white/5 hover:text-white"
    }`;

  const subLinkClass = (active: boolean) =>
    `flex items-center gap-2.5 rounded-lg py-2 pl-4 pr-3 text-sm font-medium transition ${
      active
        ? "bg-indigo-500/15 text-indigo-100"
        : "text-zinc-400 hover:bg-white/5 hover:text-white"
    }`;

  const icon = (children: React.ReactNode) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      {children}
    </svg>
  );

  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-white/10 bg-white/[0.02] backdrop-blur-xl md:flex">
      <div className="relative overflow-hidden px-5 pb-4 pt-6">
        {/* Glow sutil de marca detrás del logo */}
        <div className="pointer-events-none absolute -left-6 -top-8 h-32 w-44 rounded-full bg-teal-500/10 blur-3xl" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-ma.png" alt="MA Importaciones" className="relative h-10 w-auto object-contain" />
        <div className="relative mt-3 flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-teal-400 shadow-[0_0_10px_2px_rgba(45,212,191,0.45)]" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-400">Panel MA</span>
        </div>
      </div>
      {/* Divisor con degradé de marca */}
      <div className="mx-5 h-px bg-gradient-to-r from-teal-500/40 via-white/10 to-transparent" />

      <nav className="flex-1 space-y-1 px-3 py-2">
        {can("dashboard") && (
          <Link href="/dashboard" className={linkClass(isDashboard)}>
            {icon(
              <>
                <path d="M3 13h8V3H3v10Zm10 8h8V11h-8v10ZM3 21h8v-6H3v6ZM13 3v6h8V3h-8Z" />
              </>,
            )}
            Dashboard
          </Link>
        )}

        {(can("inicio") || can("embarques")) && (
          <div>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className={`${linkClass(impActive && !showChildren)} w-full`}
            >
              {icon(importIcon)}
              <span className="flex-1 text-left">Importaciones</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={`h-4 w-4 transition-transform ${showChildren ? "rotate-90" : ""}`}>
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>
            {showChildren && (
              <div className="mt-1 space-y-1 border-l border-white/10 pl-3">
                {can("inicio") && (
                  <Link href="/" className={subLinkClass(isInicio)}>
                    <span className={`h-1.5 w-1.5 rounded-full ${isInicio ? "bg-indigo-400" : "bg-zinc-600"}`} />
                    Resumen
                  </Link>
                )}
                {can("embarques") && (
                  <>
                    <Link href="/arribos" className={subLinkClass(isEmbarques)}>
                      <span className={`h-1.5 w-1.5 rounded-full ${isEmbarques ? "bg-indigo-400" : "bg-zinc-600"}`} />
                      Embarques
                    </Link>
                    <Link href="/arribos/calculadora" className={subLinkClass(isCalculadora)}>
                      <span className={`h-1.5 w-1.5 rounded-full ${isCalculadora ? "bg-indigo-400" : "bg-zinc-600"}`} />
                      Calculadora
                    </Link>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {(can("reposicion") || can("ordenes") || can("resumen")) && (
          <div>
            <button
              type="button"
              onClick={() => setVentasOpen((v) => !v)}
              className={`${linkClass(ventasActive && !showVentas)} w-full`}
            >
              {icon(
                <>
                  <path d="M3 3v18h18" />
                  <path d="M7 14l3-3 3 3 5-6" />
                </>,
              )}
              <span className="flex-1 text-left">Ventas</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={`h-4 w-4 transition-transform ${showVentas ? "rotate-90" : ""}`}>
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>
            {showVentas && (
              <div className="mt-1 space-y-1 border-l border-white/10 pl-3">
                {can("resumen") && (
                  <Link href="/resumen" className={subLinkClass(isResumen)}>
                    <span className={`h-1.5 w-1.5 rounded-full ${isResumen ? "bg-indigo-400" : "bg-zinc-600"}`} />
                    Resumen
                  </Link>
                )}
                {can("ordenes") && (
                  <Link href="/ordenes" className={subLinkClass(isOrdenes)}>
                    <span className={`h-1.5 w-1.5 rounded-full ${isOrdenes ? "bg-indigo-400" : "bg-zinc-600"}`} />
                    Órdenes ML
                  </Link>
                )}
                {can("reposicion") && (
                  <Link href="/reposicion" className={subLinkClass(isReposicion)}>
                    <span className={`h-1.5 w-1.5 rounded-full ${isReposicion ? "bg-indigo-400" : "bg-zinc-600"}`} />
                    Reposición
                  </Link>
                )}
              </div>
            )}
          </div>
        )}

        {can("admin") && (
          <Link href="/admin" className={linkClass(pathname.startsWith("/admin"))}>
            {icon(
              <>
                <circle cx="9" cy="8" r="3" />
                <path d="M15 11a3 3 0 1 0 0-6M3 20v-1a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v1M17 15a4 4 0 0 1 4 4v1" />
              </>,
            )}
            Administración
          </Link>
        )}
      </nav>

      <div className="border-t border-white/10 p-3">
        {name && (
          <div className="mb-1 flex items-center gap-2.5 px-3 py-2">
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickPhoto} />
            <button
              type="button"
              onClick={() => !photoBusy && fileRef.current?.click()}
              className="group/av relative h-9 w-9 shrink-0 overflow-hidden rounded-full"
              title="Cambiar foto de perfil"
              disabled={photoBusy}
            >
              {photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photo} alt={name} className="h-full w-full object-cover" />
              ) : (
                <span className="brand-gradient flex h-full w-full items-center justify-center text-xs font-bold text-white">
                  {name.slice(0, 1).toUpperCase()}
                </span>
              )}
              <span className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition group-hover/av:opacity-100">
                {photoBusy ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4 animate-spin text-white"><path d="M21 12a9 9 0 1 1-2.64-6.36" strokeLinecap="round" /></svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-4 w-4 text-white"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2Z" strokeLinecap="round" strokeLinejoin="round" /><circle cx="12" cy="13" r="4" /></svg>
                )}
              </span>
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">{name}</p>
              {photoError ? (
                <p className="truncate text-xs text-red-400" title={photoError}>{photoError}</p>
              ) : (
                <button
                  type="button"
                  onClick={() => (photo ? removePhoto() : fileRef.current?.click())}
                  disabled={photoBusy}
                  className="text-xs text-zinc-500 transition hover:text-zinc-300 disabled:opacity-60"
                >
                  {photoBusy ? "Subiendo…" : photo ? "Quitar foto" : "Agregar foto"}
                </button>
              )}
            </div>
          </div>
        )}
        <form action="/api/logout" method="post">
          <button
            type="submit"
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-zinc-500 transition hover:bg-red-500/10 hover:text-red-400"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
            </svg>
            Cerrar sesión
          </button>
        </form>
      </div>
    </aside>
  );
}
