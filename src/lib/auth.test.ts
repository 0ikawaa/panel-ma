import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SignJWT } from "jose";
import {
  AUTH_COOKIE,
  SESSION_MAX_AGE,
  createSessionToken,
  verifySessionToken,
  type SessionData,
} from "./auth";

const SECRETO = "secreto-de-prueba-suficientemente-largo-para-hs256";
const OTRO_SECRETO = "otro-secreto-igual-de-largo-pero-distinto-del-real";

const SESION: SessionData = {
  user: "matias",
  name: "Matías",
  modules: ["embarques", "reportes"],
  isAdmin: false,
  photoUrl: "https://blob/yo.png",
};

beforeEach(() => {
  process.env.AUTH_SECRET = SECRETO;
});

afterEach(() => {
  delete process.env.AUTH_SECRET;
});

describe("createSessionToken / verifySessionToken", () => {
  it("un token propio vuelve con los mismos datos", async () => {
    const token = await createSessionToken(SESION);
    expect(await verifySessionToken(token)).toEqual(SESION);
  });

  it("los campos opcionales vacíos vuelven como undefined, no como null", async () => {
    const token = await createSessionToken({
      user: "sinfoto",
      modules: [],
      isAdmin: true,
    });
    const s = await verifySessionToken(token);
    expect(s).toEqual({ user: "sinfoto", name: undefined, modules: [], isAdmin: true, photoUrl: undefined });
  });

  it("sin token no hay sesión", async () => {
    expect(await verifySessionToken(undefined)).toBeNull();
    expect(await verifySessionToken("")).toBeNull();
  });

  it("un token manoseado se rechaza", async () => {
    const token = await createSessionToken(SESION);
    // Cambiarle un carácter al payload rompe la firma.
    const partes = token.split(".");
    partes[1] = partes[1].slice(0, -2) + (partes[1].endsWith("A") ? "BB" : "AA");
    expect(await verifySessionToken(partes.join("."))).toBeNull();
  });

  it("un token firmado con otro secreto se rechaza", async () => {
    // Esto es lo que pasaría si alguien se fabrica una sesión de admin.
    const falso = await new SignJWT({ user: "intruso", modules: [], isAdmin: true })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(OTRO_SECRETO));
    expect(await verifySessionToken(falso)).toBeNull();
  });

  it("un token vencido se rechaza", async () => {
    const vencido = await new SignJWT({ user: "matias", modules: [], isAdmin: false })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
      .sign(new TextEncoder().encode(SECRETO));
    expect(await verifySessionToken(vencido)).toBeNull();
  });

  it("un token sin firma (alg: none) se rechaza", async () => {
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({ user: "intruso", isAdmin: true })).toString("base64url");
    expect(await verifySessionToken(`${header}.${payload}.`)).toBeNull();
  });

  it("cualquier texto que no sea un JWT se rechaza sin explotar", async () => {
    expect(await verifySessionToken("no-soy-un-jwt")).toBeNull();
    expect(await verifySessionToken("a.b.c")).toBeNull();
  });

  it("sin AUTH_SECRET configurado falla ruidosamente al firmar", async () => {
    delete process.env.AUTH_SECRET;
    await expect(createSessionToken(SESION)).rejects.toThrow("AUTH_SECRET");
  });

  it("un token de un usuario no gana módulos por el camino", async () => {
    const token = await createSessionToken({ ...SESION, modules: ["embarques"] });
    const s = await verifySessionToken(token);
    expect(s?.modules).toEqual(["embarques"]);
    expect(s?.isAdmin).toBe(false);
  });
});

describe("constantes de sesión", () => {
  it("la cookie y la duración son las esperadas", () => {
    expect(AUTH_COOKIE).toBe("ma_session");
    expect(SESSION_MAX_AGE).toBe(60 * 60 * 24 * 7);
  });
});
