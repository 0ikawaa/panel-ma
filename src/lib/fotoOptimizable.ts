// ¿Esta foto la puede optimizar next/image?
//
// El optimizador sólo acepta los hosts declarados en `next.config.ts`; si le
// llega cualquier otro, la imagen no carga. Como el origen de la foto lo decide
// el dato (la puso alguien a mano, vino de MercadoLibre o salió del Excel) y no
// el código, conviene preguntar antes y servir sin optimizar lo que no encaje,
// en vez de dejar un hueco en la tabla.
//
// **Esta lista tiene que seguir a la de `next.config.ts`.**

const HOSTS_OPTIMIZABLES = [".public.blob.vercel-storage.com", ".mlstatic.com"];

export function esOptimizable(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const { protocol, hostname } = new URL(url);
    if (protocol !== "https:") return false;
    return HOSTS_OPTIMIZABLES.some((h) => hostname.endsWith(h));
  } catch {
    return false; // rutas relativas, data URLs y basura varia
  }
}
