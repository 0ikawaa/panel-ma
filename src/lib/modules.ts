// Módulos de la plataforma y su control de acceso.

export interface ModuleDef {
  key: string;
  label: string;
  path: string;
}

export const MODULES: ModuleDef[] = [
  { key: "inicio", label: "Inicio", path: "/" },
  { key: "embarques", label: "Importaciones", path: "/arribos" },
  { key: "reposicion", label: "Reposición", path: "/reposicion" },
  { key: "ordenes", label: "Órdenes ML", path: "/ordenes" },
  { key: "resumen", label: "Resumen Ventas", path: "/resumen" },
  { key: "admin", label: "Administración", path: "/admin" },
];

export const ALL_MODULES = MODULES.map((m) => m.key);

/** Devuelve la clave de módulo que protege una ruta, o null si es libre. */
export function moduleForPath(pathname: string): string | null {
  if (pathname === "/") return "inicio";
  // Buscar SKU es parte de Importaciones (Embarques).
  if (pathname.startsWith("/arribos") || pathname.startsWith("/buscar")) return "embarques";
  if (pathname.startsWith("/reposicion")) return "reposicion";
  if (pathname.startsWith("/ordenes")) return "ordenes";
  if (pathname.startsWith("/resumen")) return "resumen";
  if (pathname.startsWith("/admin")) return "admin";
  if (pathname.startsWith("/api/admin")) return "admin";
  if (pathname.startsWith("/api/reposicion")) return "reposicion";
  if (pathname.startsWith("/api/containers")) return "embarques";
  if (pathname.startsWith("/api/ventas-ml") || pathname.startsWith("/api/costos")) return "ordenes";
  if (pathname.startsWith("/api/resumen")) return "resumen";
  // /api/blob solo emite el token de subida (cualquier sesión); el
  // procesamiento real está protegido por cada endpoint.
  return null;
}

/** Primera ruta accesible según los módulos del usuario. */
export function firstAllowedPath(modules: string[]): string {
  const m = MODULES.find((mod) => modules.includes(mod.key));
  return m?.path ?? "/login";
}
