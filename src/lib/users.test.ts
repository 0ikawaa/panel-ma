import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// La base se reemplaza por un doble: acá se testea la decisión de dejar entrar
// o no, no Postgres.
const prismaMock = {
  user: { findUnique: vi.fn(), update: vi.fn() },
  profile: { findUnique: vi.fn() },
};
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const { authenticate, hashPassword } = await import("./users");
const { ALL_MODULES } = await import("./modules");

const ADMIN = "matias";
const ADMIN_PASS = "una-clave-larga";

beforeEach(() => {
  process.env.ADMIN_USER = ADMIN;
  process.env.ADMIN_PASSWORD = ADMIN_PASS;
  prismaMock.user.findUnique.mockReset().mockResolvedValue(null);
  prismaMock.user.update.mockReset().mockResolvedValue({});
  prismaMock.profile.findUnique.mockReset().mockResolvedValue(null);
});

afterEach(() => {
  delete process.env.ADMIN_USER;
  delete process.env.ADMIN_PASSWORD;
});

describe("authenticate — superadmin", () => {
  it("entra con las credenciales del entorno y ve todos los módulos", async () => {
    const s = await authenticate(ADMIN, ADMIN_PASS);
    expect(s?.isAdmin).toBe(true);
    expect(s?.modules).toEqual([...ALL_MODULES]);
    // Ni siquiera consulta la tabla de usuarios.
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });

  it("con la contraseña equivocada no entra", async () => {
    expect(await authenticate(ADMIN, "otra")).toBeNull();
  });

  it("sin ADMIN_PASSWORD configurada NO hay superadmin", async () => {
    // Antes esto caía a "admin"/"admin" y dejaba el panel abierto.
    delete process.env.ADMIN_PASSWORD;
    expect(await authenticate("admin", "admin")).toBeNull();
    expect(await authenticate(ADMIN, ADMIN_PASS)).toBeNull();
  });

  it("sin ADMIN_USER configurado tampoco", async () => {
    delete process.env.ADMIN_USER;
    expect(await authenticate("admin", "admin")).toBeNull();
  });

  it("con las variables vacías tampoco entra nadie", async () => {
    process.env.ADMIN_USER = "";
    process.env.ADMIN_PASSWORD = "";
    expect(await authenticate("", "")).toBeNull();
  });
});

describe("authenticate — usuarios de la base", () => {
  it("entra con la contraseña correcta y sólo con sus módulos", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "u1",
      username: "vendedor",
      passwordHash: await hashPassword("secreta"),
      name: "Vende Dor",
      modules: ["ordenes"],
    });

    const s = await authenticate("vendedor", "secreta");
    expect(s).toMatchObject({ user: "vendedor", name: "Vende Dor", modules: ["ordenes"], isAdmin: false });
  });

  it("un usuario de la base nunca es admin, aunque tenga el módulo admin", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "u2",
      username: "jefe",
      passwordHash: await hashPassword("secreta"),
      name: null,
      modules: ["admin"],
    });

    const s = await authenticate("jefe", "secreta");
    expect(s?.isAdmin).toBe(false);
  });

  it("con la contraseña equivocada no entra", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "u3",
      username: "vendedor",
      passwordHash: await hashPassword("secreta"),
      name: null,
      modules: ["ordenes"],
    });
    expect(await authenticate("vendedor", "adivinada")).toBeNull();
  });

  it("un usuario que no existe no entra", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    expect(await authenticate("fantasma", "loquesea")).toBeNull();
  });

  it("anota el último acceso cuando el login sale bien", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "u4",
      username: "vendedor",
      passwordHash: await hashPassword("secreta"),
      name: null,
      modules: [],
    });

    await authenticate("vendedor", "secreta");
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "u4" } }),
    );
  });

  it("si no se puede anotar el acceso el login igual funciona", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "u5",
      username: "vendedor",
      passwordHash: await hashPassword("secreta"),
      name: null,
      modules: [],
    });
    prismaMock.user.update.mockRejectedValue(new Error("base caída"));

    expect(await authenticate("vendedor", "secreta")).toMatchObject({ user: "vendedor" });
  });

  it("suma la foto de perfil cuando existe", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "u6",
      username: "vendedor",
      passwordHash: await hashPassword("secreta"),
      name: null,
      modules: [],
    });
    prismaMock.profile.findUnique.mockResolvedValue({ photoUrl: "https://blob/foto.png" });

    const s = await authenticate("vendedor", "secreta");
    expect(s?.photoUrl).toBe("https://blob/foto.png");
  });
});

describe("hashPassword", () => {
  it("no guarda la contraseña en claro y cada hash es distinto", async () => {
    const a = await hashPassword("secreta");
    const b = await hashPassword("secreta");
    expect(a).not.toBe("secreta");
    expect(a).not.toBe(b); // bcrypt saltea cada hash
  });
});
