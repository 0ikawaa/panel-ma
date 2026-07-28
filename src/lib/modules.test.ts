import { describe, it, expect } from "vitest";
import { ALL_MODULES, MODULES, firstAllowedPath, moduleForPath } from "./modules";

describe("moduleForPath", () => {
  it("cada módulo protege su propia ruta", () => {
    // Si alguien agrega un módulo y se olvida de mapearlo, esto lo caza.
    for (const m of MODULES) {
      expect(moduleForPath(m.path), `ruta ${m.path}`).toBe(m.key);
    }
  });

  it("protege las subrutas, no sólo la raíz de cada sección", () => {
    expect(moduleForPath("/arribos/tablero")).toBe("embarques");
    expect(moduleForPath("/arribos/abc123")).toBe("embarques");
    expect(moduleForPath("/reportes/calidad")).toBe("reportes");
    expect(moduleForPath("/admin/usuarios")).toBe("admin");
  });

  it("las pantallas que comparten público van con el módulo que corresponde", () => {
    // Buscar SKU es parte de Importaciones.
    expect(moduleForPath("/buscar")).toBe("embarques");
    // Rentabilidad muestra costos y márgenes: mismo público que Resumen.
    expect(moduleForPath("/rentabilidad")).toBe("resumen");
  });

  it("las APIs quedan protegidas por el mismo módulo que su pantalla", () => {
    const casos: Record<string, string> = {
      "/api/admin/users": "admin",
      "/api/admin/backup": "admin",
      "/api/reposicion": "reposicion",
      "/api/reportes/calidad": "reportes",
      "/api/reportes/ventas-aceleradas/run": "reportes",
      "/api/agendas": "agendas",
      "/api/containers": "embarques",
      "/api/containers/abc/upload": "embarques",
      "/api/ventas-ml": "ordenes",
      "/api/costos": "ordenes",
      "/api/resumen": "resumen",
      "/api/rentabilidad": "resumen",
      "/api/dashboard": "dashboard",
    };
    for (const [ruta, mod] of Object.entries(casos)) {
      expect(moduleForPath(ruta), `ruta ${ruta}`).toBe(mod);
    }
  });

  it("el cron NO se protege por módulo (lo protege CRON_SECRET)", () => {
    // Si esto empezara a devolver "reportes", el cron de Vercel dejaría de
    // funcionar: entra sin sesión y el middleware lo rebotaría.
    expect(moduleForPath("/api/cron/reportes")).toBeNull();
  });

  it("las rutas públicas y las que no protegen nada devuelven null", () => {
    expect(moduleForPath("/login")).toBeNull();
    expect(moduleForPath("/api/login")).toBeNull();
    expect(moduleForPath("/api/logout")).toBeNull();
    expect(moduleForPath("/api/sheets/embarques")).toBeNull();
    expect(moduleForPath("/api/blob/upload")).toBeNull();
    expect(moduleForPath("/api/profile/photo")).toBeNull();
  });

  it("una ruta desconocida no se mapea sola a un módulo", () => {
    expect(moduleForPath("/inventada")).toBeNull();
    expect(moduleForPath("/api/inventada")).toBeNull();
  });

  it("no confunde rutas que empiezan parecido", () => {
    // "/resumen" protege Resumen Ventas; nada que arranque distinto debería caer ahí.
    expect(moduleForPath("/reposicion")).toBe("reposicion");
    expect(moduleForPath("/reportes")).toBe("reportes");
  });
});

describe("firstAllowedPath", () => {
  it("respeta el orden de MODULES, no el orden del usuario", () => {
    // El menú y el destino post-login tienen que ser estables entre usuarios.
    expect(firstAllowedPath(["admin", "dashboard"])).toBe("/dashboard");
    expect(firstAllowedPath(["dashboard", "admin"])).toBe("/dashboard");
    expect(firstAllowedPath(["admin", "embarques"])).toBe("/arribos");
  });

  it("un usuario sin módulos vuelve al login", () => {
    expect(firstAllowedPath([])).toBe("/login");
  });

  it("módulos que ya no existen no habilitan nada", () => {
    // Si se saca un módulo del código, los usuarios que lo tenían guardado no
    // pueden quedar apuntando a una ruta muerta.
    expect(firstAllowedPath(["modulo-viejo"])).toBe("/login");
    expect(firstAllowedPath(["modulo-viejo", "reportes"])).toBe("/reportes");
  });

  it("con todos los módulos cae en el primero de la lista", () => {
    expect(firstAllowedPath([...ALL_MODULES])).toBe(MODULES[0].path);
  });
});

describe("ALL_MODULES", () => {
  it("no tiene claves repetidas ni rutas repetidas", () => {
    expect(new Set(ALL_MODULES).size).toBe(ALL_MODULES.length);
    const rutas = MODULES.map((m) => m.path);
    expect(new Set(rutas).size).toBe(rutas.length);
  });
});
