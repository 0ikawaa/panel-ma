import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // De dónde pueden venir las fotos que optimiza next/image.
    //
    // Las del Excel de los proveedores se suben tal cual a Vercel Blob y pesan
    // 400 KB de promedio (alguna llega a 3 MB), pero en pantalla se ven a 40
    // píxeles: sin optimizar, abrir un embarque de 50 ítems se baja ~20 MB.
    //
    // Las de MercadoLibre ya vienen en tamaño miniatura, así que ahí la
    // optimización no cambia gran cosa; están acá porque el mismo componente
    // muestra unas y otras.
    remotePatterns: [
      { protocol: "https", hostname: "**.public.blob.vercel-storage.com" },
      { protocol: "https", hostname: "**.mlstatic.com" },
    ],
  },
};

export default nextConfig;
