import { describe, it, expect } from "vitest";
import {
  INTENTOS_LIBRES,
  INTENTOS_LIBRES_IP,
  VENTANA_OLVIDO_MS,
  bloqueoMs,
  clavesDeIntento,
  estaBloqueado,
  ipDeRequest,
  registrarFallo,
  segundosRestantes,
  type IntentoFallido,
} from "./loginThrottle";

const T0 = new Date("2026-07-28T12:00:00.000Z");
const mas = (ms: number) => new Date(T0.getTime() + ms);
const MIN = 60 * 1000;

describe("bloqueoMs", () => {
  it("no bloquea mientras haya intentos libres", () => {
    for (let f = 0; f <= INTENTOS_LIBRES; f++) expect(bloqueoMs(f)).toBe(0);
  });

  it("escala 1 → 2 → 5 → 15 → 30 minutos", () => {
    const esperado = [1, 2, 5, 15, 30];
    esperado.forEach((min, i) => {
      expect(bloqueoMs(INTENTOS_LIBRES + i + 1)).toBe(min * MIN);
    });
  });

  it("se queda en 30 minutos por más que sigan intentando", () => {
    expect(bloqueoMs(INTENTOS_LIBRES + 50)).toBe(30 * MIN);
    expect(bloqueoMs(9999)).toBe(30 * MIN);
  });

  it("con el umbral flojo de la IP tolera más intentos antes de frenar", () => {
    expect(bloqueoMs(INTENTOS_LIBRES + 1, INTENTOS_LIBRES_IP)).toBe(0);
    expect(bloqueoMs(INTENTOS_LIBRES_IP + 1, INTENTOS_LIBRES_IP)).toBe(1 * MIN);
  });
});

describe("registrarFallo", () => {
  it("el primer fallo arranca el contador sin bloquear", () => {
    const e = registrarFallo(null, T0);
    expect(e.fails).toBe(1);
    expect(e.lockedUntil).toBeNull();
    expect(estaBloqueado(e, T0)).toBe(false);
  });

  it("bloquea recién cuando se pasa de los intentos libres", () => {
    let e: IntentoFallido | null = null;
    for (let i = 0; i < INTENTOS_LIBRES; i++) e = registrarFallo(e, T0);
    expect(e!.lockedUntil).toBeNull();

    e = registrarFallo(e, T0);
    expect(e.fails).toBe(INTENTOS_LIBRES + 1);
    expect(estaBloqueado(e, T0)).toBe(true);
    expect(segundosRestantes(e, T0)).toBe(60);
  });

  it("el bloqueo se vence solo con el tiempo", () => {
    let e: IntentoFallido | null = null;
    for (let i = 0; i <= INTENTOS_LIBRES; i++) e = registrarFallo(e, T0);
    expect(estaBloqueado(e, mas(59 * 1000))).toBe(true);
    expect(estaBloqueado(e, mas(61 * 1000))).toBe(false);
    expect(segundosRestantes(e, mas(61 * 1000))).toBe(0);
  });

  it("olvida los fallos viejos en vez de acumularlos para siempre", () => {
    // Alguien que se equivoca una vez cada tanto no tiene que terminar bloqueado.
    let e: IntentoFallido | null = null;
    for (let i = 0; i < INTENTOS_LIBRES; i++) e = registrarFallo(e, T0);
    expect(e!.fails).toBe(INTENTOS_LIBRES);

    const tarde = mas(VENTANA_OLVIDO_MS + 1000);
    e = registrarFallo(e, tarde);
    expect(e.fails).toBe(1);
    expect(e.lockedUntil).toBeNull();
  });

  it("un fallo dentro de la ventana sí suma", () => {
    const uno = registrarFallo(null, T0);
    const dos = registrarFallo(uno, mas(VENTANA_OLVIDO_MS - 1000));
    expect(dos.fails).toBe(2);
  });
});

describe("estaBloqueado / segundosRestantes", () => {
  it("sin estado previo no hay bloqueo", () => {
    expect(estaBloqueado(null, T0)).toBe(false);
    expect(segundosRestantes(null, T0)).toBe(0);
  });

  it("redondea para arriba, nunca informa 0 segundos estando bloqueado", () => {
    const e: IntentoFallido = { fails: 9, lastFailAt: T0, lockedUntil: mas(10) };
    expect(estaBloqueado(e, T0)).toBe(true);
    expect(segundosRestantes(e, T0)).toBe(1);
  });
});

describe("clavesDeIntento", () => {
  it("la clave de usuario incluye la IP, así nadie deja afuera a otro a propósito", () => {
    const a = clavesDeIntento("matias", "1.1.1.1");
    const b = clavesDeIntento("matias", "2.2.2.2");
    expect(a.usuario).not.toBe(b.usuario);
  });

  it("la clave de IP es la misma para cualquier usuario", () => {
    expect(clavesDeIntento("matias", "1.1.1.1").ip).toBe(
      clavesDeIntento("otro", "1.1.1.1").ip,
    );
  });

  it("normaliza mayúsculas y espacios del usuario", () => {
    expect(clavesDeIntento("  Matias ", "1.1.1.1").usuario).toBe(
      clavesDeIntento("matias", "1.1.1.1").usuario,
    );
  });

  it("no explota con usuario o IP vacíos", () => {
    const k = clavesDeIntento("", "");
    expect(k.usuario).toBe("u:(vacio)|(sin-ip)");
    expect(k.ip).toBe("ip:(sin-ip)");
  });
});

describe("ipDeRequest", () => {
  it("toma la primera IP de x-forwarded-for", () => {
    const h = new Headers({ "x-forwarded-for": "203.0.113.7, 70.41.3.18" });
    expect(ipDeRequest(h)).toBe("203.0.113.7");
  });

  it("cae a x-real-ip y, si no hay nada, devuelve vacío", () => {
    expect(ipDeRequest(new Headers({ "x-real-ip": "203.0.113.9" }))).toBe("203.0.113.9");
    expect(ipDeRequest(new Headers())).toBe("");
  });
});
