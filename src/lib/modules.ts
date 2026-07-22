// Módulos de la plataforma y su control de acceso.

export interface ModuleDef {
  key: string;
  label: string;
  path: string;
}

export const MODULES: ModuleDef[] = [
  { key: "inicio", label: "Inicio", path: "/" },
  { key: "embarques", label: "Embarques", path: "/arribos" },
  { key: "buscar", label: "Buscar SKU", path: "/buscar" },
  { key: "admin", label: "Administración", path: "/admin" },
];

export const ALL_MODULES = MODULES.map((m) => m.key);

/** Devuelve la clave de módulo que protege una ruta, o null si es libre. */
export function moduleForPath(pathname: string): string | null {
  if (pathname === "/") return "inicio";
  if (pathname.startsWith("/arribos")) return "embarques";
  if (pathname.startsWith("/buscar")) return "buscar";
  if (pathname.startsWith("/admin")) return "admin";
  if (pathname.startsWith("/api/admin")) return "admin";
  if (
    pathname.startsWith("/api/containers") ||
    pathname.startsWith("/api/blob")
  )
    return "embarques";
  return null;
}

/** Primera ruta accesible según los módulos del usuario. */
export function firstAllowedPath(modules: string[]): string {
  const m = MODULES.find((mod) => modules.includes(mod.key));
  return m?.path ?? "/login";
}
